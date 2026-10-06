import { z } from "zod";
import { PoolClient } from "pg";
import { pool, transaction, AppError } from "./db";
export type Actor = { id: string; role: string; name?: string };
export const leadSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    phone: z.string().max(40).optional(),
    email: z
      .union([z.string().trim().toLowerCase().email(), z.literal("")])
      .optional(),
    instagram: z.string().max(80).optional(),
    company: z.string().max(150).optional(),
    source: z.string().min(1).max(100).default("Cadastro manual"),
    campaign: z.string().max(200).optional(),
    ad_set: z.string().max(200).optional(),
    ad: z.string().max(200).optional(),
    utm_source: z.string().max(200).optional(),
    utm_medium: z.string().max(200).optional(),
    utm_campaign: z.string().max(200).optional(),
    utm_content: z.string().max(200).optional(),
  })
  .refine(
    (v) => v.phone || v.email || v.instagram,
    "Informe telefone, e-mail ou Instagram",
  );
export function normalizePhone(input?: string) {
  if (!input?.trim()) return null;
  const raw = input.trim();
  if (!/^\+?[\d().\s-]+$/.test(raw))
    throw new AppError(400, "Telefone inválido");
  const explicit =
    raw.startsWith("+") || raw.replace(/\D/g, "").startsWith("00");
  let p = raw.replace(/\D/g, "");
  if (p.startsWith("00")) p = p.slice(2);
  if (!explicit && (p.length === 10 || p.length === 11)) p = "55" + p;
  if (p.startsWith("0") || p.length < 10 || p.length > 15)
    throw new AppError(
      400,
      "Telefone inválido. Use +DDI para números internacionais.",
    );
  return p;
}
export function normalizeInstagram(input?: string) {
  if (!input?.trim()) return null;
  let value = input.trim().toLowerCase();
  if (value.startsWith("https://") || value.startsWith("http://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new AppError(400, "Perfil Instagram inválido");
    }
    if (!["instagram.com", "www.instagram.com"].includes(url.hostname))
      throw new AppError(400, "Use um perfil oficial do Instagram");
    value = url.pathname.split("/").filter(Boolean)[0] || "";
  }
  value = value.replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/.test(value))
    throw new AppError(400, "Username do Instagram inválido");
  return value;
}
export async function rememberIdentifiers(
  c: PoolClient,
  id: string,
  values: {
    phone: string | null;
    email: string | null;
    instagram: string | null;
  },
) {
  for (const [kind, value] of Object.entries(values)) {
    if (!value) continue;
    const conflict = (
      await c.query(
        "SELECT lead_id FROM lead_identifiers WHERE kind=$1 AND value=$2",
        [kind, value],
      )
    ).rows[0];
    if (conflict && conflict.lead_id !== id)
      throw new AppError(409, "Identificador já pertence a outro lead");
    await c.query(
      "INSERT INTO lead_identifiers(kind,value,lead_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [kind, value, id],
    );
  }
}
export async function event(
  c: PoolClient,
  lead: string,
  actor: string | null,
  type: string,
  description: string,
  metadata: unknown = {},
) {
  await c.query(
    "INSERT INTO activities(lead_id,actor_id,type,description,metadata) VALUES($1,$2,$3,$4,$5)",
    [lead, actor, type, description, JSON.stringify(metadata)],
  );
}
export async function audit(
  c: PoolClient,
  actor: string | null,
  action: string,
  id: string,
  previous: unknown,
  next: unknown,
) {
  await c.query(
    "INSERT INTO audit_logs(actor_id,action,record_id,previous,next) VALUES($1,$2,$3,$4,$5)",
    [actor, action, id, JSON.stringify(previous), JSON.stringify(next)],
  );
}
export async function allowed(c: PoolClient, id: string, actor: Actor) {
  const l = (
    await c.query(
      "SELECT * FROM leads WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
      [id],
    )
  ).rows[0];
  if (!l) throw new AppError(404, "Lead não encontrado");
  if (actor.role !== "admin" && l.owner_id !== actor.id)
    throw new AppError(403, "Sem permissão para este lead");
  return l;
}
async function assign(c: PoolClient, leadId: string) {
  const state = (
    await c.query("SELECT * FROM round_robin_state WHERE id=1 FOR UPDATE")
  ).rows[0];
  const eligible = (
    await c.query(
      "SELECT * FROM users WHERE role='sdr' AND active AND rotation_enabled AND availability='available' ORDER BY rotation_order",
    )
  ).rows;
  const next =
    eligible.find((u) => BigInt(u.rotation_order) > BigInt(state.last_order)) ||
    eligible[0];
  if (!next) return null;
  await c.query("UPDATE leads SET owner_id=$1,updated_at=now() WHERE id=$2", [
    next.id,
    leadId,
  ]);
  await c.query(
    "UPDATE round_robin_state SET last_order=$1,updated_at=now() WHERE id=1",
    [next.rotation_order],
  );
  await c.query(
    "INSERT INTO lead_assignments(lead_id,owner_id,automatic) VALUES($1,$2,true)",
    [leadId, next.id],
  );
  await event(
    c,
    leadId,
    null,
    "assignment",
    `Distribuído automaticamente para ${next.name}`,
  );
  await c.query(
    "INSERT INTO notifications(user_id,lead_id,message) VALUES($1,$2,$3)",
    [next.id, leadId, "Novo lead atribuído a você"],
  );
  return next.id;
}
export async function ingest(
  c: PoolClient,
  input: unknown,
  actor: Actor | null,
) {
  const v = leadSchema.parse(input);
  await c.query("SELECT pg_advisory_xact_lock(902)");
  const phone = normalizePhone(v.phone),
    email = v.email?.trim().toLowerCase() || null,
    instagram = normalizeInstagram(v.instagram);
  const matches = (
    await c.query(
      "SELECT * FROM leads WHERE deleted_at IS NULL AND (($1::text IS NOT NULL AND phone=$1) OR ($2::text IS NOT NULL AND email=$2) OR ($3::text IS NOT NULL AND instagram=$3) OR id IN (SELECT lead_id FROM lead_identifiers WHERE (kind='phone' AND value=$1) OR (kind='email' AND value=$2) OR (kind='instagram' AND value=$3))) FOR UPDATE",
      [phone, email, instagram],
    )
  ).rows;
  if (matches.length > 1)
    throw new AppError(
      409,
      "Os identificadores correspondem a contatos diferentes; revisão administrativa necessária.",
    );
  if (matches[0]) {
    const l = matches[0];
    if (actor && actor.role !== "admin" && l.owner_id !== actor.id)
      throw new AppError(
        409,
        `Este contato já está sendo trabalhado por ${(await c.query("SELECT name FROM users WHERE id=$1", [l.owner_id])).rows[0]?.name || "outro responsável"}.`,
      );
    await c.query(
      "UPDATE leads SET phone=COALESCE(phone,$1),email=COALESCE(email,$2),instagram=COALESCE(instagram,$3),updated_at=now() WHERE id=$4",
      [phone, email, instagram, l.id],
    );
    await rememberIdentifiers(c, l.id, { phone, email, instagram });
    await c.query(
      "INSERT INTO lead_sources(lead_id,source,campaign) VALUES($1,$2,$3)",
      [l.id, v.source, v.campaign],
    );
    await event(
      c,
      l.id,
      actor?.id || null,
      "interaction",
      `Nova entrada por ${v.source}; contato existente preservado`,
    );
    return { id: l.id, duplicate: true, owner_id: l.owner_id };
  }
  const stage = (
    await c.query(
      "SELECT id FROM pipeline_stages WHERE kind='open' ORDER BY position LIMIT 1",
    )
  ).rows[0];
  if (!stage) throw new AppError(503, "Pipeline não configurado");
  const cols = [
    "name",
    "phone",
    "email",
    "instagram",
    "company",
    "source",
    "campaign",
    "ad_set",
    "ad",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_content",
    "stage_id",
  ];
  const vals = [
    v.name,
    phone,
    email,
    instagram,
    v.company || null,
    v.source,
    v.campaign || null,
    v.ad_set || null,
    v.ad || null,
    v.utm_source || null,
    v.utm_medium || null,
    v.utm_campaign || null,
    v.utm_content || null,
    stage.id,
  ];
  const l = (
    await c.query(
      `INSERT INTO leads(${cols.join(",")}) VALUES(${vals.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
      vals,
    )
  ).rows[0];
  await c.query(
    "INSERT INTO lead_sources(lead_id,source,campaign) VALUES($1,$2,$3)",
    [l.id, v.source, v.campaign],
  );
  await rememberIdentifiers(c, l.id, { phone, email, instagram });
  await event(
    c,
    l.id,
    actor?.id || null,
    "created",
    `Lead recebido por ${v.source}`,
  );
  await audit(c, actor?.id || null, "lead.created", l.id, null, {
    name: l.name,
    source: l.source,
  });
  const owner = await assign(c, l.id);
  if (!owner)
    await event(
      c,
      l.id,
      null,
      "queued",
      "Aguardando distribuição: nenhum SDR disponível",
    );
  return { id: l.id, duplicate: false, owner_id: owner };
}
export const createLead = (input: unknown, actor: Actor | null) =>
  transaction((c) => ingest(c, input, actor));
export async function drainQueued(c: PoolClient) {
  await c.query("SELECT pg_advisory_xact_lock(902)");
  await c.query("SELECT * FROM round_robin_state WHERE id=1 FOR UPDATE");
  const queued = (
    await c.query(
      "SELECT id FROM leads WHERE owner_id IS NULL AND deleted_at IS NULL ORDER BY created_at,id FOR UPDATE",
    )
  ).rows;
  for (const l of queued) if (!(await assign(c, l.id))) break;
}
export async function availability(id: string, input: unknown, actor: Actor) {
  if (actor.role !== "admin") throw new AppError(403, "Somente administrador");
  const v = z
    .object({
      availability: z.enum(["available", "unavailable", "leave"]),
      active: z.boolean(),
      rotation_enabled: z.boolean(),
    })
    .parse(input);
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(902)");
    await c.query("SELECT * FROM round_robin_state WHERE id=1 FOR UPDATE");
    const prev = (
      await c.query("SELECT * FROM users WHERE id=$1 AND role='sdr'", [id])
    ).rows[0];
    if (!prev) throw new AppError(404, "SDR não encontrado");
    await c.query(
      "UPDATE users SET availability=$1,active=$2,rotation_enabled=$3,updated_at=now() WHERE id=$4",
      [v.availability, v.active, v.rotation_enabled, id],
    );
    await audit(
      c,
      actor.id,
      "user.availability",
      id,
      {
        availability: prev.availability,
        active: prev.active,
        rotation_enabled: prev.rotation_enabled,
      },
      v,
    );
    await drainQueued(c);
    return { ok: true };
  });
}
export async function leadAction(id: string, input: unknown, actor: Actor) {
  const v = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("update"),
        name: z.string().trim().min(2).max(150),
        phone: z.string().max(40).optional(),
        email: z
          .union([z.string().trim().toLowerCase().email(), z.literal("")])
          .optional(),
        instagram: z.string().max(80).optional(),
        company: z.string().max(150).optional(),
        job_title: z.string().max(100).optional(),
        city: z.string().max(100).optional(),
        state: z.string().max(50).optional(),
        potential_value: z.number().min(0).max(1e12),
        notes: z.string().max(5000).optional(),
      }),
      z.object({
        action: z.literal("contact"),
        note: z.string().min(1).max(3000),
      }),
      z.object({
        action: z.literal("note"),
        note: z.string().min(1).max(5000),
      }),
      z.object({
        action: z.literal("stage"),
        stage_id: z.uuid(),
        amount: z.number().positive().max(1e12).optional(),
        service: z.string().min(1).max(200).optional(),
        closed_at: z.iso.datetime().optional(),
        reason: z.string().min(1).max(200).optional(),
        notes: z.string().max(3000).optional(),
      }),
      z.object({ action: z.literal("assign"), owner_id: z.uuid() }),
      z.object({ action: z.literal("followup"), due_at: z.iso.datetime() }),
      z.object({
        action: z.literal("temperature"),
        temperature: z.enum(["hot", "warm", "cold", "unclassified"]),
      }),
    ])
    .parse(input);
  return transaction(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(902)");
    const l = await allowed(c, id, actor);
    if (v.action === "update") {
      const phone = normalizePhone(v.phone),
        email = v.email?.trim().toLowerCase() || null,
        instagram = normalizeInstagram(v.instagram);
      if (!phone && !email && !instagram)
        throw new AppError(400, "Informe telefone, e-mail ou Instagram");
      await c.query(
        "UPDATE leads SET name=$1,phone=$2,email=$3,instagram=$4,company=$5,job_title=$6,city=$7,state=$8,potential_value=$9,notes=$10,updated_at=now() WHERE id=$11",
        [
          v.name,
          phone,
          email,
          instagram,
          v.company || null,
          v.job_title || null,
          v.city || null,
          v.state || null,
          v.potential_value,
          v.notes || null,
          id,
        ],
      );
      await rememberIdentifiers(c, id, { phone, email, instagram });
      await event(c, id, actor.id, "updated", "Dados do lead atualizados");
      await audit(
        c,
        actor.id,
        "lead.updated",
        id,
        {
          name: l.name,
          phone: l.phone,
          email: l.email,
          instagram: l.instagram,
          company: l.company,
          job_title: l.job_title,
          city: l.city,
          state: l.state,
          potential_value: l.potential_value,
          notes: l.notes,
        },
        v,
      );
    }
    if (v.action === "contact") {
      await c.query(
        "UPDATE leads SET first_contact_at=COALESCE(first_contact_at,now()),last_contact_at=now(),updated_at=now() WHERE id=$1",
        [id],
      );
      await event(c, id, actor.id, "contact", v.note);
    }
    if (v.action === "note") await event(c, id, actor.id, "note", v.note);
    if (v.action === "temperature") {
      await c.query(
        "UPDATE leads SET temperature=$1,updated_at=now() WHERE id=$2",
        [v.temperature, id],
      );
      await event(
        c,
        id,
        actor.id,
        "temperature",
        `Temperatura: ${v.temperature}`,
      );
    }
    if (v.action === "followup") {
      if (!l.owner_id)
        throw new AppError(400, "Distribua o lead antes de criar follow-up");
      await c.query(
        "UPDATE followups SET completed_at=now(),updated_at=now() WHERE lead_id=$1 AND completed_at IS NULL",
        [id],
      );
      await c.query(
        "INSERT INTO followups(lead_id,owner_id,due_at) VALUES($1,$2,$3)",
        [id, l.owner_id, v.due_at],
      );
      await event(c, id, actor.id, "followup", "Follow-up agendado", {
        due_at: v.due_at,
      });
    }
    if (v.action === "assign") {
      if (actor.role !== "admin")
        throw new AppError(403, "Somente administrador");
      const u = (
        await c.query(
          "SELECT * FROM users WHERE id=$1 AND role='sdr' AND active",
          [v.owner_id],
        )
      ).rows[0];
      if (!u) throw new AppError(400, "SDR inválido");
      await c.query(
        "UPDATE leads SET owner_id=$1,updated_at=now() WHERE id=$2",
        [u.id, id],
      );
      await c.query(
        "UPDATE tasks SET owner_id=$1,updated_at=now() WHERE lead_id=$2 AND completed_at IS NULL",
        [u.id, id],
      );
      await c.query(
        "UPDATE followups SET owner_id=$1,updated_at=now() WHERE lead_id=$2 AND completed_at IS NULL",
        [u.id, id],
      );
      await c.query(
        "UPDATE meetings SET owner_id=$1,updated_at=now() WHERE lead_id=$2 AND cancelled_at IS NULL",
        [u.id, id],
      );
      await c.query(
        "INSERT INTO lead_assignments(lead_id,previous_owner_id,owner_id,actor_id,automatic) VALUES($1,$2,$3,$4,false)",
        [id, l.owner_id, u.id, actor.id],
      );
      await event(
        c,
        id,
        actor.id,
        "assignment",
        `Responsável alterado para ${u.name}`,
        { previous: l.owner_id, next: u.id },
      );
      await audit(c, actor.id, "lead.assignment", id, l.owner_id, u.id);
      await c.query(
        "INSERT INTO notifications(user_id,lead_id,message) VALUES($1,$2,$3)",
        [u.id, id, "Lead redistribuído para você"],
      );
    }
    if (v.action === "stage") {
      const s = (
        await c.query("SELECT * FROM pipeline_stages WHERE id=$1", [v.stage_id])
      ).rows[0];
      if (!s) throw new AppError(400, "Etapa inválida");
      if (s.id === l.stage_id) return { ok: true };
      if (s.kind === "won") {
        if (!v.amount || !v.service || !v.closed_at)
          throw new AppError(
            400,
            "Informe valor, serviço e data de fechamento",
          );
        await c.query(
          "INSERT INTO sales(lead_id,owner_id,amount,service,closed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(lead_id) DO UPDATE SET owner_id=excluded.owner_id,amount=excluded.amount,service=excluded.service,closed_at=excluded.closed_at,updated_at=now()",
          [id, l.owner_id, v.amount, v.service, v.closed_at],
        );
      }
      if (s.kind === "lost") {
        if (!v.reason) throw new AppError(400, "Informe o motivo de perda");
        await c.query(
          "INSERT INTO loss_reasons(lead_id,reason,notes) VALUES($1,$2,$3) ON CONFLICT(lead_id) DO UPDATE SET reason=excluded.reason,notes=excluded.notes,updated_at=now()",
          [id, v.reason, v.notes],
        );
      }
      await c.query(
        "UPDATE leads SET stage_id=$1,updated_at=now() WHERE id=$2",
        [s.id, id],
      );
      await c.query(
        "INSERT INTO lead_stage_history(lead_id,previous_stage_id,stage_id,actor_id) VALUES($1,$2,$3,$4)",
        [id, l.stage_id, s.id, actor.id],
      );
      await event(c, id, actor.id, "stage", `Etapa alterada para ${s.name}`, {
        previous: l.stage_id,
        next: s.id,
        ...v,
      });
      await audit(c, actor.id, "lead.stage", id, l.stage_id, s.id);
    }
    return { ok: true };
  });
}
export async function createTask(input: unknown, actor: Actor) {
  const v = z
    .object({
      title: z.string().min(1).max(200),
      description: z.string().max(3000).optional(),
      lead_id: z.uuid(),
      due_at: z.iso.datetime(),
      priority: z.enum(["low", "normal", "high"]).default("normal"),
    })
    .parse(input);
  return transaction(async (c) => {
    const l = await allowed(c, v.lead_id, actor);
    if (!l.owner_id) throw new AppError(400, "Lead sem responsável");
    await c.query(
      "INSERT INTO tasks(title,description,lead_id,owner_id,due_at,priority) VALUES($1,$2,$3,$4,$5,$6)",
      [v.title, v.description, l.id, l.owner_id, v.due_at, v.priority],
    );
    await event(c, l.id, actor.id, "task", `Tarefa criada: ${v.title}`);
    return { ok: true };
  });
}
export async function completeItem(
  kind: "tasks" | "followups",
  id: string,
  actor: Actor,
) {
  return transaction(async (c) => {
    const r = (
      await c.query(`SELECT * FROM ${kind} WHERE id=$1 FOR UPDATE`, [id])
    ).rows[0];
    if (!r) throw new AppError(404, "Registro não encontrado");
    if (actor.role !== "admin" && r.owner_id !== actor.id)
      throw new AppError(403, "Sem permissão");
    await c.query(
      `UPDATE ${kind} SET completed_at=COALESCE(completed_at,now()),updated_at=now() WHERE id=$1`,
      [id],
    );
    if (r.lead_id && !r.completed_at)
      await event(
        c,
        r.lead_id,
        actor.id,
        "completed",
        kind === "tasks"
          ? `Tarefa concluída: ${r.title}`
          : "Follow-up concluído",
      );
    return { ok: true };
  });
}
export async function consumeRate(key: string, max: number) {
  const window = Math.floor(Date.now() / 60000);
  const r = await pool.query(
    "INSERT INTO rate_limits(key,bucket,count) VALUES($1,$2,1) ON CONFLICT(key,bucket) DO UPDATE SET count=rate_limits.count+1 RETURNING count",
    [key, window],
  );
  if (r.rows[0].count > max)
    throw new AppError(429, "Limite de requisições excedido");
}
