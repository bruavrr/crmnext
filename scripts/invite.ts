import { pool } from "../src/lib/db";
import { randomBytes, createHash } from "node:crypto";
const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error("Uso: npm run user:invite -- email");
const user = (
  await pool.query("SELECT id FROM users WHERE email=$1 AND active", [email])
).rows[0];
if (!user) throw new Error("Usuário ativo não encontrado");
const token = randomBytes(32).toString("hex");
await pool.query(
  "INSERT INTO invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '24 hours')",
  [user.id, createHash("sha256").update(token).digest("hex")],
);
console.log(
  `Convite de uso único, válido 24h. Compartilhe por canal seguro: ${process.env.NEXTAUTH_URL || "http://localhost:3000"}/invite#${token}`,
);
await pool.end();
