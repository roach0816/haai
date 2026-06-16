#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const releaseDir = path.join(root, "release");
const versionLabel = getVersionLabel();
const archiveName = `haai-${versionLabel}.tgz`;
const archivePath = path.join(releaseDir, archiveName);

for (const required of ["dist/server/index.js", "dist/client/index.html", "package-lock.json"]) {
  if (!fs.existsSync(path.join(root, required))) {
    throw new Error(`Missing ${required}. Run npm install and npm run build first.`);
  }
}

fs.mkdirSync(releaseDir, { recursive: true });
fs.rmSync(archivePath, { force: true });
fs.rmSync(`${archivePath}.sha256`, { force: true });
fs.rmSync(path.join(releaseDir, "latest.json"), { force: true });

const result = spawnSync(
  "tar",
  [
    "-czf",
    archivePath,
    "package.json",
    "package-lock.json",
    "README.md",
    "Dockerfile",
    ".dockerignore",
    "compose.yml",
    "install.sh",
    "dist",
    "appliance"
  ],
  { cwd: root, stdio: "inherit" }
);

if (result.status !== 0) {
  throw new Error(`tar failed with exit code ${result.status}`);
}

const sha256 = crypto.createHash("sha256").update(fs.readFileSync(archivePath)).digest("hex");
fs.writeFileSync(`${archivePath}.sha256`, `${sha256}  ${archiveName}\n`);

console.log(`Created ${archivePath}`);
console.log(`SHA-256 ${sha256}`);
console.log(`Checksum ${archivePath}.sha256`);

function getVersionLabel() {
  const explicit = process.argv.find((arg) => arg.startsWith("--version-label="));
  if (explicit) return explicit.split("=")[1];
  if (process.env.HAAI_RELEASE_VERSION) return process.env.HAAI_RELEASE_VERSION;
  return String(pkg.version).replace(/^v/i, "");
}
