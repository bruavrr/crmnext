import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { pool } from "@/lib/db";
import { sameOrigin, failure, body } from "@/lib/http";
import { importCsv, safeCsvCell } from "@/lib/csv";
import Papa from "papaparse";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    return NextResponse.json(
      await importCsv(await body(req), await currentActor()),
    );
  } catch (e) {
    return failure(e);
  }
}
export async function GET() {
  try {
    const actor = await currentActor();
    const rows = (
      await pool.query(
        "SELECT l.name,l.phone,l.email,l.instagram,l.company,l.source,l.campaign,u.name owner,s.name stage,l.created_at,l.first_contact_at,l.last_contact_at FROM leads l LEFT JOIN users u ON u.id=l.owner_id JOIN pipeline_stages s ON s.id=l.stage_id WHERE l.deleted_at IS NULL AND ($1::uuid IS NULL OR l.owner_id=$1) ORDER BY l.created_at DESC LIMIT 10000",
        [actor.role === "admin" ? null : actor.id],
      )
    ).rows.map((r) =>
      Object.fromEntries(
        Object.entries(r).map(([k, v]) => [
          k,
          safeCsvCell(v instanceof Date ? v.toISOString() : v),
        ]),
      ),
    );
    const csv = Papa.unparse(
      rows.length
        ? rows
        : [
            {
              name: "",
              phone: "",
              email: "",
              instagram: "",
              company: "",
              source: "",
              campaign: "",
              owner: "",
              stage: "",
              created_at: "",
              first_contact_at: "",
              last_contact_at: "",
            },
          ],
    );
    return new NextResponse("\uFEFF" + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="nextgen-leads.csv"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return failure(e);
  }
}
