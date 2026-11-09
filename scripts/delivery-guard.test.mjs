import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { releaseContext, validateSource } from "./delivery-guard.mjs";
import {
  auditProvider,
  deploymentArguments,
  validateSettings,
  verifyDeployment,
} from "./deliver.mjs";

const sha = "a".repeat(40);
const repo = { full_name: "owner/pool" };
function fixture(eventName = "pull_request") {
  const run = {
    id: 10,
    workflow_id: 20,
    path: ".github/workflows/ci.yml",
    event: eventName,
    run_attempt: 1,
    head_sha: sha,
    head_branch: eventName === "push" ? "main" : "feature",
    repository: repo,
    head_repository: repo,
    status: "completed",
    conclusion: "success",
    actor: { login: "owner" },
    triggering_actor: { login: "owner" },
  };
  const pr = {
    number: 1,
    state: "open",
    draft: false,
    head: { sha, ref: "feature", repo },
    base: { ref: "main", repo },
    user: { login: "owner" },
  };
  const data = {
    "/actions/runs/10": run,
    "/actions/workflows/ci.yml": { id: 20 },
    "/branches/main": { commit: { sha }, protected: true },
    "/actions/runs/10/jobs?per_page=100": {
      total_count: 3,
      jobs: ["web", "ios", "checks"].map((name) => ({
        name,
        conclusion: "success",
      })),
    },
    "/collaborators/owner/permission": { permission: "write" },
    [`/commits/${sha}/pulls?per_page=100`]: [pr],
    "/pulls/1": pr,
  };
  if (eventName === "push")
    Object.assign(pr, {
      state: "closed",
      merged_at: "2026-10-26",
      merge_commit_sha: sha,
    });
  return {
    run,
    pr,
    data,
    event: { repository: repo, workflow_run: structuredClone(run) },
    api: async (path) => {
      assert.ok(data[path], `Unexpected API request: ${path}`);
      return data[path];
    },
  };
}

test("delivery accepts current trusted PRs and checked merged main", async () => {
  for (const eventName of ["pull_request", "push"]) {
    const f = fixture(eventName);
    assert.deepEqual(await releaseContext(f.event, f.api), {
      target: eventName === "push" ? "production" : "preview",
      sha,
    });
  }
});

const denials = {
  "failed CI": (f) => {
    f.run.conclusion = "failure";
  },
  "skipped checks": (f) => {
    f.data["/actions/runs/10/jobs?per_page=100"].jobs[0].conclusion = "skipped";
  },
  "wrong workflow": (f) => {
    f.run.workflow_id = 99;
  },
  "old attempt": (f) => {
    f.run.run_attempt++;
  },
  fork: (f) => {
    f.run.head_repository = { full_name: "fork/pool" };
  },
  "untrusted actor": (f) => {
    f.data["/collaborators/owner/permission"].permission = "read";
  },
  "untrusted rerun actor": (f) => {
    f.run.triggering_actor = { login: "stranger" };
    f.data["/collaborators/stranger/permission"] = { permission: "read" };
  },
  "untrusted author": (f) => {
    f.pr.user = { login: "stranger" };
    f.data["/collaborators/stranger/permission"] = { permission: "read" };
  },
  "old PR revision": (f) => {
    f.pr.head.sha = "b".repeat(40);
  },
  "closed PR": (f) => {
    f.pr.state = "closed";
  },
  "draft PR": (f) => {
    f.pr.draft = true;
  },
  "wrong base": (f) => {
    f.pr.base = { ref: "other", repo };
  },
};
for (const [name, mutate] of Object.entries(denials)) {
  test(`delivery denies ${name}`, async () => {
    const f = fixture();
    mutate(f);
    await assert.rejects(releaseContext(f.event, f.api));
  });
}
for (const [name, mutate] of Object.entries({
  "direct main push": (f) => {
    f.pr.merged_at = null;
  },
  "stale queued main": (f) => {
    f.data["/branches/main"].commit.sha = "b".repeat(40);
  },
  "non-main push": (f) => {
    f.run.head_branch = "other";
  },
  "unprotected main": (f) => {
    f.data["/branches/main"].protected = false;
  },
})) {
  test(`production denies ${name}`, async () => {
    const f = fixture("push");
    mutate(f);
    await assert.rejects(releaseContext(f.event, f.api));
  });
}

function sourceGit({
  paths = ["package.json"],
  mode = "100644",
  diff = "",
  changedCI = false,
  authMail = false,
  backendDrift = "",
} = {}) {
  return (...args) => {
    if (args[0] === "fetch") return "";
    if (args[0] === "diff") return diff;
    if (args[0] === "ls-tree")
      return args.includes("--name-only")
        ? paths.join("\0")
        : `${mode} blob hash\tpackage.json`;
    if (args[0] === "show") {
      if (args[1].endsWith(":supabase/config.toml"))
        return (
          "foundation config\n" +
          (args[1].startsWith(`${sha}:`) && authMail
            ? readFileSync(
                new URL("../auth/email/local-config.toml", import.meta.url),
                "utf8",
              ) + backendDrift
            : "")
        );
      if (args[1].endsWith(":vercel.json"))
        return '{"git":{"deploymentEnabled":false}}';
      return changedCI && !args[1].startsWith("HEAD:")
        ? "tampered"
        : "trusted CI";
    }
    assert.fail("Unexpected git command");
  };
}
test("source allows canonical migrations but blocks alternate SQL, config drift and CI tampering", () => {
  validateSource(sha, sourceGit());
  validateSource(
    sha,
    sourceGit({
      paths: ["supabase/migrations/20261027000100_membership.sql"],
      diff: "supabase/migrations/20261027000100_membership.sql",
    }),
  );
  validateSource(
    sha,
    sourceGit({ diff: "supabase/config.toml", authMail: true }),
  );
  for (const options of [
    { paths: ["supabase/migrations/001.sql"] },
    { paths: ["db/change.SQL"] },
    { paths: ["supabase/schemas/current.sql"] },
    { diff: "supabase/config.toml" },
    {
      diff: "supabase/config.toml",
      authMail: true,
      backendDrift: "enable_confirmations = false",
    },
    { diff: "supabase/config.toml\nsupabase/seed.sql", authMail: true },
    { paths: [".env.local"] },
    { paths: ["sites/reference.html"] },
    { paths: ["vercel.ts"] },
    { paths: ["db/line\nbreak.sql"] },
    { paths: [".gitattributes"] },
    { mode: "120000" },
    { mode: "160000" },
    { changedCI: true },
  ])
    assert.throws(() => validateSource(sha, sourceGit(options)));
});

function settings(target = "preview") {
  const env = {
    DELIVERY_TARGET: target,
    TEST_SUPABASE_URL: `https://${"a".repeat(20)}.supabase.co`,
    PRODUCTION_SUPABASE_URL: `https://${"b".repeat(20)}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    TEST_VERCEL_PROJECT_ID: "prj_test",
    PRODUCTION_VERCEL_PROJECT_ID: "prj_production",
    TEST_VERCEL_ORG_ID: "team_test",
    PRODUCTION_VERCEL_ORG_ID: "team_production",
    VERCEL_TOKEN: "test-only-token",
    PRODUCTION_URL: "https://pool.example",
  };
  const prefix = target === "preview" ? "TEST" : "PRODUCTION";
  env.SUPABASE_URL = env[`${prefix}_SUPABASE_URL`];
  env.VERCEL_PROJECT_ID = env[`${prefix}_VERCEL_PROJECT_ID`];
  env.VERCEL_ORG_ID = env[`${prefix}_VERCEL_ORG_ID`];
  return env;
}
test("settings prevent missing settings, local URLs, target swaps and privileged keys", () => {
  for (const target of ["preview", "production"]) {
    const publicSettings = validateSettings(target, settings(target));
    assert.equal(Object.keys(publicSettings).length, 3);
    const args = deploymentArguments(
      target,
      sha,
      "prj_fixture",
      publicSettings,
    );
    assert.ok(
      args.includes(
        target === "production" ? "--skip-domain" : "--environment",
      ),
    );
    assert.ok(!args.join(" ").includes(settings(target).VERCEL_TOKEN));
  }
  assert.throws(() =>
    deploymentArguments("preview", sha, "prj_fixture", {
      VERCEL_TOKEN: "test-only-token",
    }),
  );
  for (const override of [
    { DELIVERY_TARGET: "production" },
    { TEST_SUPABASE_URL: settings().PRODUCTION_SUPABASE_URL },
    { SUPABASE_URL: "http://localhost:54321" },
    { SUPABASE_URL: settings().PRODUCTION_SUPABASE_URL },
    { TEST_SUPABASE_URL: "https://api.supabase.internal" },
    { SUPABASE_PUBLISHABLE_KEY: "sb_secret_fixture" },
    { SUPABASE_PUBLISHABLE_KEY: "eyJ.legacy-service-role.fixture" },
    { VERCEL_TOKEN: "" },
    { VERCEL_PROJECT_ID: "prj_production" },
    { VERCEL_ORG_ID: "team_production" },
    { TEST_VERCEL_ORG_ID: "team_production" },
  ])
    assert.throws(() =>
      validateSettings("preview", { ...settings(), ...override }),
    );
  assert.throws(() => validateSettings("arbitrary", settings()));
});

test("provider audit denies preview access to production, Git duplicates, wrong framework and injected secrets", async () => {
  for (const failure of [
    null,
    "production-access",
    "git",
    "framework",
    "secret",
    "inherited-secret",
    "inherited-mixup",
    "oidc",
    "system-env",
    "first-deploy",
    "wrong-key",
  ]) {
    const env = settings();
    const request = async (url) => {
      if (url.includes("prj_production"))
        return new Response("", {
          status: failure === "production-access" ? 200 : 403,
        });
      if (url.includes("/env?"))
        return Response.json({
          envs: [
            { key: failure === "secret" ? "SUPABASE_SECRET_KEY" : "PORT" },
          ],
        });
      if (url.includes("/env/pull/"))
        return Response.json({
          env:
            failure === "inherited-secret"
              ? { SUPABASE_SECRET_KEY: "test-only-secret" }
              : failure === "inherited-mixup"
                ? { EXPO_PUBLIC_SUPABASE_URL: env.PRODUCTION_SUPABASE_URL }
                : {},
        });
      if (url.includes("supabase.co"))
        return new Response("", {
          status: failure === "wrong-key" ? 401 : 200,
        });
      return Response.json({
        id: env.VERCEL_PROJECT_ID,
        accountId: env.VERCEL_ORG_ID,
        framework: failure === "framework" ? "nextjs" : "container",
        link: failure === "git" ? {} : null,
        oidcTokenConfig: { enabled: failure === "oidc" },
        autoExposeSystemEnvs: failure === "system-env",
        targets:
          failure === "first-deploy" ? {} : { production: { id: "baseline" } },
      });
    };
    if (failure) await assert.rejects(auditProvider("preview", env, request));
    else await auditProvider("preview", env, request);
  }
});

test("production origin must belong to the production project and target", async () => {
  const env = settings("production");
  for (const wrongDomain of [false, "wrong-host", "unverified"]) {
    const request = async (url) => {
      if (url.includes("/domains?")) {
        assert.ok(url.includes("production=true"));
        return Response.json({
          domains: [
            {
              verified: wrongDomain !== "unverified",
              name:
                wrongDomain === "wrong-host" ? "other.example" : "pool.example",
            },
          ],
        });
      }
      if (url.includes("/env?")) return Response.json({ envs: [] });
      if (url.includes("/env/pull/")) return Response.json({ env: {} });
      if (url.includes("supabase.co")) return new Response("");
      return Response.json({
        id: env.VERCEL_PROJECT_ID,
        accountId: env.VERCEL_ORG_ID,
        framework: "container",
        oidcTokenConfig: { enabled: false },
        autoExposeSystemEnvs: false,
      });
    };
    if (wrongDomain)
      await assert.rejects(auditProvider("production", env, request));
    else await auditProvider("production", env, request);
  }
});

test("deployment identity is verified before smoke or promotion", async () => {
  const env = settings();
  const deployment = {
    projectId: env.VERCEL_PROJECT_ID,
    url: "pool-release.vercel.app",
    readyState: "READY",
    meta: { releaseSha: sha },
    target: null,
  };
  const request = async () => Response.json(deployment);
  await verifyDeployment(
    "https://pool-release.vercel.app",
    "preview",
    sha,
    env,
    request,
  );
  for (const change of [
    { projectId: "prj_wrong" },
    { readyState: "BUILDING" },
    { meta: { releaseSha: "old" } },
    { target: "production" },
    { url: "wrong.vercel.app" },
  ]) {
    await assert.rejects(
      verifyDeployment(
        "https://pool-release.vercel.app",
        "preview",
        sha,
        env,
        async () => Response.json({ ...deployment, ...change }),
      ),
    );
  }
  await assert.rejects(
    verifyDeployment(
      "https://pool-release.vercel.app",
      "production",
      sha,
      env,
      request,
    ),
  );
});

test("workflow wiring keeps untrusted checks secretless and uses one non-cancelling release owner", () => {
  const { load } = createRequire(import.meta.url)("js-yaml");
  const ci = load(
    readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const deliveryText = readFileSync(
    new URL("../.github/workflows/delivery.yml", import.meta.url),
    "utf8",
  );
  const delivery = load(deliveryText);
  const releaseText = readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  const release = load(releaseText);
  assert.deepEqual(Object.keys(ci.on), ["pull_request", "push"]);
  assert.ok(
    ci.on.pull_request.branches.includes("lkluge/auth-session-flow"),
    "R3 stacked base runs mandatory checks",
  );
  assert.ok(
    ci.on.pull_request.branches.includes("lkluge/family-circle-membership"),
    "R4 stacked base runs mandatory checks",
  );
  assert.ok(
    ci.on.pull_request.branches.includes("lkluge/driver-confirmation"),
    "R6 stacked base runs mandatory checks",
  );
  assert.ok(!JSON.stringify(ci).includes("secrets."));
  assert.equal(
    ci.jobs.web.steps.find((step) =>
      step.uses?.startsWith("actions/setup-node"),
    ).with["node-version-file"],
    ".nvmrc",
  );
  assert.equal(
    ci.jobs.web.steps.find((step) =>
      step.uses?.startsWith("docker/setup-compose-action"),
    ).with.version,
    "v2.40.3",
  );
  for (const command of [
    "npm ci",
    "npm run check",
    "bash scripts/validate-compose.sh",
    "bash scripts/container-smoke.sh",
  ]) {
    assert.ok(ci.jobs.web.steps.some((step) => step.run === command));
  }
  assert.deepEqual(ci.jobs.checks.needs, ["web", "ios"]);
  assert.ok(
    ci.jobs.ios.steps.some(
      (step) => step.run === "node scripts/ios-test.mjs --smoke",
    ),
  );
  assert.deepEqual(delivery.on, {
    workflow_run: { workflows: ["CI"], types: ["completed"] },
  });
  // Invalid CI completions never enter the lock or replace a pending main run.
  assert.equal(delivery.concurrency, undefined);
  assert.equal(delivery.jobs.release.needs, "gate");
  assert.equal(delivery.jobs.release.uses, "./.github/workflows/release.yml");
  assert.equal(release.concurrency["cancel-in-progress"], false);
  assert.equal(release.concurrency.queue, "max");
  assert.deepEqual(Object.keys(release.on), ["workflow_call"]);
  assert.equal(release.jobs.test.environment, "preview");
  assert.equal(release.jobs.production.environment, "production");
  assert.equal(release.jobs.production.needs, "test");
  assert.match(release.jobs.production.if, /target == 'production'/);
  assert.match(release.jobs.test.if, /workflow_run/);
  assert.match(delivery.jobs.gate.if, /DELIVERY_ENABLED/);
  assert.ok(
    !/pull_request_target|download-artifact|cache@/.test(
      deliveryText + releaseText,
    ),
  );
  for (const job of [delivery.jobs.gate, ...Object.values(release.jobs)]) {
    const checkout = job.steps.find((step) =>
      step.uses?.startsWith("actions/checkout"),
    );
    assert.equal(checkout.with.ref, "${{ github.workflow_sha }}");
    assert.equal(checkout.with["persist-credentials"], false);
    for (const step of job.steps.filter((step) => step.uses))
      assert.match(step.uses, /@[a-f0-9]{40}$/);
  }
  assert.ok(
    ci.jobs.web.steps.some((step) =>
      step.run?.includes("scripts/verify-vercel-cli.mjs"),
    ),
  );
});
