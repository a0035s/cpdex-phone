import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { sha256 } from "./utils.js";

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("cmd.exe", ["/d", "/s", "/c", command], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `command failed (${code})`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function getActiveAccountFingerprint({ codexExecutable, fingerprintCommand }) {
  if (fingerprintCommand) {
    const output = await runCommand(fingerprintCommand);
    if (output) {
      return sha256(`cmd:${output}`);
    }
  }

  const codexHome = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.resolve(homedir(), ".codex");

  const authFile = path.resolve(codexHome, "auth.json");
  try {
    const authRaw = await readFile(authFile, "utf8");
    if (authRaw.trim()) {
      return sha256(`auth:${authRaw}`);
    }
  } catch {
    // continue fallback
  }

  const output = await runCommand(`${codexExecutable} login status`);
  return sha256(`status:${output}`);
}
