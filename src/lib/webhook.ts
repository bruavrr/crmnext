import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { AppError, transaction } from "./db";
import { ingest, consumeRate } from "./crm";
export function verifySignature(
  raw: string,
  timestamp: string | null,
  signature: string | null,
  secret: string,
) {
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    throw new AppError(401, "Timestamp inválido");
  if (!signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    throw new AppError(401, "Assinatura inválida");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (!timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex")))
    throw new AppError(401, "Assinatura inválida");
}
export async function webhookIngest(raw: string, key: string) {
  await consumeRate("webhook:leads", 60);
  const hash = createHash("sha256").update(raw).digest("hex");
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(902)");
    const old = (
      await c.query("SELECT * FROM webhook_receipts WHERE key=$1", [key])
    ).rows[0];
    if (old) {
      if (old.payload_hash !== hash)
        throw new AppError(
          409,
          "Chave de idempotência reutilizada com outro payload",
        );
      return { id: old.lead_id, replayed: true };
    }
    const result = await ingest(c, JSON.parse(raw), null);
    await c.query(
      "INSERT INTO webhook_receipts(key,payload_hash,lead_id) VALUES($1,$2,$3)",
      [key, hash, result.id],
    );
    return result;
  });
}
