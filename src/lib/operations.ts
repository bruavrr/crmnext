import { z } from "zod";
import { pool, transaction, AppError } from "./db";
import {
  Actor,
  allowed,
  event,
  audit,
  normalizeInstagram,
  ingest,
} from "./crm";
export const prospectStatuses = [
  "Não abordado",
  "Abordado",
  "Respondeu",
  "Interessado",
  "Reunião marcada",
  "Convertido",
  "Sem interesse",
  "Sem resposta",
] as const;
const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("prospect.create"),
    username: z
      .string()
      .min(1)
      .max(30)
      .regex(/^@?[a-zA-Z0-9._]+$/),
    name: z.string().min(2).max(150),
    owner_id: z.uuid().optional(),
    notes: z.string().max(3000).optional(),
  }),
  z.object({
    action: z.literal("prospect.update"),
    id: z.uuid(),
    status: z.enum(prospectStatuses),
    last_message: z.string().max(3000).optional(),
    followup_at: z.union([z.iso.datetime(), z.literal("")]).optional(),
    notes: z.string().max(3000).optional(),
  }),
  z.object({
    action: z.literal("meeting.create"),
    lead_id: z.uuid(),
    title: z.string().min(2).max(150),
    starts_at: z.iso.datetime(),
    ends_at: z.iso.datetime(),
    notes: z.string().max(3000).optional(),
  }),
  z.object({ action: z.literal("meeting.cancel"), id: z.uuid() }),
  z.object({ action: z.literal("notification.read"), id: z.uuid() }),
  z.object({
    action: z.literal("tag.create"),
    name: z.string().trim().min(2).max(50),
  }),
  z.object({
    action: z.literal("tag.assign"),
    lead_id: z.uuid(),
    tag_id: z.uuid(),
    remove: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("score"),
    lead_id: z.uuid(),
    event: z.enum(["reply", "meeting", "high_intent", "no_response"]),
  }),
  z.object({
    action: z.literal("score.rule"),
    event: z.enum(["reply", "meeting", "high_intent", "no_response"]),
    points: z.number().int().min(-100).max(100),
  }),
  z.object({ action: z.literal("conversation.read"), id: z.uuid() }),
  z.object({
    action: z.literal("demo.message"),
    channel: z.enum(["whatsapp", "instagram"]),
    name: z.string().min(2).max(150),
    phone: z.string().max(40).optional(),
    instagram: z.string().max(80).optional(),
    body: z.string().min(1).max(5000),
  }),
]);
async function score(
  c: import("pg").PoolClient,
  lead: string,
  type: string,
  actor: string,
) {
  const points =
    (await c.query("SELECT points FROM score_rules WHERE event=$1", [type]))
      .rows[0]?.points || 0;
  const applied = await c.query(
    "INSERT INTO score_events(lead_id,event,points,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id",
    [lead, type, points, actor],
  );
  if (applied.rowCount) {
    await c.query(
      "UPDATE leads SET score=score+$1,updated_at=now() WHERE id=$2",
      [points, lead],
    );
    await event(
      c,
      lead,
      actor,
      "score",
      `Score ${points >= 0 ? "+" : ""}${points}: ${type}`,
    );
  }
}
export async function operate(input: unknown, actor: Actor) {
  const v = schema.parse(input);
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(902)");
    if (v.action === "prospect.create") {
      const username = normalizeInstagram(v.username);
      const existing = (
        await c.query(
          "SELECT p.*,u.name owner FROM prospects p JOIN users u ON u.id=p.owner_id WHERE username=$1",
          [username],
        )
      ).rows[0];
      if (existing)
        throw new AppError(
          409,
          `Este perfil já está sendo trabalhado por ${existing.owner}.`,
        );
      const existingLead = (
        await c.query(
          "SELECT l.*,u.name owner FROM leads l LEFT JOIN users u ON u.id=l.owner_id WHERE instagram=$1 AND deleted_at IS NULL",
          [username],
        )
      ).rows[0];
      if (existingLead)
        throw new AppError(
          409,
          `Este perfil já está no CRM e é trabalhado por ${existingLead.owner || "um SDR a distribuir"}.`,
        );
      const owner = actor.role === "admin" ? v.owner_id : actor.id;
      if (!owner) throw new AppError(400, "Escolha uma SDR");
      if (
        !(
          await c.query(
            "SELECT 1 FROM users WHERE id=$1 AND role='sdr' AND active",
            [owner],
          )
        ).rowCount
      )
        throw new AppError(400, "SDR inválido");
      const p = (
        await c.query(
          "INSERT INTO prospects(username,name,owner_id,notes) VALUES($1,$2,$3,$4) RETURNING id",
          [username, v.name, owner, v.notes],
        )
      ).rows[0];
      await audit(c, actor.id, "prospect.created", p.id, null, {
        username,
        owner,
      });
      return { id: p.id };
    }
    if (v.action === "prospect.update") {
      const p = (
        await c.query("SELECT * FROM prospects WHERE id=$1 FOR UPDATE", [v.id])
      ).rows[0];
      if (!p) throw new AppError(404, "Perfil não encontrado");
      if (actor.role !== "admin" && p.owner_id !== actor.id)
        throw new AppError(403, "Sem permissão");
      await c.query(
        "UPDATE prospects SET status=$1,last_message=COALESCE($2,last_message),followup_at=$3,notes=COALESCE($4,notes),first_contact_at=CASE WHEN $1<>'Não abordado' THEN COALESCE(first_contact_at,now()) ELSE first_contact_at END,updated_at=now() WHERE id=$5",
        [v.status, v.last_message, v.followup_at || null, v.notes, v.id],
      );
      if (v.status === "Convertido" && !p.lead_id) {
        const l = await ingest(
          c,
          { name: p.name, instagram: p.username, source: "Prospecção ativa" },
          actor,
        );
        await c.query("UPDATE prospects SET lead_id=$1 WHERE id=$2", [
          l.id,
          p.id,
        ]);
        await event(
          c,
          l.id,
          actor.id,
          "prospect",
          "Convertido da prospecção ativa",
          { prospect_id: p.id },
        );
      }
      await audit(
        c,
        actor.id,
        "prospect.updated",
        p.id,
        { status: p.status },
        v,
      );
      return { ok: true };
    }
    if (v.action === "meeting.create") {
      const l = await allowed(c, v.lead_id, actor);
      if (!l.owner_id) throw new AppError(400, "Lead sem responsável");
      if (new Date(v.ends_at) <= new Date(v.starts_at))
        throw new AppError(400, "Término deve ser posterior ao início");
      const m = (
        await c.query(
          "INSERT INTO meetings(lead_id,owner_id,title,starts_at,ends_at,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [l.id, l.owner_id, v.title, v.starts_at, v.ends_at, v.notes],
        )
      ).rows[0];
      await event(
        c,
        l.id,
        actor.id,
        "meeting",
        `Reunião agendada: ${v.title}`,
        { starts_at: v.starts_at, ends_at: v.ends_at },
      );
      await score(c, l.id, "meeting", actor.id);
      await audit(c, actor.id, "meeting.created", m.id, null, v);
      return { id: m.id };
    }
    if (v.action === "meeting.cancel") {
      const m = (
        await c.query("SELECT * FROM meetings WHERE id=$1 FOR UPDATE", [v.id])
      ).rows[0];
      if (!m) throw new AppError(404, "Reunião não encontrada");
      await allowed(c, m.lead_id, actor);
      await c.query(
        "UPDATE meetings SET cancelled_at=now(),updated_at=now() WHERE id=$1",
        [m.id],
      );
      await event(c, m.lead_id, actor.id, "meeting", "Reunião cancelada", {
        id: m.id,
      });
      return { ok: true };
    }
    if (v.action === "notification.read") {
      await c.query(
        "UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2",
        [v.id, actor.id],
      );
      return { ok: true };
    }
    if (v.action === "tag.create") {
      if (actor.role !== "admin")
        throw new AppError(403, "Somente administrador");
      const t = (
        await c.query("INSERT INTO tags(name) VALUES($1) RETURNING id", [
          v.name,
        ])
      ).rows[0];
      await audit(c, actor.id, "tag.created", t.id, null, v.name);
      return { id: t.id };
    }
    if (v.action === "tag.assign") {
      await allowed(c, v.lead_id, actor);
      if (
        !(await c.query("SELECT 1 FROM tags WHERE id=$1", [v.tag_id])).rowCount
      )
        throw new AppError(400, "Etiqueta inválida");
      if (v.remove)
        await c.query("DELETE FROM lead_tags WHERE lead_id=$1 AND tag_id=$2", [
          v.lead_id,
          v.tag_id,
        ]);
      else
        await c.query(
          "INSERT INTO lead_tags(lead_id,tag_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [v.lead_id, v.tag_id],
        );
      await event(
        c,
        v.lead_id,
        actor.id,
        "tag",
        v.remove ? "Etiqueta removida" : "Etiqueta adicionada",
        { tag_id: v.tag_id },
      );
      return { ok: true };
    }
    if (v.action === "score") {
      await allowed(c, v.lead_id, actor);
      await score(c, v.lead_id, v.event, actor.id);
      return { ok: true };
    }
    if (v.action === "score.rule") {
      if (actor.role !== "admin")
        throw new AppError(403, "Somente administrador");
      const prev = (
        await c.query(
          "SELECT points FROM score_rules WHERE event=$1 FOR UPDATE",
          [v.event],
        )
      ).rows[0];
      await c.query(
        "UPDATE score_rules SET points=$1,updated_at=now() WHERE event=$2",
        [v.points, v.event],
      );
      await audit(c, actor.id, "score.rule", actor.id, prev, v);
      return { ok: true };
    }
    if (v.action === "conversation.read") {
      const conv = (
        await c.query("SELECT * FROM conversations WHERE id=$1", [v.id])
      ).rows[0];
      if (!conv) throw new AppError(404, "Conversa não encontrada");
      await allowed(c, conv.lead_id, actor);
      await c.query(
        "UPDATE conversations SET unread=false,updated_at=now() WHERE id=$1",
        [v.id],
      );
      return {
        messages: (
          await c.query(
            "SELECT id,body,direction,created_at FROM messages WHERE conversation_id=$1 ORDER BY created_at",
            [v.id],
          )
        ).rows,
      };
    }
    if (v.action === "demo.message") {
      if (process.env.NODE_ENV === "production" || actor.role !== "admin")
        throw new AppError(
          403,
          "Mock disponível apenas em desenvolvimento para administradores",
        );
      if (
        (v.channel === "whatsapp" && !v.phone) ||
        (v.channel === "instagram" && !v.instagram)
      )
        throw new AppError(400, "Informe o identificador do canal");
      const l = await ingest(
        c,
        {
          name: v.name,
          phone: v.phone,
          instagram: v.instagram,
          source: v.channel === "whatsapp" ? "WhatsApp" : "Instagram",
        },
        null,
      );
      const conv = (
        await c.query(
          "INSERT INTO conversations(lead_id,channel,demo,unread,awaiting_reply) VALUES($1,$2,true,true,true) ON CONFLICT(lead_id,channel) DO UPDATE SET unread=true,awaiting_reply=true,updated_at=now() WHERE conversations.demo=true RETURNING id",
          [l.id, v.channel],
        )
      ).rows[0];
      if (!conv)
        throw new AppError(409, "Mock não pode escrever em conversa real");
      await c.query(
        "INSERT INTO messages(conversation_id,body,direction) VALUES($1,$2,'inbound')",
        [conv.id, v.body],
      );
      await event(
        c,
        l.id,
        null,
        "message",
        `Mensagem fictícia recebida (${v.channel}): ${v.body}`,
      );
      if (l.owner_id) {
        await score(c, l.id, "reply", actor.id);
        await c.query(
          "INSERT INTO notifications(user_id,lead_id,message) VALUES($1,$2,$3)",
          [l.owner_id, l.id, "Nova mensagem de demonstração recebida"],
        );
      }
      return { id: conv.id };
    }
  });
}
export async function operationData(actor: Actor) {
  const owner = actor.role === "admin" ? null : actor.id;
  const r = await Promise.all([
    pool.query(
      "SELECT p.*,u.name owner FROM prospects p JOIN users u ON u.id=p.owner_id WHERE ($1::uuid IS NULL OR p.owner_id=$1) ORDER BY p.created_at DESC LIMIT 1000",
      [owner],
    ),
    pool.query(
      "SELECT m.*,l.name lead_name FROM meetings m JOIN leads l ON l.id=m.lead_id WHERE m.cancelled_at IS NULL AND ($1::uuid IS NULL OR m.owner_id=$1) ORDER BY starts_at LIMIT 500",
      [owner],
    ),
    pool.query(
      "SELECT c.*,l.name lead_name,l.owner_id,u.name owner,msg.body last_message,msg.created_at last_message_at FROM conversations c JOIN leads l ON l.id=c.lead_id LEFT JOIN users u ON u.id=l.owner_id LEFT JOIN LATERAL(SELECT body,created_at FROM messages WHERE conversation_id=c.id ORDER BY created_at DESC LIMIT 1) msg ON true WHERE l.deleted_at IS NULL AND ($1::uuid IS NULL OR l.owner_id=$1) ORDER BY c.updated_at DESC LIMIT 500",
      [owner],
    ),
    pool.query("SELECT * FROM tags ORDER BY name"),
    pool.query(
      "SELECT lt.* FROM lead_tags lt JOIN leads l ON l.id=lt.lead_id WHERE ($1::uuid IS NULL OR l.owner_id=$1)",
      [owner],
    ),
    pool.query("SELECT * FROM score_rules ORDER BY event"),
  ]);
  return {
    development: process.env.NODE_ENV !== "production",
    demoMode: process.env.DEMO_MODE === "true",
    prospects: r[0].rows,
    meetings: r[1].rows,
    conversations: r[2].rows,
    tags: r[3].rows,
    leadTags: r[4].rows,
    scoreRules: r[5].rows,
  };
}
export async function syncNotifications(actor: Actor) {
  await pool.query(
    "INSERT INTO notifications(user_id,lead_id,message,event_key) SELECT l.owner_id,l.id,'Lead aguardando primeiro atendimento','sla:'||l.id FROM leads l JOIN pipeline_stages s ON s.id=l.stage_id CROSS JOIN settings WHERE l.owner_id=$1 AND l.deleted_at IS NULL AND l.first_contact_at IS NULL AND s.kind='open' AND l.created_at<now()-settings.sla_minutes*interval '1 minute' ON CONFLICT(event_key) DO NOTHING",
    [actor.id],
  );
  await pool.query(
    "INSERT INTO notifications(user_id,lead_id,message,event_key) SELECT owner_id,lead_id,'Follow-up vencendo ou atrasado','followup:'||id FROM followups WHERE owner_id=$1 AND completed_at IS NULL AND due_at<now()+interval '1 hour' ON CONFLICT(event_key) DO NOTHING",
    [actor.id],
  );
  await pool.query(
    "INSERT INTO notifications(user_id,lead_id,message,event_key) SELECT owner_id,lead_id,'Reunião próxima: '||title,'meeting:'||id FROM meetings WHERE owner_id=$1 AND cancelled_at IS NULL AND starts_at BETWEEN now() AND now()+interval '1 hour' ON CONFLICT(event_key) DO NOTHING",
    [actor.id],
  );
}
