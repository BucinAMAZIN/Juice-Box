import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
function sha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(`v${pkg.version} · ${sha()}`) },
  base: process.env.VITE_BASE ?? "/",
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
