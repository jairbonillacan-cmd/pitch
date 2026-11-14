#!/usr/bin/env node
/**
 * Guardia de secretos en el árbol rastreado por Git (SEC-10).
 * Falla en CI si algún archivo versionado incluye archivos `.env` reales o llaves privadas/API vivas.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

const tracked = execFileSync("git", ["ls-files", "-z"], {
  cwd: ROOT,
  maxBuffer: 64 * 1024 * 1024,
})
  .toString("utf8")
  .split("\0")
  .filter(Boolean);

const ALLOWED_ENV_TEMPLATES = new Set([".env.example", "apps/web/.env.example"]);

const SECRET_PATTERNS = [
  { name: "Stripe live secret key", re: /\bsk_live_[0-9a-zA-Z]{20,}\b/ },
  { name: "Stripe webhook secret real", re: /\bwhsec_[0-9a-zA-Z]{24,}\b/ },
  { name: "OpenRouter API key", re: /\bsk-or-v1-[0-9a-f]{48,}\b/ },
  { name: "Resend live API key", re: /\bre_[0-9a-zA-Z_]{24,}\b/ },
  { name: "PEM private key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: "GitHub personal access token", re: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/ },
  { name: "Google / Firebase API key", re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "Sentry DSN key", re: /https:\/\/[0-9a-f]{32}@[a-z0-9.]+\.ingest\.[a-z.]*sentry\.io\/\d+/i },
];

const BINARY_EXTENSIONS = /\.(?:png|jpg|jpeg|webp|gif|ico|woff2?|ttf|otf|pdf|mp4|webm|zip|gz)$/i;

const findings = [];

for (const rel of tracked) {
  const base = rel.split("/").pop() ?? "";
  if ((base === ".env" || base.startsWith(".env.")) && !ALLOWED_ENV_TEMPLATES.has(rel)) {
    findings.push(`${rel}: archivo de entorno rastreado por Git prohibido.`);
    continue;
  }
  if (BINARY_EXTENSIONS.test(rel)) continue;

  let content = "";
  try {
    content = readFileSync(resolve(ROOT, rel), "utf8");
  } catch (err) {
    void err;
    continue;
  }

  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(content)) {
      findings.push(`${rel}: posible secreto detectado (${name}).`);
    }
  }
}

if (findings.length > 0) {
  console.error("Fallo [check-no-secrets]: se detectaron secretos o archivos .env rastreados:");
  for (const item of findings) {
    console.error(` - ${item}`);
  }
  process.exit(1);
}

console.log(`OK [check-no-secrets]: ${tracked.length} archivos verificados sin secretos expuestos.`);
