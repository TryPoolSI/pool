import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function requireThat(condition, message) {
  assert.ok(condition, message);
}

export async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(15_000),
    },
  );
  requireThat(
    response.ok,
    `GitHub verification failed (HTTP ${response.status})`,
  );
  return response.json();
}

export async function releaseContext(event, api = github) {
  const repository = event.repository.full_name;
  const trigger = event.workflow_run;
  requireThat(
    trigger?.id && ["push", "pull_request"].includes(trigger.event),
    "Only CI push/PR events can deliver",
  );
  const [run, workflow, main, jobs] = await Promise.all([
    api(`/actions/runs/${trigger.id}`),
    api("/actions/workflows/ci.yml"),
    api("/branches/main"),
    api(`/actions/runs/${trigger.id}/jobs?per_page=100`),
  ]);
  requireThat(
    run.repository.full_name === repository &&
      run.head_repository.full_name === repository,
    "Forks cannot deliver",
  );
  requireThat(
    run.workflow_id === workflow.id && run.path === ".github/workflows/ci.yml",
    "Delivery requires the canonical CI workflow",
  );
  requireThat(
    run.status === "completed" &&
      run.conclusion === "success" &&
      run.run_attempt === trigger.run_attempt &&
      run.head_sha === trigger.head_sha &&
      run.event === trigger.event,
    "CI must be successful at the current attempt and revision",
  );
  requireThat(
    jobs.total_count === jobs.jobs.length &&
      jobs.jobs.length === 3 &&
      ["web", "ios", "checks"].every(
        (name) =>
          jobs.jobs.filter(
            (job) => job.name === name && job.conclusion === "success",
          ).length === 1,
      ),
    "Required checks did not pass",
  );
  requireThat(/^[a-f0-9]{40}$/.test(run.head_sha), "Invalid release revision");
  for (const login of new Set([run.actor.login, run.triggering_actor.login])) {
    const permission = await api(
      `/collaborators/${encodeURIComponent(login)}/permission`,
    );
    requireThat(
      ["admin", "maintain", "write"].includes(permission.permission),
      "CI actor is not trusted to deliver",
    );
  }
  const pulls = await api(`/commits/${run.head_sha}/pulls?per_page=100`);
  if (run.event === "push") {
    requireThat(
      run.head_branch === "main" && main.commit.sha === run.head_sha,
      "Production requires current main",
    );
    requireThat(main.protected, "Protect main before enabling delivery");
    requireThat(
      pulls.some(
        (pr) =>
          pr.merged_at &&
          pr.merge_commit_sha === run.head_sha &&
          pr.base.ref === "main" &&
          pr.base.repo.full_name === repository,
      ),
      "Production requires a merged PR, not a direct push",
    );
    return { target: "production", sha: run.head_sha };
  }
  const candidates = pulls.filter(
    (pr) =>
      pr.state === "open" &&
      !pr.draft &&
      pr.head.sha === run.head_sha &&
      pr.head.ref === run.head_branch &&
      pr.head.repo?.full_name === repository &&
      pr.base.ref === "main" &&
      pr.base.repo.full_name === repository,
  );
  requireThat(
    candidates.length === 1,
    "Preview requires one current, non-draft, same-repository PR to main",
  );
  const pr = await api(`/pulls/${candidates[0].number}`);
  requireThat(
    pr.state === "open" &&
      !pr.draft &&
      pr.head.sha === run.head_sha &&
      pr.head.repo?.full_name === repository &&
      pr.base.ref === "main",
    "Preview PR is stale or untrusted",
  );
  const author = await api(
    `/collaborators/${encodeURIComponent(pr.user.login)}/permission`,
  );
  requireThat(
    ["admin", "maintain", "write"].includes(author.permission),
    "PR author is not trusted to deliver",
  );
  return { target: "preview", sha: run.head_sha };
}

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

export function validateSource(sha, runGit = git) {
  requireThat(/^[a-f0-9]{40}$/.test(sha), "Invalid source revision");
  runGit("fetch", "--no-tags", "origin", sha);
  const entries = runGit("ls-tree", "-rz", sha).split("\0").filter(Boolean);
  requireThat(
    entries.every(
      (line) => line.startsWith("100644 ") || line.startsWith("100755 "),
    ),
    "Delivery source cannot contain symlinks or submodules",
  );
  const paths = runGit("ls-tree", "-rz", "--name-only", sha)
    .split("\0")
    .filter(Boolean);
  requireThat(
    !paths.some(
      (path) =>
        /\.sql($|\.)|(^|\/)(migrations|schemas)(\/|$)/i.test(path) &&
        !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(path),
    ),
    "SQL must use the reviewed versioned migration directory",
  );
  const foundation = "343f5abd59c77d3d6f06a542557b329c464177c0";
  const backendChanges = runGit(
    "diff",
    "--name-only",
    foundation,
    sha,
    "--",
    "supabase",
  )
    .trim()
    .split("\n")
    .filter(
      (path) =>
        path && !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(path),
    )
    .join("\n");
  if (backendChanges) {
    // Only versioned SQL is newly eligible. Retain the exact R2 Auth config.
    const mailConfig = readFileSync(
      new URL("../auth/email/local-config.toml", import.meta.url),
      "utf8",
    );
    requireThat(
      backendChanges === "supabase/config.toml" &&
        runGit("show", `${sha}:supabase/config.toml`) ===
          runGit("show", `${foundation}:supabase/config.toml`) + mailConfig,
      "Unexpected Supabase configuration change",
    );
  }
  requireThat(
    !paths.some(
      (path) =>
        /^(sites|exports|\.vercel|\.aws|\.codex|\.agents)\//.test(path) ||
        (/(^|\/)\.env/.test(path) && path !== ".env.example"),
    ),
    "Private/local files cannot be delivered",
  );
  requireThat(
    !paths.some((path) =>
      /^(vercel\.(ts|js|mjs|cjs|toml)|now\.json)$/.test(path),
    ),
    "Alternate/programmatic Vercel config cannot execute in the credential-bearing CLI",
  );
  requireThat(
    !paths.some((path) => /(^|\/)\.gitattributes$/.test(path)),
    "Archive attributes cannot alter or omit the checked source during upload",
  );
  requireThat(
    runGit("show", `${sha}:vercel.json`) === runGit("show", "HEAD:vercel.json"),
    "Vercel delivery configuration must match the trusted workflow revision",
  );
  requireThat(
    JSON.parse(runGit("show", `${sha}:vercel.json`)).git?.deploymentEnabled ===
      false,
    "Automatic Git deployments must be disabled",
  );
  requireThat(
    runGit("show", `${sha}:.github/workflows/ci.yml`) ===
      runGit("show", "HEAD:.github/workflows/ci.yml"),
    "Preview CI workflow changes must merge before delivery",
  );
  requireThat(
    runGit("show", `${sha}:.vercelignore`) ===
      runGit("show", "HEAD:.vercelignore"),
    "Upload ignore rules must match the trusted workflow revision",
  );
}

export async function guard() {
  requireThat(
    process.env.GITHUB_EVENT_NAME === "workflow_run",
    "Delivery only runs after CI",
  );
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
  requireThat(
    event.repository.full_name === process.env.GITHUB_REPOSITORY,
    "Wrong workflow repository",
  );
  const context = await releaseContext(event);
  validateSource(context.sha);
  return context;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const context = await guard();
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `target=${context.target}\nsha=${context.sha}\n`,
  );
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `Review this exact revision before approving the environment: ${context.sha} (${context.target})\n`,
    );
}
