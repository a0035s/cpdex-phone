import { spawn } from "node:child_process";

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
        reject(new Error(stderr.trim() || `ASR command failed (${code})`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

export async function transcribeAudio({ filePath, language, commandTemplate }) {
  if (!commandTemplate) {
    const error = new Error(
      "Voice transcription is not configured. Set CPDEX_ASR_COMMAND to enable ASR.",
    );
    error.statusCode = 400;
    error.code = "ASR_NOT_CONFIGURED";
    throw error;
  }

  const command = commandTemplate
    .replaceAll("{file}", quote(filePath))
    .replaceAll("{lang}", language || "");

  const output = await runCommand(command);
  if (!output) {
    const error = new Error("ASR command returned empty transcript");
    error.statusCode = 422;
    error.code = "TRANSCRIBE_FAILED";
    throw error;
  }

  return {
    text: output,
  };
}
