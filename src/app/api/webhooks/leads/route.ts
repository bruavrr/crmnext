import { NextRequest, NextResponse } from "next/server";
import { failure, rawBody } from "@/lib/http";
import { AppError } from "@/lib/db";
import { verifySignature, webhookIngest } from "@/lib/webhook";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    if (!process.env.WEBHOOK_SECRET)
      throw new AppError(503, "Webhook não configurado");
    const raw = await rawBody(req);
    verifySignature(
      raw,
      req.headers.get("x-webhook-timestamp"),
      req.headers.get("x-webhook-signature"),
      process.env.WEBHOOK_SECRET,
    );
    const key = z
      .string()
      .min(8)
      .max(128)
      .parse(req.headers.get("idempotency-key"));
    return NextResponse.json(await webhookIngest(raw, key));
  } catch (e) {
    return failure(e);
  }
}
