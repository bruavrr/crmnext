import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./db";
export function failure(e: unknown) {
  if (e instanceof AppError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: e.issues.map((i) => i.message).join("; ") },
      { status: 400 },
    );
  if (e && typeof e === "object" && "code" in e && e.code === "23505")
    return NextResponse.json(
      { error: "Este contato ou cadastro já existe. Verifique duplicidades." },
      { status: 409 },
    );
  if (e instanceof SyntaxError)
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  console.error(
    JSON.stringify({
      level: "error",
      event: "request_failed",
      message: e instanceof Error ? e.message : "unknown",
    }),
  );
  return NextResponse.json(
    { error: "Não foi possível concluir a operação" },
    { status: 500 },
  );
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = new URL(process.env.NEXTAUTH_URL || req.url).origin;
  if (origin !== expected) throw new AppError(403, "Origem inválida");
}
export async function rawBody(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 65536)
    throw new AppError(413, "Payload muito grande");
  if (
    !req.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new AppError(415, "Envie application/json");
  const reader = req.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new AppError(413, "Payload muito grande");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function body(req: Request) {
  return JSON.parse(await rawBody(req));
}
