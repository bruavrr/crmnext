import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { transaction, AppError } from "@/lib/db";
import { audit } from "@/lib/crm";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req);
    const actor = await currentActor();
    if (actor.role !== "admin")
      throw new AppError(403, "Somente administrador");
    const v = z
      .object({ sla_minutes: z.number().int().min(1).max(1440) })
      .parse(await body(req));
    await transaction(async (c) => {
      const prev = (
        await c.query("SELECT * FROM settings WHERE id=1 FOR UPDATE")
      ).rows[0];
      await c.query(
        "UPDATE settings SET sla_minutes=$1,updated_at=now() WHERE id=1",
        [v.sla_minutes],
      );
      await audit(
        c,
        actor.id,
        "settings.sla",
        null as unknown as string,
        prev.sla_minutes,
        v.sla_minutes,
      );
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
