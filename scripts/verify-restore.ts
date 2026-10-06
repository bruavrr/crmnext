import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
config({ path: ".env.local", quiet: true });
const original = new Pool({ connectionString: process.env.DATABASE_URL });
const expected = (
  await original.query(
    "SELECT (SELECT count(*) FROM leads) leads,(SELECT count(*) FROM sales) sales,(SELECT count(*) FROM activities) activities",
  )
).rows[0];
await original.end();
const container = "nextgen-restore-" + randomBytes(5).toString("hex");
const url = new URL(process.env.DATABASE_URL!);
url.port = "15432";
let restored: Pool | undefined;
try {
  execFileSync("npm", ["run", "cloud:setup"], {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: url.toString(),
      TEST_DATABASE_URL: "",
      DEMO_MODE: "false",
      LOCAL_DB_CONTAINER: container,
    },
  });
  restored = new Pool({ connectionString: url.toString() });
  const actual = (
    await restored.query(
      "SELECT (SELECT count(*) FROM leads) leads,(SELECT count(*) FROM sales) sales,(SELECT count(*) FROM activities) activities",
    )
  ).rows[0];
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(
      "Checkpoint restaurado não corresponde aos registros esperados",
    );
  console.log(
    "Restauração isolada validada: contagens de leads, vendas e histórico idênticas.",
  );
} finally {
  await restored?.end();
  try {
    execFileSync("docker", ["rm", "-f", container], { stdio: "ignore" });
  } catch {
    /* A inicialização pode falhar antes de criar o recurso temporário. */
  }
  try {
    execFileSync("docker", ["volume", "rm", container + "-data"], {
      stdio: "ignore",
    });
  } catch {
    /* A inicialização pode falhar antes de criar o recurso temporário. */
  }
}
