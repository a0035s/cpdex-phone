import { createHash, randomBytes, randomInt } from "node:crypto";

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

export function makePairCode() {
  return String(randomInt(100000, 1000000));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sanitizeFilename(filename) {
  return (filename || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}
