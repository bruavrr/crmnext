import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
config({ path: ".env.local", quiet: true });
if (!process.env.DATABASE_URL) {
  if (existsSync(".env.local"))
    throw new Error(
      "DATABASE_URL ausente em configuração existente; configure sem sobrescrever o arquivo",
    );
  const password = randomBytes(24).toString("hex");
  const lines = [
    `DATABASE_URL=postgresql://nextgen:${password}@127.0.0.1:5432/nextgen`,
    `TEST_DATABASE_URL=postgresql://nextgen:${password}@127.0.0.1:5432/nextgen_test`,
    `NEXTAUTH_URL=${process.env.NEXTAUTH_URL || "http://localhost:3000"}`,
    "DEMO_MODE=true",
  ];
  if (!process.env.NEXTAUTH_SECRET)
    lines.push(`NEXTAUTH_SECRET=${randomBytes(32).toString("hex")}`);
  if (!process.env.WEBHOOK_SECRET)
    lines.push(`WEBHOOK_SECRET=${randomBytes(32).toString("hex")}`);
  writeFileSync(".env.local", lines.join("\n") + "\n", { mode: 0o600 });
  config({ path: ".env.local", quiet: true });
}
if (!process.env.NEXTAUTH_SECRET)
  throw new Error("Configure NEXTAUTH_SECRET no servidor antes de iniciar");
const url = new URL(process.env.DATABASE_URL!);
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
const database = url.pathname.slice(1),
  user = decodeURIComponent(url.username);
if (
  !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(database) ||
  !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(user)
)
  throw new Error("Identificadores PostgreSQL inválidos");
const container = process.env.LOCAL_DB_CONTAINER || "nextgen-db";
if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]+$/.test(container))
  throw new Error("Nome de container inválido");
if (local && /[\r\n\0]/.test(decodeURIComponent(url.password)))
  throw new Error("Senha local contém caracteres de controle não suportados");
if (local) {
  let exists = false;
  try {
    execFileSync("docker", ["inspect", container], { stdio: "ignore" });
    exists = true;
  } catch {
    /* Container ausente: será criado sem substituir outros recursos. */
  }
  if (!exists) {
    mkdirSync(".local", { recursive: true });
    const envFile = ".local/postgres.env";
    writeFileSync(
      envFile,
      `POSTGRES_USER=${user}\nPOSTGRES_PASSWORD=${decodeURIComponent(url.password)}\nPOSTGRES_DB=${database}\n`,
      { mode: 0o600 },
    );
    try {
      execFileSync(
        "docker",
        [
          "run",
          "-d",
          "--name",
          container,
          "--env-file",
          envFile,
          "-p",
          `127.0.0.1:${url.port || 5432}:5432`,
          "-v",
          (container === "nextgen-db"
            ? "nextgen-pgdata"
            : container + "-data") + ":/var/lib/postgresql/data",
          "postgres:16@sha256:1a6ab3f5345eb6dbe04a1349529caabdb0ab09293a09590fad07b2246bfa4b54",
        ],
        { stdio: "ignore" },
      );
    } finally {
      const { unlinkSync } = await import("node:fs");
      unlinkSync(envFile);
    }
  } else {
    const image = execFileSync(
      "docker",
      ["inspect", "--format", "{{.Config.Image}}", container],
      { encoding: "utf8" },
    ).trim();
    if (!image.startsWith("postgres:16"))
      throw new Error(
        "nextgen-db já existe com imagem diferente; não será substituído",
      );
    execFileSync("docker", ["start", container], { stdio: "ignore" });
  }
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
let ready = false;
for (let i = 0; i < 40; i++) {
  try {
    await pool.query("SELECT 1");
    ready = true;
    break;
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
if (!ready)
  throw new Error(
    "PostgreSQL não ficou disponível com a configuração existente",
  );
if (local) {
  const exists = (
    await pool.query("SELECT to_regclass('public.migrations') AS name")
  ).rows[0].name;
  if (!exists && existsSync(".local/database.dump")) {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        container,
        "pg_restore",
        "-U",
        user,
        "-d",
        database,
        "--no-owner",
        "--exit-on-error",
      ],
      {
        input: readFileSync(".local/database.dump"),
        stdio: ["pipe", "ignore", "pipe"],
      },
    );
    console.log("Checkpoint local restaurado em banco vazio");
  }
  if (process.env.TEST_DATABASE_URL) {
    const testUrl = new URL(process.env.TEST_DATABASE_URL);
    if (
      testUrl.hostname !== url.hostname ||
      !testUrl.pathname.endsWith("_test")
    )
      throw new Error("Banco de teste deve ser local e terminar em _test");
    const testName = testUrl.pathname.slice(1);
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(testName))
      throw new Error("Nome de banco de teste inválido");
    if (
      !(
        await pool.query("SELECT 1 FROM pg_database WHERE datname=$1", [
          testName,
        ])
      ).rowCount
    )
      execFileSync(
        "docker",
        ["exec", container, "createdb", "-U", user, testName],
        { stdio: "ignore" },
      );
  }
}
await pool.end();
execFileSync("npm", ["run", "db:migrate"], { stdio: "inherit" });
if (process.env.DEMO_MODE === "true")
  execFileSync("npm", ["run", "db:seed", "--", "--demo"], { stdio: "inherit" });
else console.log("Banco preparado; seed de demonstração desativado.");
console.log("Setup concluído; secrets preservados e conexão SQL validada.");
