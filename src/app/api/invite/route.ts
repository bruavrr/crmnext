import { NextRequest, NextResponse } from "next/server";
import { transaction, AppError } from "@/lib/db";
import { consumeRate } from "@/lib/crm";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
import { createHash } from "node:crypto";
import argon2 from "argon2";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const v = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(12).max(128),
      })
      .parse(await body(req));
    await consumeRate(
      "invite:" + createHash("sha256").update(v.token).digest("hex"),
      5,
    );
    const hash = await argon2.hash(v.password, { type: argon2.argon2id });
    await transaction(async (c) => {
      const candidate = (
        await c.query("SELECT user_id FROM invitations WHERE token_hash=$1", [
          createHash("sha256").update(v.token).digest("hex"),
        ])
      ).rows[0];
      if (!candidate) throw new AppError(400, "Convite inválido ou expirado");
      await c.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [
        candidate.user_id,
      ]);
      const invite = (
        await c.query(
          "SELECT i.* FROM invitations i JOIN users u ON u.id=i.user_id WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() AND u.active FOR UPDATE OF i",
          [createHash("sha256").update(v.token).digest("hex")],
        )
      ).rows[0];
      if (!invite) throw new AppError(400, "Convite inválido ou expirado");
      await c.query(
        "UPDATE users SET password_hash=$1,session_version=session_version+1,updated_at=now() WHERE id=$2",
        [hash, invite.user_id],
      );
      await c.query(
        "UPDATE invitations SET used_at=now() WHERE user_id=$1 AND used_at IS NULL",
        [invite.user_id],
      );
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
