import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { createTask, completeItem } from "@/lib/crm";
import { sameOrigin, failure, body } from "@/lib/http";
import { z } from "zod";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    return NextResponse.json(
      await createTask(await body(req), await currentActor()),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: NextRequest) {
  try {
    sameOrigin(req);
    const v = z
      .object({ id: z.uuid(), kind: z.enum(["tasks", "followups"]) })
      .parse(await body(req));
    return NextResponse.json(
      await completeItem(v.kind, v.id, await currentActor()),
    );
  } catch (e) {
    return failure(e);
  }
}
