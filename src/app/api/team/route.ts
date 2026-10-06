import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { availability, audit, drainQueued } from "@/lib/crm";
import { pool, transaction, AppError } from "@/lib/db";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req);
    const v = z
      .object({
        id: z.uuid(),
        availability: z.enum(["available", "unavailable", "leave"]),
        active: z.boolean(),
        rotation_enabled: z.boolean(),
      })
      .parse(await body(req));
    return NextResponse.json(await availability(v.id, v, await currentActor()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const actor = await currentActor();
    if (actor.role !== "admin")
      throw new AppError(403, "Somente administrador");
    const v = z
      .object({
        name: z.string().min(2).max(100),
        email: z.email(),
        role: z.enum(["admin", "sdr"]).default("sdr"),
      })
      .parse(await body(req));
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [
      v.email.toLowerCase(),
    ]);
    if (existing.rowCount) throw new AppError(409, "E-mail já cadastrado");
    const token = randomBytes(32).toString("hex");
    await transaction(async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(902)");
      const u = (
        await c.query(
          "INSERT INTO users(name,email,role) VALUES($1,$2,$3) RETURNING id",
          [v.name, v.email.toLowerCase(), v.role],
        )
      ).rows[0];
      await c.query(
        "INSERT INTO invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '24 hours')",
        [u.id, createHash("sha256").update(token).digest("hex")],
      );
      await audit(c, actor.id, "user.created", u.id, null, v);
      if (v.role === "sdr") await drainQueued(c);
    });
    return NextResponse.json({
      invite: `${process.env.NEXTAUTH_URL}/invite#${token}`,
    });
  } catch (e) {
    return failure(e);
  }
}
