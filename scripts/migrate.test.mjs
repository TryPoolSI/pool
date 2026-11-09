import assert from "node:assert/strict";
import test from "node:test";
import { auditMigrationReview, containsTransactionControl, migrationConnection, migrateThenDeploy, readMigrations } from "./migrate.mjs";
import { checkMigrationHistory } from "./check-migration-history.mjs";

function settings(target = "preview") {
  const testUrl = `https://${"a".repeat(20)}.supabase.co`;
  const prodUrl = `https://${"b".repeat(20)}.supabase.co`;
  const project = (target === "preview" ? "a" : "b").repeat(20);
  return { DELIVERY_TARGET: target, SUPABASE_URL: target === "preview" ? testUrl : prodUrl,
    TEST_SUPABASE_URL: testUrl, PRODUCTION_SUPABASE_URL: prodUrl,
    MIGRATION_DATABASE_URL: `postgresql://postgres:fixture-password@db.${project}.supabase.co:5432/postgres` };
}
test("migrations fail closed without independent protected-environment review", async () => {
  const valid = { protection_rules: [{ type: "required_reviewers", prevent_self_review: true, reviewers: [{ reviewer: { id: 1 } }] }] };
  await auditMigrationReview("preview", async () => valid);
  for (const environment of [{}, { protection_rules: [] }, { protection_rules: [{ ...valid.protection_rules[0], prevent_self_review: false }] }])
    await assert.rejects(auditMigrationReview("production", async () => environment));
});
test("migration connections are isolated, hosted, verified-TLS session connections", () => {
  for (const target of ["preview", "production"]) assert.equal(migrationConnection(target, settings(target)).ssl.rejectUnauthorized, true);
  const env = settings();
  assert.ok(migrationConnection("preview", { ...env, MIGRATION_DATABASE_URL: `postgresql://postgres.${"a".repeat(20)}:fixture@aws-0-us-east-1.pooler.supabase.com:5432/postgres` }));
  for (const patch of [
    { DELIVERY_TARGET: "production" }, { TEST_SUPABASE_URL: env.PRODUCTION_SUPABASE_URL },
    { MIGRATION_DATABASE_URL: settings("production").MIGRATION_DATABASE_URL },
    { MIGRATION_DATABASE_URL: "postgresql://postgres:fixture@localhost:5432/postgres" },
    { MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL + "?sslmode=disable" },
    { MIGRATION_DATABASE_URL: env.MIGRATION_DATABASE_URL.replace(":5432", ":6543") },
    { MIGRATION_DATABASE_URL: "" },
  ]) assert.throws(() => migrationConnection("preview", { ...env, ...patch }));
});
test("a failed migration or stale release prevents all app upload; success is ordered", async () => {
  for (const failure of ["migration", "stale", null]) {
    const events = [];
    const promise = migrateThenDeploy(async () => { events.push("migrate"); if (failure === "migration") throw new Error("failure"); },
      async () => { events.push("fresh"); if (failure === "stale") throw new Error("stale"); }, async () => { events.push("upload"); });
    if (failure) await assert.rejects(promise); else await promise;
    assert.deepEqual(events, failure === "migration" ? ["migrate"] : failure === "stale" ? ["migrate", "fresh"] : ["migrate", "fresh", "upload"]);
  }
});
test("migration source uses unique versions, checksums and executor-owned transactions", () => {
  const sha = "a".repeat(40);
  const path = "supabase/migrations/20261027000100_membership.sql";
  const git = (sql, paths = [path]) => (...args) => args[0] === "ls-tree" ? paths.join("\0") : sql;
  const [migration] = readMigrations(sha, git("select 1;"));
  assert.equal(migration.version, "20261027000100");
  assert.match(migration.digest, /^[a-f0-9]{64}$/);
  assert.throws(() => readMigrations(sha, git("commit;")));
  assert.throws(() => readMigrations(sha, git("select 1;", [path, path.replace("membership", "duplicate")])));
  assert.throws(() => readMigrations(sha, git("select 1;", ["supabase/migrations/bad.sql"])));
});
test("transaction controls are rejected outside quoted function bodies and comments", () => {
  for (const sql of ["select 1; COMMIT;", "/* outer /* inner */ comment */ BEGIN;", "-- comment\nROLLBACK;", "ABORT;", "END;", "PREPARE TRANSACTION 'x';"])
    assert.equal(containsTransactionControl(sql), true);
  for (const sql of ["create function f() returns void language plpgsql as $body$ begin perform 1; end; $body$;", "select 'commit;';", 'select "commit";', "/* commit; */ select 1;"])
    assert.equal(containsTransactionControl(sql), false);
});
test("inherited migration history cannot be edited, reordered or deleted", () => {
  const base = "a".repeat(40), head = "b".repeat(40);
  const paths = ["supabase/migrations/20261027000001_first.sql", "supabase/migrations/20261027000002_next.sql"];
  function git({ changed = false, deleted = false, reordered = false } = {}) {
    return (...args) => {
      if (args[0] === "ls-tree") return args[3] === base ? paths[0] : (deleted ? [] : reordered ? paths.slice(1) : paths).join("\0");
      return changed && args[1].startsWith(head) ? "select 2;" : "select 1;";
    };
  }
  checkMigrationHistory(base, head, git());
  for (const options of [{ changed: true }, { deleted: true }, { reordered: true }]) assert.throws(() => checkMigrationHistory(base, head, git(options)));
});
