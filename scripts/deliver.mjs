import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { guard, requireThat } from "./delivery-guard.mjs";
import { smoke } from "./smoke.mjs";
import {
  migrateRelease,
  migrateThenDeploy,
  readMigrations,
} from "./migrate.mjs";

export function validateSettings(target, env) {
  requireThat(
    ["preview", "production"].includes(target) &&
      env.DELIVERY_TARGET === target,
    "Delivery target does not match the protected environment",
  );
  const projectUrl = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/;
  requireThat(
    projectUrl.test(env.TEST_SUPABASE_URL) &&
      projectUrl.test(env.PRODUCTION_SUPABASE_URL) &&
      env.TEST_SUPABASE_URL !== env.PRODUCTION_SUPABASE_URL,
    "Configure distinct hosted test and production Supabase URLs",
  );
  const prefix = target === "preview" ? "TEST" : "PRODUCTION";
  requireThat(
    env.SUPABASE_URL === env[`${prefix}_SUPABASE_URL`],
    "Supabase project does not match delivery target",
  );
  requireThat(
    /^sb_publishable_[A-Za-z0-9_-]+$/.test(env.SUPABASE_PUBLISHABLE_KEY || ""),
    "Delivery requires a modern public Supabase publishable key",
  );
  requireThat(
    /^prj_[A-Za-z0-9]+$/.test(env.TEST_VERCEL_PROJECT_ID || "") &&
      /^prj_[A-Za-z0-9]+$/.test(env.PRODUCTION_VERCEL_PROJECT_ID || "") &&
      env.TEST_VERCEL_PROJECT_ID !== env.PRODUCTION_VERCEL_PROJECT_ID,
    "Configure distinct Vercel projects",
  );
  requireThat(
    env.TEST_VERCEL_ORG_ID &&
      env.PRODUCTION_VERCEL_ORG_ID &&
      env.TEST_VERCEL_ORG_ID !== env.PRODUCTION_VERCEL_ORG_ID,
    "Use separate Vercel scopes so the preview token cannot access production",
  );
  requireThat(
    env.VERCEL_PROJECT_ID === env[`${prefix}_VERCEL_PROJECT_ID`] &&
      env.VERCEL_ORG_ID === env[`${prefix}_VERCEL_ORG_ID`],
    "Vercel project/scope does not match delivery target",
  );
  requireThat(env.VERCEL_TOKEN, "Missing environment-scoped Vercel token");
  if (target === "production") {
    const url = new URL(env.PRODUCTION_URL);
    requireThat(
      url.protocol === "https:" && url.origin === env.PRODUCTION_URL,
      "Configure the production HTTPS origin without a path",
    );
  }
  return {
    EXPO_PUBLIC_SUPABASE_URL: env.SUPABASE_URL,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY,
    PORT: "3000",
  };
}

export async function auditProvider(target, env, request = fetch) {
  async function vercel(path) {
    return request(`https://api.vercel.com${path}`, {
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    });
  }
  if (target === "preview") {
    const denied = await vercel(
      `/v9/projects/${env.PRODUCTION_VERCEL_PROJECT_ID}?teamId=${encodeURIComponent(env.PRODUCTION_VERCEL_ORG_ID)}`,
    );
    requireThat(
      [403, 404].includes(denied.status),
      "Preview token must be denied access to the production Vercel scope",
    );
  }
  const query = `?teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`;
  const projectResponse = await vercel(
    `/v9/projects/${env.VERCEL_PROJECT_ID}${query}`,
  );
  requireThat(projectResponse.ok, "Cannot verify Vercel project");
  const project = await projectResponse.json();
  requireThat(
    project.id === env.VERCEL_PROJECT_ID &&
      project.accountId === env.VERCEL_ORG_ID &&
      project.framework === "container" &&
      !project.link,
    "Vercel must use Container with its Git integration disconnected",
  );
  requireThat(
    project.oidcTokenConfig?.enabled === false &&
      project.autoExposeSystemEnvs === false,
    "Disable project OIDC tokens and automatic system-variable exposure for credential-free container builds",
  );
  // Avoid the Vercel first-deployment production special case for previews.
  requireThat(
    target === "production" || project.targets?.production?.id,
    "Bootstrap a checked test baseline before enabling automatic previews",
  );
  const variablesResponse = await vercel(
    `/v10/projects/${env.VERCEL_PROJECT_ID}/env${query}`,
  );
  requireThat(
    variablesResponse.ok,
    "Cannot audit Vercel environment variables",
  );
  const { envs } = await variablesResponse.json();
  requireThat(
    Array.isArray(envs) &&
      envs.every((variable) =>
        [
          "EXPO_PUBLIC_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
          "PORT",
        ].includes(variable.key),
      ),
    "Remove non-public project/shared variables before delivery; release credentials must never reach remote builds",
  );
  // Resolve inherited/shared values too. Never log this credential-bearing response.
  const effectiveResponse = await vercel(
    `/v3/env/pull/${env.VERCEL_PROJECT_ID}/${target}${query}`,
  );
  requireThat(
    effectiveResponse.ok,
    "Cannot audit the resolved Vercel environment",
  );
  const effective = (await effectiveResponse.json()).env;
  const publicSettings = validateSettings(target, env);
  requireThat(
    effective &&
      typeof effective === "object" &&
      !Array.isArray(effective) &&
      Object.entries(effective).every(
        ([key, value]) =>
          Object.hasOwn(publicSettings, key) && value === publicSettings[key],
      ),
    "Resolved Vercel variables must contain only matching public settings; remove inherited secrets and overrides",
  );
  if (target === "production") {
    const domainsResponse = await vercel(
      `/v9/projects/${env.VERCEL_PROJECT_ID}/domains${query}&limit=100&production=true`,
    );
    requireThat(
      domainsResponse.ok,
      "Cannot verify production domain ownership",
    );
    const { domains } = await domainsResponse.json();
    requireThat(
      domains?.some(
        (domain) =>
          domain.verified === true &&
          domain.name === new URL(env.PRODUCTION_URL).hostname &&
          !domain.redirect &&
          !domain.gitBranch &&
          !domain.customEnvironmentId,
      ),
      "Production origin must be a non-redirecting production domain of the selected project",
    );
  }
  const auth = await request(`${env.SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(15_000),
  });
  requireThat(
    auth.ok,
    "Public key was not accepted by the selected Supabase project (not a database readiness check)",
  );
}

export async function verifyDeployment(url, target, sha, env, request = fetch) {
  requireThat(
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url),
    "Unexpected deployment URL",
  );
  const hostname = new URL(url).hostname;
  const response = await request(
    `https://api.vercel.com/v13/deployments/${hostname}?teamId=${encodeURIComponent(env.VERCEL_ORG_ID)}`,
    {
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  requireThat(response.ok, "Cannot verify uploaded deployment");
  const deployment = await response.json();
  requireThat(
    deployment.projectId === env.VERCEL_PROJECT_ID &&
      deployment.url === hostname &&
      deployment.readyState === "READY" &&
      deployment.meta?.releaseSha === sha &&
      (target === "production"
        ? deployment.target === "production"
        : [null, "preview"].includes(deployment.target)),
    "Deployment identity, target, revision or readiness does not match the release",
  );
}

export function deploymentArguments(target, sha, projectId, settings) {
  requireThat(
    ["preview", "production"].includes(target),
    "Invalid CLI deployment target",
  );
  const args = [
    "deploy",
    "--yes",
    "--project",
    projectId,
    "--meta",
    `releaseSha=${sha}`,
  ];
  if (target === "production") args.push("--prod", "--skip-domain");
  else args.push("--environment", "preview");
  for (const [key, value] of Object.entries(settings)) {
    requireThat(
      [
        "EXPO_PUBLIC_SUPABASE_URL",
        "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "PORT",
      ].includes(key),
      "Only public settings may enter the CLI deployment environment",
    );
    args.push("--env", `${key}=${value}`);
    if (key !== "PORT") args.push("--build-env", `${key}=${value}`);
  }
  return args;
}

async function deliver(target) {
  const env = process.env;
  const settings = validateSettings(target, env);
  async function fresh() {
    const context = await guard();
    requireThat(
      context.sha === env.RELEASE_SHA &&
        (target === "preview" || context.target === "production"),
      "Release is stale or cannot select production",
    );
  }
  await fresh();
  await auditProvider(target, env);
  const control = mkdtempSync(join(tmpdir(), "pool-delivery-"));
  const source = join(control, "source");
  mkdirSync(source);
  try {
    // Never execute candidate scripts on a runner with deployment credentials.
    const archive = execFileSync("git", ["archive", env.RELEASE_SHA], {
      maxBuffer: 20 * 1024 * 1024,
    });
    execFileSync("tar", ["-x", "-C", source], { input: archive });
    const cli = join(
      env.RUNNER_TEMP,
      "vercel-cli/node_modules/vercel/dist/index.js",
    );
    const cliEnv = {
      PATH: env.PATH,
      CI: "1",
      VERCEL_ORG_ID: env.VERCEL_ORG_ID,
      VERCEL_PROJECT_ID: env.VERCEL_PROJECT_ID,
      VERCEL_TELEMETRY_DISABLED: "1",
    };
    function vercel(args) {
      try {
        return execFileSync(
          process.execPath,
          [
            cli,
            ...args,
            "--token",
            env.VERCEL_TOKEN,
            "--scope",
            env.VERCEL_ORG_ID,
            "--global-config",
            join(control, "cli-config"),
            "--local-config",
            resolve("vercel.json"),
          ],
          {
            cwd: source,
            env: cliEnv,
            encoding: "utf8",
            timeout: 20 * 60 * 1000,
            stdio: ["ignore", "pipe", "pipe"],
            maxBuffer: 2 * 1024 * 1024,
          },
        ).trim();
      } catch {
        throw new Error(
          "Vercel delivery failed; inspect the provider dashboard (credential-bearing output suppressed)",
        );
      }
    }
    await fresh();
    const args = deploymentArguments(
      target,
      env.RELEASE_SHA,
      env.VERCEL_PROJECT_ID,
      settings,
    );
    const deploymentUrl = await migrateThenDeploy(
      () => migrateRelease(target, env, readMigrations(env.RELEASE_SHA)),
      fresh,
      () => vercel(args),
    );
    await verifyDeployment(deploymentUrl, target, env.RELEASE_SHA, env);
    await smoke(deploymentUrl, {
      bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
    });
    await fresh();
    if (target === "production") {
      vercel(["promote", deploymentUrl, "--yes"]);
      await smoke(env.PRODUCTION_URL, {
        bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET || "",
      });
    }
    if (env.GITHUB_STEP_SUMMARY)
      appendFileSync(
        env.GITHUB_STEP_SUMMARY,
        `${target}: ${env.RELEASE_SHA}\n\nVerified deployment: ${deploymentUrl}\n`,
      );
  } finally {
    rmSync(control, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await deliver(process.argv[2]);
}
