import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { NextConfig } from "next";

type PackageJson = {
  version?: string;
};

function readPackageVersion(): string {
  try {
    const pkgRaw = readFileSync(new URL("./package.json", import.meta.url), {
      encoding: "utf8",
    });
    const pkg = JSON.parse(pkgRaw) as PackageJson;
    return typeof pkg.version === "string" && pkg.version.trim()
      ? pkg.version.trim()
      : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function readGitCommitCount(): string {
  try {
    const out = execSync("git rev-list --count HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return out;
  } catch {
    return "";
  }
}

const appVersion = readPackageVersion();
const buildTimeIso = new Date().toISOString();

// Vercel provides these during builds:
// - VERCEL_ENV: development | preview | production
// - VERCEL_GIT_COMMIT_SHA
// - VERCEL_GIT_COMMIT_REF
const vercelEnv = process.env.VERCEL_ENV ?? "";
const gitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const gitRef = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const gitCommitCount = readGitCommitCount();

const distDir = process.env.NEXT_DIST_DIR ?? ".next";

const nextConfig: NextConfig = {
  distDir,
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
    NEXT_PUBLIC_BUILD_TIME_ISO: buildTimeIso,
    NEXT_PUBLIC_VERCEL_ENV: vercelEnv,
    NEXT_PUBLIC_GIT_SHA: gitSha,
    NEXT_PUBLIC_GIT_REF: gitRef,
    NEXT_PUBLIC_GIT_COMMIT_COUNT: gitCommitCount,
    NEXT_PUBLIC_DEBUG: process.env.DEBUG ?? "",
  },
};

export default nextConfig;
