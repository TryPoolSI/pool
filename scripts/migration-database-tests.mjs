import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "pg";
import { applyMigrations, migrateThenDeploy } from "./migrate.mjs";

export async function migrationDatabaseTests(status, sql) {
  assert.equal(status.API_URL, "http://127.0.0.1:55321");
  const url = new URL(status.DB_URL);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55322");
  const name = "pool_release_test";
  sql(`create database ${name};`);
  url.pathname = `/${name}`;
  const db = new Client({ connectionString: url.href });
  const migration = (version, statement) => ({ version, name: "test", sql: statement, digest: createHash("sha256").update(statement).digest("hex") });
  const first = migration("20261027000001", "create table public.release_fixture(id integer primary key);");
  const second = migration("20261027000002", "insert into public.release_fixture values(1); create table public.rollback_fixture(id integer); select definitely_missing_function();");
  try {
    await db.connect();
    await applyMigrations(db, [first]);
    await applyMigrations(db, [first]); // retries cannot duplicate application.
    let uploaded = false;
    await assert.rejects(migrateThenDeploy(() => applyMigrations(db, [first, second]), async () => {}, async () => { uploaded = true; }));
    assert.equal(uploaded, false);
    assert.equal((await db.query("select count(*)::int as n from public.release_fixture")).rows[0].n, 0);
    assert.equal((await db.query("select to_regclass('public.rollback_fixture') as name")).rows[0].name, null);
    assert.equal((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations")).rows[0].n, 1);
    await assert.rejects(applyMigrations(db, [{ ...first, digest: "changed" }]));
    await assert.rejects(applyMigrations(db, []));
    const fixed = migration(second.version, "insert into public.release_fixture values(1);");
    await applyMigrations(db, [first, fixed]);
    assert.equal((await db.query("select count(*)::int as n from public.release_fixture")).rows[0].n, 1);
    console.log("Transactional release migration checks passed: retry, checksum/history drift, failed-SQL rollback and no deployment after failure.");
  } finally {
    await db.end();
    sql(`drop database ${name};`);
  }
}
