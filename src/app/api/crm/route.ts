import { NextRequest, NextResponse } from "next/server";
import { currentActor } from "@/lib/auth";
import { pool } from "@/lib/db";
import { failure } from "@/lib/http";
import { z } from "zod";
import { syncNotifications } from "@/lib/operations";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const actor = await currentActor();
    await syncNotifications(actor);
    const q = req.nextUrl.searchParams;
    const owner =
      actor.role === "admin"
        ? q.get("owner")
          ? z.uuid().parse(q.get("owner"))
          : null
        : actor.id;
    const start = q.get("start")
        ? z.iso.datetime().parse(q.get("start"))
        : null,
      end = q.get("end") ? z.iso.datetime().parse(q.get("end")) : null;
    const args = [
      owner,
      start,
      end,
      q.get("source") || null,
      q.get("search")?.slice(0, 100) || null,
      q.get("campaign") || null,
      q.get("tag") ? z.uuid().parse(q.get("tag")) : null,
      q.get("stage") ? z.uuid().parse(q.get("stage")) : null,
      q.get("temperature")
        ? z
            .enum(["hot", "warm", "cold", "unclassified"])
            .parse(q.get("temperature"))
        : null,
      q.get("last_after") ? z.iso.datetime().parse(q.get("last_after")) : null,
      q.get("last_before")
        ? z.iso.datetime().parse(q.get("last_before"))
        : null,
      q.get("followup_after")
        ? z.iso.datetime().parse(q.get("followup_after"))
        : null,
      q.get("followup_before")
        ? z.iso.datetime().parse(q.get("followup_before"))
        : null,
    ];
    const where =
      "l.deleted_at IS NULL AND ($1::uuid IS NULL OR l.owner_id=$1) AND ($2::timestamptz IS NULL OR l.created_at >= $2) AND ($3::timestamptz IS NULL OR l.created_at < $3) AND ($4::text IS NULL OR l.source=$4) AND ($5::text IS NULL OR (coalesce(l.name,'')||' '||coalesce(l.phone,'')||' '||coalesce(l.email,'')||' '||coalesce(l.company,'')||' '||coalesce(l.instagram,'')) ILIKE '%'||$5||'%') AND ($6::text IS NULL OR l.campaign=$6) AND ($7::uuid IS NULL OR EXISTS(SELECT 1 FROM lead_tags lt WHERE lt.lead_id=l.id AND lt.tag_id=$7)) AND ($8::uuid IS NULL OR l.stage_id=$8) AND ($9::text IS NULL OR l.temperature=$9) AND ($10::timestamptz IS NULL OR l.last_contact_at>=$10) AND ($11::timestamptz IS NULL OR l.last_contact_at<$11) AND (($12::timestamptz IS NULL AND $13::timestamptz IS NULL) OR EXISTS(SELECT 1 FROM followups fu WHERE fu.lead_id=l.id AND fu.completed_at IS NULL AND ($12::timestamptz IS NULL OR fu.due_at>=$12) AND ($13::timestamptz IS NULL OR fu.due_at<$13)))";
    const results = await Promise.all([
      pool.query(
        `SELECT l.*,u.name owner,s.name stage,s.kind stage_kind,s.position stage_position, f.due_at next_followup, (l.first_contact_at IS NULL AND l.created_at<now()-settings.sla_minutes*interval '1 minute' AND s.kind='open') sla_breached FROM leads l LEFT JOIN users u ON u.id=l.owner_id JOIN pipeline_stages s ON s.id=l.stage_id CROSS JOIN settings LEFT JOIN LATERAL(SELECT due_at FROM followups WHERE lead_id=l.id AND completed_at IS NULL ORDER BY due_at LIMIT 1) f ON true WHERE ${where} ORDER BY l.created_at DESC LIMIT 1000`,
        args,
      ),
      pool.query(
        `SELECT count(*)::int total,count(*) FILTER(WHERE l.created_at>=(date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))::int today,count(*) FILTER(WHERE l.created_at>=(date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))::int AS "month",count(*) FILTER(WHERE l.first_contact_at IS NULL AND s.kind='open')::int waiting,count(*) FILTER(WHERE l.first_contact_at IS NOT NULL AND s.kind='open')::int attending,count(*) FILTER(WHERE s.system_key='meeting_scheduled' OR EXISTS(SELECT 1 FROM meetings m WHERE m.lead_id=l.id AND m.cancelled_at IS NULL AND m.starts_at>=now()))::int meetings,count(*) FILTER(WHERE s.system_key='proposal')::int proposals,count(*) FILTER(WHERE s.kind='won')::int won,count(*) FILTER(WHERE s.kind='lost')::int lost,COALESCE(avg(extract(epoch FROM l.first_contact_at-l.created_at)/60) FILTER(WHERE l.first_contact_at IS NOT NULL),0)::float avg_contact,COALESCE(sum(sales.amount) FILTER(WHERE s.kind='won'),0)::float revenue FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id LEFT JOIN sales ON sales.lead_id=l.id WHERE ${where}`,
        args,
      ),
      pool.query(
        `SELECT u.id,u.name,count(l.id)::int received,count(l.id) FILTER(WHERE l.first_contact_at IS NOT NULL)::int contacted,count(l.id) FILTER(WHERE (s.system_key='meeting_scheduled' OR EXISTS(SELECT 1 FROM meetings m WHERE m.lead_id=l.id AND m.cancelled_at IS NULL) OR EXISTS(SELECT 1 FROM lead_stage_history h JOIN pipeline_stages hs ON hs.id=h.stage_id WHERE h.lead_id=l.id AND hs.system_key='meeting_scheduled')))::int meetings,count(l.id) FILTER(WHERE s.kind='won')::int won,COALESCE(avg(extract(epoch FROM l.first_contact_at-l.created_at)/60) FILTER(WHERE l.first_contact_at IS NOT NULL),0)::float avg_contact FROM users u LEFT JOIN leads l ON l.owner_id=u.id AND ${where} LEFT JOIN pipeline_stages s ON s.id=l.stage_id WHERE u.role='sdr' AND ($1::uuid IS NULL OR u.id=$1) GROUP BY u.id ORDER BY min(u.rotation_order)`,
        args,
      ),
      pool.query(
        "SELECT id,name,email,role,availability,active,rotation_enabled,rotation_order FROM users WHERE ($1::uuid IS NULL OR id=$1) ORDER BY rotation_order",
        [actor.role === "admin" ? null : actor.id],
      ),
      pool.query("SELECT * FROM pipeline_stages ORDER BY position"),
      pool.query(
        "SELECT t.*,l.name lead_name FROM tasks t LEFT JOIN leads l ON l.id=t.lead_id WHERE ($1::uuid IS NULL OR t.owner_id=$1) ORDER BY completed_at NULLS FIRST,due_at LIMIT 500",
        [actor.role === "admin" ? null : actor.id],
      ),
      pool.query(
        "SELECT f.*,l.name lead_name FROM followups f JOIN leads l ON l.id=f.lead_id WHERE f.completed_at IS NULL AND ($1::uuid IS NULL OR f.owner_id=$1) ORDER BY due_at LIMIT 500",
        [actor.role === "admin" ? null : actor.id],
      ),
      pool.query(
        "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50",
        [actor.id],
      ),
      pool.query("SELECT * FROM integrations ORDER BY provider"),
      pool.query("SELECT * FROM settings WHERE id=1"),
    ]);
    const breakdown = async (dimension: string) =>
      (
        await pool.query(
          `SELECT COALESCE(${dimension},'Não informado') label,count(*)::int leads,count(*) FILTER(WHERE s.kind='won')::int won,COALESCE(sum(sales.amount) FILTER(WHERE s.kind='won'),0)::float revenue,COALESCE(avg(extract(epoch FROM l.first_contact_at-l.created_at)/60) FILTER(WHERE l.first_contact_at IS NOT NULL),0)::float avg_contact FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id LEFT JOIN sales ON sales.lead_id=l.id WHERE ${where} GROUP BY ${dimension} ORDER BY count(*) DESC`,
          args,
        )
      ).rows;
    const [bySource, byCampaign, byStage, losses, daily] = await Promise.all([
      breakdown("l.source"),
      breakdown("l.campaign"),
      breakdown("s.name"),
      pool.query(
        `SELECT reasons.reason label,count(*)::int leads FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id JOIN loss_reasons reasons ON reasons.lead_id=l.id WHERE ${where} AND s.kind='lost' GROUP BY reasons.reason ORDER BY count(*) DESC`,
        args,
      ),
      pool.query(
        `SELECT to_char(l.created_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS "day",count(*)::int count FROM leads l WHERE ${where} AND l.created_at>=now()-interval '8 days' GROUP BY "day" ORDER BY "day"`,
        args,
      ),
    ]);
    return NextResponse.json({
      actor,
      reports: { bySource, byCampaign, byStage, losses: losses.rows },
      daily: daily.rows,
      leads: results[0].rows,
      metrics: results[1].rows[0],
      comparison: results[2].rows,
      users: results[3].rows,
      stages: results[4].rows,
      tasks: results[5].rows,
      followups: results[6].rows,
      notifications: results[7].rows,
      integrations: results[8].rows,
      settings: results[9].rows[0],
      listLimit: 1000,
    });
  } catch (e) {
    return failure(e);
  }
}
