import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { github, requireThat } from "./delivery-guard.mjs";

export async function auditMigrationReview(target, api = github) {
  requireThat(["preview", "production"].includes(target), "Invalid migration review environment");
  const environment = await api(`/environments/${target}`);
  const rule = environment.protection_rules?.find((entry) => entry.type === "required_reviewers");
  requireThat(rule?.prevent_self_review === true && rule.reviewers?.some((reviewer) => reviewer.reviewer?.id),
    "Reviewed migrations require protected environment approval with self-review disabled");
}

export const migrationPath = /^supabase\/migrations\/(\d{14})_([a-z0-9_]+)\.sql$/;
export function containsTransactionControl(sql) {
  let structure = "";
  for (let i = 0; i < sql.length;) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i); i = end < 0 ? sql.length : end + 1; structure += " ";
    } else if (sql.startsWith("/*", i)) {
      let depth = 1; i += 2;
      while (i < sql.length && depth) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      structure += " ";
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      const escaped = quote === "'" && /(?:^|\W)[eE]$/.test(sql.slice(Math.max(0, i - 2), i));
      i++;
      while (i < sql.length) {
        if (escaped && sql[i] === "\\") i += 2;
        else if (sql[i] === quote && sql[i + 1] === quote) i += 2;
        else if (sql[i++] === quote) break;
      }
      structure += " value ";
    } else if (sql[i] === "$" && /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.test(sql.slice(i))) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))[0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end < 0 ? sql.length : end + tag.length; structure += " body ";
    } else structure += sql[i++];
  }
  return /(?:^|;)\s*(?:begin|commit|rollback|abort|end|start\s+transaction|prepare\s+transaction)\b/i.test(structure);
}
export function readMigrations(sha, git = (...args) => execFileSync("git", args, { encoding: "utf8" })) {
  requireThat(/^[a-f0-9]{40}$/.test(sha), "Invalid migration revision");
  const paths = git("ls-tree", "-rz", "--name-only", sha, "--", "supabase/migrations").split("\0").filter(Boolean).sort();
  const seen = new Set();
  return paths.map((path) => {
    const match = migrationPath.exec(path);
    requireThat(match && !seen.has(match[1]), "Use unique timestamped SQL migration files");
    seen.add(match[1]);
    const sql = git("show", `${sha}:${path}`);
    // This executor owns transaction boundaries, not the migration file.
    requireThat(sql.trim() && !containsTransactionControl(sql), "Migrations cannot control release transactions");
    return { version: match[1], name: match[2], sql, digest: createHash("sha256").update(sql).digest("hex") };
  });
}

export function migrationConnection(target, env) {
  requireThat(["preview", "production"].includes(target) && env.DELIVERY_TARGET === target, "Wrong migration environment");
  const project = new URL(env.SUPABASE_URL).hostname.split(".")[0];
  requireThat(env.SUPABASE_URL === env[target === "preview" ? "TEST_SUPABASE_URL" : "PRODUCTION_SUPABASE_URL"] &&
    env.TEST_SUPABASE_URL !== env.PRODUCTION_SUPABASE_URL && /^[a-z0-9]{20}$/.test(project), "Migration target isolation failed");
  let url;
  try { url = new URL(env.MIGRATION_DATABASE_URL); } catch { throw new Error("Configure the protected environment's migration connection"); }
  const direct = url.hostname === `db.${project}.supabase.co` && decodeURIComponent(url.username) === "postgres";
  const sessionPool = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && decodeURIComponent(url.username) === `postgres.${project}`;
  requireThat(["postgres:", "postgresql:"].includes(url.protocol) && (direct || sessionPool) &&
    url.port === "5432" && url.pathname === "/postgres" && url.password && !url.search && !url.hash,
  "Migration connection must use the selected hosted project, port 5432 and verified TLS");
  return { connectionString: url.href, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15_000 };
}

// Supabase-compatible history plus a private checksum ledger. No reset/seed,
// candidate scripts, config, psql substitution or credentials in build settings.
export async function applyMigrations(db, migrations) {
  await db.query("select pg_advisory_lock(734221, 3)");
  try {
    await db.query("set lock_timeout = '60s'");
    await db.query("set statement_timeout = '120s'");
    await db.query(`create schema if not exists supabase_migrations;
      create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
      create schema if not exists pool_delivery;
      revoke all on schema pool_delivery from public, anon, authenticated;
      create table if not exists pool_delivery.migration_digests (version text primary key, digest text not null, applied_at timestamptz not null default now());
      revoke all on pool_delivery.migration_digests from public, anon, authenticated;`);
    const { rows } = await db.query(`select m.version, d.digest from supabase_migrations.schema_migrations m
      left join pool_delivery.migration_digests d using(version) order by m.version`);
    const ledger = await db.query("select count(*)::int as count from pool_delivery.migration_digests");
    requireThat(ledger.rows[0].count === rows.length && rows.length <= migrations.length && rows.every((row, i) => row.version === migrations[i].version && row.digest === migrations[i].digest),
      "Hosted migration history differs from reviewed source; stop and reconcile with a forward fix");
    for (const migration of migrations.slice(rows.length)) {
      await db.query("begin");
      try {
        await db.query(migration.sql);
        await db.query("insert into supabase_migrations.schema_migrations(version, name, statements) values($1,$2,$3)", [migration.version, migration.name, [migration.sql]]);
        await db.query("insert into pool_delivery.migration_digests(version,digest) values($1,$2)", [migration.version, migration.digest]);
        await db.query("commit");
      } catch {
        await db.query("rollback");
        throw new Error(`Migration ${migration.version} failed; deployment stopped (database output suppressed)`);
      }
    }
    const verified = await db.query("select count(*)::int as count from pool_delivery.migration_digests");
    requireThat(verified.rows[0].count === migrations.length, "Migration verification failed");
  } finally {
    await db.query("select pg_advisory_unlock(734221, 3)");
  }
}

export async function migrateRelease(target, env, migrations) {
  await auditMigrationReview(target);
  const settings = migrationConnection(target, env);
  // Load only the pinned tool installed from the trusted workflow, never the
  // candidate's node_modules or a migration-supplied program.
  const require = createRequire(join(env.RUNNER_TEMP, "migration-tool/package.json"));
  const { Client } = require("pg");
  const db = new Client(settings);
  try {
    await db.connect();
    await applyMigrations(db, migrations);
  } catch {
    throw new Error("Reviewed database migrations failed; deployment stopped. Inspect the database privately and use a forward fix.");
  } finally { await db.end(); }
}

export async function migrateThenDeploy(migrate, fresh, deploy) {
  await migrate();
  await fresh();
  return deploy();
}
