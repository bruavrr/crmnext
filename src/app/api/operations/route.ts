import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { operate, operationData } from "@/lib/operations";
import { sameOrigin, failure, body } from "@/lib/http";
export async function GET() {
  try {
    return NextResponse.json(await operationData(await currentActor()));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    return NextResponse.json(
      await operate(await body(req), await currentActor()),
    );
  } catch (e) {
    return failure(e);
  }
}
