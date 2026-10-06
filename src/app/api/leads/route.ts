import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { createLead } from "@/lib/crm";
import { sameOrigin, failure, body } from "@/lib/http";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const actor = await currentActor();
    return NextResponse.json(await createLead(await body(req), actor));
  } catch (e) {
    return failure(e);
  }
}
