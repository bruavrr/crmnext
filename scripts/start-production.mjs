import { spawn } from "node:child_process";

const required = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "WEBHOOK_SECRET",
  "BOOTSTRAP_ADMIN_EMAIL",
  "MARIA_EMAIL",
  "BRUNA_EMAIL",
];
const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length)
  throw new Error(`Configure no servidor: ${missing.join(", ")}`);
if (process.env.NODE_ENV !== "production")
  throw new Error("Este comando exige NODE_ENV=production");
if (process.env.DEMO_MODE !== "false")
  throw new Error(
    "Configure DEMO_MODE=false; use uma base de produção separada",
  );
const canonical = new URL(process.env.NEXTAUTH_URL);
if (
  canonical.protocol !== "https:" ||
  canonical.username ||
  canonical.password ||
  canonical.pathname !== "/" ||
  canonical.search ||
  canonical.hash ||
  ["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(canonical.hostname)
)
  throw new Error("NEXTAUTH_URL deve ser a origem HTTPS pública do CRM");
if (!/^postgres(?:ql)?:$/.test(new URL(process.env.DATABASE_URL).protocol))
  throw new Error("DATABASE_URL deve apontar para PostgreSQL");
for (const key of ["NEXTAUTH_SECRET", "WEBHOOK_SECRET"])
  if (process.env[key].length < 32)
    throw new Error(
      `${key} exige um segredo aleatório de pelo menos 32 caracteres`,
    );
const emailKeys = ["BOOTSTRAP_ADMIN_EMAIL", "MARIA_EMAIL", "BRUNA_EMAIL"];
for (const key of emailKeys) {
  const email = process.env[key];
  if (
    email !== email.trim().toLowerCase() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    /\.(local|test|invalid)$/i.test(email) ||
    /@example\.(com|net|org)$/i.test(email)
  )
    throw new Error(`${key} exige um e-mail real em letras minúsculas`);
}
if (new Set(emailKeys.map((key) => process.env[key])).size !== 3)
  throw new Error(
    "Use três e-mails distintos para administrador, Maria e Bruna",
  );
const port = process.env.PORT || "3000";
if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
  throw new Error("PORT deve estar entre 1 e 65535");

let child;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child?.kill(signal));
async function run(args) {
  return new Promise((resolve, reject) => {
    child = spawn("npm", args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`Processo interrompido: ${signal}`));
      else if (code !== 0) reject(new Error(`Comando falhou (exit ${code})`));
      else resolve();
    });
  });
}
// Both scripts are repeatable and serialize migrations/initialization in SQL.
await run(["run", "db:migrate"]);
await run(["run", "db:seed"]);
await run(["run", "start", "--", "--port", port]);
