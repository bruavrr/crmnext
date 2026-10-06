import { pool, transaction } from "../src/lib/db";
import { createLead, leadAction, createTask } from "../src/lib/crm";
import { operate } from "../src/lib/operations";
const demo = process.argv.includes("--demo");
if (
  process.env.NODE_ENV === "production" &&
  (demo ||
    !process.env.BOOTSTRAP_ADMIN_EMAIL ||
    !process.env.MARIA_EMAIL ||
    !process.env.BRUNA_EMAIL)
)
  throw new Error(
    "Produção exige e-mails reais no servidor e não permite --demo",
  );
await transaction(async (c) => {
  await c.query("SELECT pg_advisory_xact_lock(903)");
  for (const [name, email, role] of [
    [
      "Administrador",
      process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@nextdim.local",
      "admin",
    ],
    ["Maria Clara", process.env.MARIA_EMAIL || "maria@nextdim.local", "sdr"],
    ["Bruna", process.env.BRUNA_EMAIL || "bruna@nextdim.local", "sdr"],
  ])
    await c.query(
      "INSERT INTO users(name,email,role) VALUES($1,$2,$3) ON CONFLICT(email) DO NOTHING",
      [name, email, role],
    );
  const stages = [
    ["Lead novo", "new"],
    ["Tentativa de contato", "attempt"],
    ["Contato realizado", "contact"],
    ["Qualificado", "qualified"],
    ["Reunião agendada", "meeting_scheduled"],
    ["Reunião realizada", "meeting_held"],
    ["Proposta enviada", "proposal"],
    ["Negociação", "negotiation"],
    ["Fechado / Ganho", "won"],
    ["Perdido", "lost"],
  ];
  // Only initialize a new pipeline; never overwrite administrative customization.
  if (!(await c.query("SELECT 1 FROM pipeline_stages LIMIT 1")).rowCount)
    for (const [i, [name, key]] of stages.entries())
      await c.query(
        "INSERT INTO pipeline_stages(name,position,kind,system_key) VALUES($1,$2,$3,$4)",
        [name, i, i === 8 ? "won" : i === 9 ? "lost" : "open", key],
      );
  for (const name of [
    "Tráfego Pago",
    "Instagram",
    "WhatsApp",
    "Indicação",
    "Prospecção Ativa",
    "Urgente",
    "Sem resposta",
    "Reunião marcada",
    "Follow-up",
    "Cliente antigo",
  ])
    await c.query("INSERT INTO tags(name) VALUES($1) ON CONFLICT DO NOTHING", [
      name,
    ]);
  for (const provider of [
    "Meta Ads",
    "WhatsApp",
    "Instagram",
    "Google Calendar",
    "Formulários/Webhooks",
  ])
    await c.query(
      "INSERT INTO integrations(provider) VALUES($1) ON CONFLICT DO NOTHING",
      [provider],
    );
});
if (demo) {
  const admin = (
    await pool.query(
      "SELECT id,role,name FROM users WHERE role='admin' ORDER BY created_at LIMIT 1",
    )
  ).rows[0];
  const stages = (
    await pool.query("SELECT * FROM pipeline_stages ORDER BY position")
  ).rows;
  const names = [
    "Ana Costa",
    "Pedro Martins",
    "Camila Rocha",
    "Rafael Lima",
    "Juliana Alves",
    "Lucas Ferreira",
    "Beatriz Santos",
    "Marcos Silva",
    "Fernanda Melo",
    "Diego Souza",
    "Carolina Dias",
    "Gabriel Oliveira",
    "Larissa Nunes",
    "Thiago Ribeiro",
    "Patrícia Ramos",
    "André Barros",
    "Mariana Torres",
    "Felipe Castro",
    "Renata Pinto",
    "Bruno Duarte",
  ];
  for (const [i, name] of names.entries()) {
    const phone = `1198000${String(i).padStart(4, "0")}`;
    const existing = (
      await pool.query("SELECT id FROM leads WHERE email=$1", [
        `demo.${i}@example.test`,
      ])
    ).rows[0];
    if (existing && !process.argv.includes("--enrich-existing-demo")) continue;
    const l = await createLead(
      {
        name,
        email: `demo.${i}@example.test`,
        phone,
        instagram: `demo_nextgen_${i}`,
        company: [
          "Studio Aurora",
          "Vértice Saúde",
          "Casa & Forma",
          "Atlas Digital",
        ][i % 4],
        source: ["Meta Ads", "Instagram", "WhatsApp", "Indicação"][i % 4],
        campaign: "Demonstração · Comercial",
      },
      null,
    );
    await pool.query(
      "UPDATE leads SET temperature=$1,potential_value=$2,created_at=now()-($3::int*interval '1 hour') WHERE id=$4",
      [["hot", "warm", "cold"][i % 3], 1500 + i * 250, i, l.id],
    );
    if (i % 3 !== 0)
      await leadAction(
        l.id,
        {
          action: "contact",
          note: "[DEMO] Primeiro contato registrado por telefone",
        },
        admin,
      );
    const stage = stages[i % stages.length];
    await leadAction(
      l.id,
      {
        action: "stage",
        stage_id: stage.id,
        ...(stage.kind === "won"
          ? {
              amount: 3000 + i * 150,
              service: "[DEMO] Gestão de tráfego",
              closed_at: new Date().toISOString(),
            }
          : stage.kind === "lost"
            ? { reason: "Não é o momento", notes: "[DEMO] Registro fictício" }
            : {}),
      },
      admin,
    );
    if (i % 3 === 0 && l.owner_id)
      await leadAction(
        l.id,
        {
          action: "followup",
          due_at: new Date(
            Date.now() + (i % 2 === 0 ? -2 : 2) * 3600000,
          ).toISOString(),
        },
        admin,
      );
    if (i % 4 === 1 && l.owner_id)
      await createTask(
        {
          title: "[DEMO] Enviar apresentação",
          lead_id: l.id,
          due_at: new Date(Date.now() + i * 3600000).toISOString(),
          priority: i % 2 ? "high" : "normal",
        },
        admin,
      );
    if (i % 10 === 4 && l.owner_id)
      await operate(
        {
          action: "meeting.create",
          lead_id: l.id,
          title: "[DEMO] Reunião de diagnóstico",
          starts_at: new Date(Date.now() + i * 3600000).toISOString(),
          ends_at: new Date(Date.now() + (i + 1) * 3600000).toISOString(),
        },
        admin,
      );
    if (i < 3)
      await operate(
        {
          action: "demo.message",
          name,
          phone,
          instagram: `demo_nextgen_${i}`,
          channel: i % 2 ? "instagram" : "whatsapp",
          body: "[DEMO] Olá! Gostaria de saber mais sobre os serviços de marketing.",
        },
        admin,
      );
  }
  console.log(
    "Seed de demonstração: leads, vendas, perdas, tarefas, follow-ups, reuniões e mensagens fictícias em example.test.",
  );
}
console.log(
  "Seed concluído. Nenhuma senha padrão: gere convites com npm run user:invite.",
);
await pool.end();
