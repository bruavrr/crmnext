import { config } from "dotenv";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL!);
if (!["127.0.0.1", "localhost"].includes(url.hostname))
  throw new Error(
    "Checkpoint Docker aplica-se somente ao banco local; use backups gerenciados para banco externo",
  );
mkdirSync(".local", { recursive: true });
const dump = execFileSync(
  "docker",
  [
    "exec",
    "nextgen-db",
    "pg_dump",
    "-U",
    decodeURIComponent(url.username),
    "-Fc",
    url.pathname.slice(1),
  ],
  { maxBuffer: 64 * 1024 * 1024 },
);
writeFileSync(".local/database.dump", dump, { mode: 0o600 });
chmodSync(".local/database.dump", 0o600);
console.log(
  "Checkpoint local salvo. Contém dados e hashes de autenticação; mantenha privado.",
);
