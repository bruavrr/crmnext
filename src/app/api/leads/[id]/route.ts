import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { leadAction, allowed } from "@/lib/crm";
import { transaction } from "@/lib/db";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await currentActor();
    const id = z.uuid().parse((await params).id);
    return NextResponse.json(
      await transaction(async (c) => {
        const lead = await allowed(c, id, actor);
        const timeline = (
          await c.query(
            "SELECT a.*,u.name actor FROM activities a LEFT JOIN users u ON u.id=a.actor_id WHERE lead_id=$1 ORDER BY created_at DESC",
            [id],
          )
        ).rows;
        return { lead, timeline };
      }),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    sameOrigin(req);
    const actor = await currentActor();
    return NextResponse.json(
      await leadAction(
        z.uuid().parse((await params).id),
        await body(req),
        actor,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
