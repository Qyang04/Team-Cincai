import type { NextConfig } from "next";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

const repoRootEnvPath = resolve(process.cwd(), "../../.env");

if (existsSync(repoRootEnvPath)) {
  loadEnv({ path: repoRootEnvPath, override: false });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;

