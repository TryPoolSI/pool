import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: "inherit", ...options });
}
function timed(label, action) {
  const started = performance.now();
  console.log(`Starting ${label}.`);
  try {
    return action();
  } finally {
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`${label} took ${seconds}s.`);
  }
}
function hasReusableCIProject() {
  const required = [
    "ios/.xcode.env",
    "ios/Pool/AppDelegate.swift",
    "ios/Pool.xcodeproj/project.pbxproj",
    "ios/Pool.xcworkspace/contents.xcworkspacedata",
    "ios/Podfile",
    "ios/Podfile.lock",
    "ios/Pods/Manifest.lock",
    "ios/Pods/Pods.xcodeproj/project.pbxproj",
    "ios/build/generated/autolinking/autolinking.json",
    "ios/build/generated/ios/ReactCodegen/ReactCodegen.podspec",
    "ios/build/generated/ios/ReactAppDependencyProvider/ReactAppDependencyProvider.podspec",
    "ios/build/rncore-facades",
    "ios/build/rndeps-facades",
  ];
  return (
    required.every((path) => existsSync(path)) &&
    readFileSync("ios/Podfile.lock").equals(
      readFileSync("ios/Pods/Manifest.lock"),
    )
  );
}
function buildSimulator(args, ciSmoke) {
  timed("Xcode Release build", () => {
    if (!ciSmoke) {
      run("xcodebuild", ["-quiet", ...args]);
      return;
    }
    const log = resolve("test-results/ios/xcodebuild.log");
    mkdirSync(resolve("test-results/ios"), { recursive: true });
    console.log(`Full Xcode build output will be retained in ${log}.`);
    const output = openSync(log, "w");
    try {
      run("xcodebuild", ["-showBuildTimingSummary", ...args], {
        stdio: ["ignore", output, output],
      });
    } finally {
      closeSync(output);
    }
  });
}
function diagnostics(device) {
  const output = resolve("test-results/ios");
  mkdirSync(output, { recursive: true });
  spawnSync(
    "xcrun",
    ["simctl", "io", device, "screenshot", join(output, "screen.png")],
    { timeout: 15000 },
  );
  const logs = spawnSync(
    "xcrun",
    [
      "simctl",
      "spawn",
      device,
      "log",
      "show",
      "--last",
      "10m",
      "--style",
      "compact",
      "--predicate",
      'process == "Pool" OR process == "ReportCrash"',
    ],
    { encoding: "utf8", timeout: 30000, maxBuffer: 10 * 1024 * 1024 },
  );
  writeFileSync(
    join(output, "application.log"),
    `${logs.stdout ?? ""}\n${logs.stderr ?? ""}`,
  );
  console.log(`Native failure diagnostics saved in ${output}`);
}
export function iosPrerequisites() {
  if (process.platform !== "darwin")
    throw new Error(
      "iOS simulator checks require macOS with full Xcode 26.4+ and an installed iOS Simulator runtime.",
    );
  try {
    const version = run("xcodebuild", ["-version"], {
      encoding: "utf8",
      stdio: "pipe",
    });
    const match = version.match(/Xcode (\d+)\.(\d+)/);
    if (
      !match ||
      Number(match[1]) < 26 ||
      (Number(match[1]) === 26 && Number(match[2]) < 4)
    )
      throw new Error();
    run("xcrun", ["simctl", "list", "devices", "available", "--json"], {
      stdio: "pipe",
    });
  } catch {
    throw new Error(
      "Select full Xcode 26.4+ with xcode-select and install an iOS Simulator runtime. Command Line Tools alone cannot build or run Pool for iOS.",
    );
  }
  if (spawnSync("maestro", ["--version"], { stdio: "ignore" }).status !== 0)
    throw new Error(
      "Install Maestro to run the native UI journeys (see docs/expo-migration/README.md).",
    );
}
const smoke = process.argv.includes("--smoke");
if (!process.argv.includes("--from-harness") && !smoke) {
  try {
    iosPrerequisites();
    run(process.execPath, ["scripts/auth-browser.mjs", "--ios"]);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
} else {
  let directory;
  let simulator;
  try {
    iosPrerequisites();
    const ciSmoke = smoke && process.env.GITHUB_ACTIONS === "true";
    if (
      !smoke &&
      (process.env.AUTH_TEST_DISPOSABLE !== "1" ||
        process.env.EXPO_PUBLIC_SUPABASE_URL !== "http://localhost:55321")
    )
      throw new Error(
        "Native journeys may only use the harness-owned disposable Supabase project.",
      );
    const available = JSON.parse(
      run("xcrun", ["simctl", "list", "devices", "available", "--json"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    );
    const devices = Object.values(available.devices)
      .flat()
      .filter(
        (device) => device.isAvailable && device.name.startsWith("iPhone"),
      );
    const device =
      devices.find((device) => device.state === "Booted") ?? devices.at(-1);
    if (!device) throw new Error("Install an iPhone simulator runtime first.");
    simulator = device.udid;
    console.log(`Preparing iOS Simulator: ${device.name}`);
    directory = process.env.POOL_IOS_DERIVED_DATA
      ? resolve(process.env.POOL_IOS_DERIVED_DATA)
      : mkdtempSync(join(tmpdir(), "pool-ios-"));
    const reuseRequested = process.argv.includes("--reuse-project");
    const reuseProject =
      reuseRequested &&
      (ciSmoke
        ? hasReusableCIProject()
        : existsSync("ios/Pool.xcworkspace") &&
          existsSync("ios/Pods/Manifest.lock"));
    if (reuseProject) {
      console.log("Reusing the generated Expo iOS project and Pods.");
    } else {
      if (ciSmoke) {
        if (reuseRequested)
          console.warn("Restored iOS project is incomplete. Regenerating it.");
        rmSync("ios", { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
      }
      timed("Expo iOS prebuild", () =>
        run(process.execPath, [
          "node_modules/expo/bin/cli",
          "prebuild",
          "--platform",
          "ios",
          "--no-install",
        ]),
      );
      timed("CocoaPods installation", () =>
        run("pod", ["install"], { cwd: resolve("ios") }),
      );
    }
    const application = join(
      directory,
      "Build/Products/Release-iphonesimulator/Pool.app",
    );
    const bundle = join(application, "main.jsbundle");
    if (ciSmoke) {
      const nodePath = process.execPath.replaceAll("'", "'\\''");
      writeFileSync("ios/.xcode.env.local", `export NODE_BINARY='${nodePath}'\n`);
      // The Release bundle phase runs every build. Require it to write a fresh
      // bundle even when DerivedData contains an application from another SHA.
      rmSync(bundle, { force: true });
    }
    const buildArgs = [
      "-workspace",
      "ios/Pool.xcworkspace",
      "-scheme",
      "Pool",
      "-configuration",
      "Release",
      "-sdk",
      "iphonesimulator",
      "-destination",
      `id=${device.udid}`,
      "-derivedDataPath",
      directory,
      "ONLY_ACTIVE_ARCH=YES",
      "CODE_SIGNING_ALLOWED=YES",
      "CODE_SIGN_IDENTITY=-",
      "DEVELOPMENT_TEAM=",
    ];
    buildSimulator(buildArgs, ciSmoke);
    if (!existsSync(application))
      throw new Error("Simulator application was not built.");
    if (ciSmoke) {
      if (!existsSync(bundle))
        throw new Error("Release JavaScript was not bundled.");
      const checksum = createHash("sha256")
        .update(readFileSync(bundle))
        .digest("hex");
      console.log(`Embedded JavaScript SHA-256: ${checksum}`);
    }
    // Simulator Keychain requires the app's signed application identifier.
    // Xcode's local ad-hoc identity needs no certificate or provisioning profile.
    run("codesign", ["--verify", "--deep", "--strict", application]);
    run("codesign", ["--display", "--entitlements", ":-", application]);
    timed("simulator boot and readiness", () => {
      if (device.state !== "Booted")
        run("xcrun", ["simctl", "boot", device.udid]);
      run("xcrun", ["simctl", "bootstatus", device.udid, "-b"]);
    });
    timed("simulator app installation", () =>
      run("xcrun", ["simctl", "install", device.udid, application]),
    );
    const maestroEnv = { ...process.env };
    if (ciSmoke) {
      // Match Maestro's macos-26 CI allowance for cold XCTest startup.
      maestroEnv.MAESTRO_DRIVER_STARTUP_TIMEOUT ??= "240000";
    }
    timed("Maestro smoke command", () =>
      run("maestro", ["--device", device.udid, "test", "tests/ios/smoke.yaml"], {
        env: maestroEnv,
      }),
    );
    if (!smoke) {
      const { nativeJourneys } = await import("./ios-journeys.mjs");
      await nativeJourneys({ device: device.udid, run, directory });
    }
  } catch (error) {
    console.error(error.message);
    if (simulator) {
      try {
        diagnostics(simulator);
      } catch (diagnosticError) {
        console.error(diagnosticError.message);
      }
    }
    process.exitCode = 1;
  } finally {
    if (directory && !process.env.POOL_IOS_DERIVED_DATA)
      rmSync(directory, { recursive: true, force: true });
  }
}
