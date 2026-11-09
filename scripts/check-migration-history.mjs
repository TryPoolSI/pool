import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { readMigrations } from "./migrate.mjs";
import { requireThat } from "./delivery-guard.mjs";

export function checkMigrationHistory(base, head, git) {
  const previous = readMigrations(base, git);
  const current = readMigrations(head, git);
  requireThat(previous.length <= current.length && previous.every((migration, i) =>
    migration.version === current[i].version && migration.digest === current[i].digest && migration.name === current[i].name),
  "Inherited migrations are immutable; append a new forward migration");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  checkMigrationHistory(process.env.MIGRATION_BASE_SHA, head);
  console.log("Inherited migration history is unchanged.");
}
