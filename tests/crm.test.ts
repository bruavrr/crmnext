import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import {
  operate,
  operationData,
  syncNotifications,
} from "../src/lib/operations";
import { importCsv, safeCsvCell } from "../src/lib/csv";
import { DisconnectedMetaAdapter } from "../src/lib/integrations/adapters";
import { pool } from "../src/lib/db";
import {
  createLead,
  availability,
  leadAction,
  createTask,
  completeItem,
  normalizePhone,
  Actor,
} from "../src/lib/crm";
import { verifySignature, webhookIngest } from "../src/lib/webhook";
let maria: Actor,
  bruna: Actor,
  admin: Actor,
  stages: { id: string; kind: string; name: string }[];
beforeAll(async () => {
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await pool.query(await readFile("migrations/001_initial.sql", "utf8"));
  await pool.query(await readFile("migrations/002_operations.sql", "utf8"));
  await pool.query(await readFile("migrations/003_modules.sql", "utf8"));
  await pool.query(
    await readFile("migrations/004_search_identity.sql", "utf8"),
  );
});
beforeEach(async () => {
  await pool.query(
    "TRUNCATE users,pipeline_stages,leads,activities,lead_assignments,lead_stage_history,lead_sources,tasks,followups,sales,loss_reasons,notifications,audit_logs,webhook_receipts,rate_limits,prospects,score_events,meetings,conversations,messages,lead_identifiers RESTART IDENTITY CASCADE",
  );
  await pool.query("UPDATE round_robin_state SET last_order=0");
  maria = (
    await pool.query(
      "INSERT INTO users(name,email,role) VALUES('Maria Clara','maria@test.local','sdr') RETURNING id,name,role",
    )
  ).rows[0];
  bruna = (
    await pool.query(
      "INSERT INTO users(name,email,role) VALUES('Bruna','bruna@test.local','sdr') RETURNING id,name,role",
    )
  ).rows[0];
  admin = (
    await pool.query(
      "INSERT INTO users(name,email,role) VALUES('Admin','admin@test.local','admin') RETURNING id,name,role",
    )
  ).rows[0];
  stages = (
    await pool.query(
      "INSERT INTO pipeline_stages(name,position,kind) VALUES('Lead novo',0,'open'),('Qualificado',1,'open'),('Ganho',2,'won'),('Perdido',3,'lost') RETURNING *",
    )
  ).rows;
});
afterAll(() => pool.end());
const lead = (n: number) => ({
  name: `Lead ${n}`,
  email: `lead.${n}@example.test`,
  source: "Meta Ads",
});
describe("Round Robin persistido", () => {
  it("alterna 2 SDRs e persiste cursor", async () => {
    const a = await createLead(lead(1), admin),
      b = await createLead(lead(2), admin),
      c = await createLead(lead(3), admin);
    expect([a.owner_id, b.owner_id, c.owner_id]).toEqual([
      maria.id,
      bruna.id,
      maria.id,
    ]);
    const state = (await pool.query("SELECT last_order FROM round_robin_state"))
      .rows[0];
    expect(Number(state.last_order)).toBe(1);
  });
  it("ignora indisponível e retoma quando volta", async () => {
    await createLead(lead(1), admin);
    await availability(
      bruna.id,
      { availability: "unavailable", active: true, rotation_enabled: true },
      admin,
    );
    expect((await createLead(lead(2), admin)).owner_id).toBe(maria.id);
    await availability(
      bruna.id,
      { availability: "available", active: true, rotation_enabled: true },
      admin,
    );
    expect((await createLead(lead(3), admin)).owner_id).toBe(bruna.id);
  });
  it("suporta 3 SDRs sem mudar código", async () => {
    const third = (
      await pool.query(
        "INSERT INTO users(name,email,role) VALUES('Terceira','third@test.local','sdr') RETURNING id",
      )
    ).rows[0];
    const ids = [];
    for (let i = 0; i < 6; i++)
      ids.push((await createLead(lead(i), admin)).owner_id);
    expect(ids).toEqual([
      maria.id,
      bruna.id,
      third.id,
      maria.id,
      bruna.id,
      third.id,
    ]);
  });
  it("distribui 40 entradas simultâneas exatamente 20/20", async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, i) => createLead(lead(i), null)),
    );
    expect(results.filter((l) => l.owner_id === maria.id)).toHaveLength(20);
    expect(results.filter((l) => l.owner_id === bruna.id)).toHaveLength(20);
    const history = (
      await pool.query(
        "SELECT owner_id FROM lead_assignments ORDER BY created_at,id",
      )
    ).rows;
    expect(history).toHaveLength(40);
    expect(
      (await pool.query("SELECT count(*) FROM notifications")).rows[0].count,
    ).toBe("40");
  });
  it("enfileira sem SDR e drena ao disponibilizar", async () => {
    for (const u of [maria, bruna])
      await availability(
        u.id,
        { availability: "leave", active: true, rotation_enabled: true },
        admin,
      );
    const l = await createLead(lead(1), admin);
    expect(l.owner_id).toBeNull();
    await availability(
      bruna.id,
      { availability: "available", active: true, rotation_enabled: true },
      admin,
    );
    expect(
      (await pool.query("SELECT owner_id FROM leads WHERE id=$1", [l.id]))
        .rows[0].owner_id,
    ).toBe(bruna.id);
  });
  it("desativação do rodízio não avança indevidamente o cursor", async () => {
    await availability(
      maria.id,
      { availability: "available", active: true, rotation_enabled: false },
      admin,
    );
    expect((await createLead(lead(1), admin)).owner_id).toBe(bruna.id);
  });
});
describe("Deduplicação e ingestão", () => {
  it("normaliza DDI brasileiro e rejeita inválidos", () => {
    expect(normalizePhone("(11) 99999-1234")).toBe("5511999991234");
    expect(normalizePhone("+55 11 99999-1234")).toBe("5511999991234");
    expect(normalizePhone("+1 212 555 1234")).toBe("12125551234");
    expect(() => normalizePhone("abc11999991234")).toThrow();
    expect(() => normalizePhone("123")).toThrow();
  });
  it("deduplica por telefone, email e instagram sem consumir rodada", async () => {
    const l = await createLead(
      { ...lead(1), phone: "(11) 99999-1234", instagram: "@Nome" },
      admin,
    );
    for (const input of [
      { name: "Outro", phone: "+55 11 99999-1234" },
      { name: "Outro", email: "LEAD.1@example.test" },
      { name: "Outro", instagram: "nome" },
    ]) {
      const r = await createLead(input, admin);
      expect(r.id).toBe(l.id);
      expect(r.duplicate).toBe(true);
    }
    expect((await createLead(lead(2), admin)).owner_id).toBe(bruna.id);
    expect(
      (
        await pool.query("SELECT count(*) FROM lead_sources WHERE lead_id=$1", [
          l.id,
        ])
      ).rows[0].count,
    ).toBe("4");
  });
  it("20 duplicatas concorrentes criam somente um contato", async () => {
    const r = await Promise.all(
      Array.from({ length: 20 }, () => createLead(lead(1), null)),
    );
    expect(new Set(r.map((l) => l.id)).size).toBe(1);
    expect(r.filter((l) => !l.duplicate)).toHaveLength(1);
  });
  it("conflito entre identificadores requer revisão", async () => {
    await createLead({ ...lead(1), phone: "11999991234" }, admin);
    await createLead(lead(2), admin);
    await expect(
      createLead(
        {
          name: "Conflito",
          phone: "11999991234",
          email: "lead.2@example.test",
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("SDR não cria contato duplicado sob outro responsável", async () => {
    await createLead(lead(1), admin);
    await expect(createLead(lead(1), bruna)).rejects.toMatchObject({
      status: 409,
    });
  });
});
describe("Permissões e pipeline", () => {
  it("SDR só altera seus próprios leads e não redistribui", async () => {
    const l = await createLead(lead(1), admin);
    await expect(
      leadAction(l.id, { action: "contact", note: "Contato" }, bruna),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      leadAction(l.id, { action: "assign", owner_id: bruna.id }, maria),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      availability(
        bruna.id,
        { availability: "leave", active: true, rotation_enabled: true },
        maria,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("registra primeiro contato uma vez e preserva timeline", async () => {
    const l = await createLead(lead(1), admin);
    await leadAction(l.id, { action: "contact", note: "Ligação" }, maria);
    const first = (
      await pool.query("SELECT first_contact_at FROM leads WHERE id=$1", [l.id])
    ).rows[0].first_contact_at;
    await leadAction(
      l.id,
      { action: "contact", note: "WhatsApp enviado" },
      maria,
    );
    expect(
      (
        await pool.query("SELECT first_contact_at FROM leads WHERE id=$1", [
          l.id,
        ])
      ).rows[0].first_contact_at,
    ).toEqual(first);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM activities WHERE lead_id=$1 AND type='contact'",
          [l.id],
        )
      ).rows[0].count,
    ).toBe("2");
  });
  it("valida ganho/perda e mantém histórico e venda", async () => {
    const l = await createLead(lead(1), admin);
    await expect(
      leadAction(l.id, { action: "stage", stage_id: stages[2].id }, maria),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await pool.query("SELECT stage_id FROM leads WHERE id=$1", [l.id]))
        .rows[0].stage_id,
    ).toBe(stages[0].id);
    await leadAction(
      l.id,
      {
        action: "stage",
        stage_id: stages[2].id,
        amount: 4500,
        service: "Gestão de tráfego",
        closed_at: new Date().toISOString(),
      },
      maria,
    );
    expect(
      (await pool.query("SELECT amount FROM sales WHERE lead_id=$1", [l.id]))
        .rows[0].amount,
    ).toBe("4500.00");
    await expect(
      leadAction(l.id, { action: "stage", stage_id: stages[3].id }, maria),
    ).rejects.toMatchObject({ status: 400 });
    await leadAction(
      l.id,
      { action: "stage", stage_id: stages[3].id, reason: "Preço" },
      maria,
    );
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM lead_stage_history WHERE lead_id=$1",
          [l.id],
        )
      ).rows[0].count,
    ).toBe("2");
  });
  it("redistribuição transfere tarefas e followups e audita", async () => {
    const l = await createLead(lead(1), admin);
    await createTask(
      { lead_id: l.id, title: "Ligar", due_at: new Date().toISOString() },
      maria,
    );
    await leadAction(
      l.id,
      { action: "followup", due_at: new Date().toISOString() },
      maria,
    );
    await leadAction(l.id, { action: "assign", owner_id: bruna.id }, admin);
    for (const table of ["leads", "tasks", "followups"])
      expect(
        (
          await pool.query(
            `SELECT owner_id FROM ${table} WHERE ${table === "leads" ? "id" : "lead_id"}=$1`,
            [l.id],
          )
        ).rows[0].owner_id,
      ).toBe(bruna.id);
    expect(
      (
        await pool.query(
          "SELECT actor_id FROM audit_logs WHERE action='lead.assignment'",
        )
      ).rows[0].actor_id,
    ).toBe(admin.id);
  });
  it("cria/conclui tarefas e followups com acesso protegido", async () => {
    const l = await createLead(lead(1), admin);
    await createTask(
      {
        lead_id: l.id,
        title: "Enviar proposta",
        due_at: new Date().toISOString(),
        priority: "high",
      },
      maria,
    );
    const task = (await pool.query("SELECT * FROM tasks")).rows[0];
    await expect(completeItem("tasks", task.id, bruna)).rejects.toMatchObject({
      status: 403,
    });
    await completeItem("tasks", task.id, maria);
    expect(
      (await pool.query("SELECT completed_at FROM tasks")).rows[0].completed_at,
    ).toBeTruthy();
    await leadAction(
      l.id,
      {
        action: "followup",
        due_at: new Date(Date.now() - 60000).toISOString(),
      },
      maria,
    );
    const followup = (await pool.query("SELECT * FROM followups")).rows[0];
    await completeItem("followups", followup.id, maria);
    expect(
      (await pool.query("SELECT completed_at FROM followups")).rows[0]
        .completed_at,
    ).toBeTruthy();
  });
});
describe("Webhook", () => {
  it("exige assinatura HMAC válida e timestamp recente", () => {
    const raw = JSON.stringify(lead(1)),
      t = String(Math.floor(Date.now() / 1000));
    const sig =
      "sha256=" +
      createHmac("sha256", "test-secret").update(`${t}.${raw}`).digest("hex");
    expect(() => verifySignature(raw, t, sig, "test-secret")).not.toThrow();
    expect(() => verifySignature(raw + " ", t, sig, "test-secret")).toThrow();
    expect(() => verifySignature(raw, "1", sig, "test-secret")).toThrow();
  });
  it("idempotência, duplicidade e chave conflitante", async () => {
    const raw = JSON.stringify(lead(1));
    const r = await webhookIngest(raw, "request-001"),
      replay = await webhookIngest(raw, "request-001");
    expect(replay.id).toBe(r.id);
    expect("replayed" in replay && replay.replayed).toBe(true);
    expect(await webhookIngest(raw, "request-002")).toMatchObject({
      duplicate: true,
    });
    await expect(
      webhookIngest(JSON.stringify(lead(2)), "request-001"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("validação rejeita payload sem contato sem criar lead", async () => {
    await expect(
      webhookIngest('{"name":"Teste"}', "request-001"),
    ).rejects.toThrow();
    expect((await pool.query("SELECT count(*) FROM leads")).rows[0].count).toBe(
      "0",
    );
  });
  it("limite persistido rejeita a chamada 61", async () => {
    for (let i = 0; i < 60; i++)
      await webhookIngest(JSON.stringify(lead(1)), `request-${i}`);
    await expect(
      webhookIngest(JSON.stringify(lead(2)), "request-61"),
    ).rejects.toMatchObject({ status: 429 });
  });
});

describe("Identidades adicionais e operações", () => {
  it("guarda telefone recebido depois e reconhece novos identificadores", async () => {
    const original = await createLead(lead(1), admin);
    const updated = await createLead(
      { ...lead(1), phone: "11999998888" },
      admin,
    );
    expect(updated.id).toBe(original.id);
    expect(
      (
        await createLead(
          { name: "Mesmo contato", phone: "+55 11 99999-8888" },
          null,
        )
      ).id,
    ).toBe(original.id);
    await createLead({ ...lead(1), phone: "11999997777" }, admin);
    expect(
      (
        await createLead(
          { name: "Número alternativo", phone: "11999997777" },
          null,
        )
      ).id,
    ).toBe(original.id);
  });
  it("edição valida dono e conserva identificadores no banco", async () => {
    const l = await createLead(lead(1), admin);
    await leadAction(
      l.id,
      {
        action: "update",
        name: "Nome atualizado",
        email: "novo@example.test",
        potential_value: 1200,
        city: "São Paulo",
        state: "SP",
      },
      maria,
    );
    expect(
      (
        await createLead(
          { name: "Contato antigo", email: "lead.1@example.test" },
          null,
        )
      ).id,
    ).toBe(l.id);
    expect(
      (
        await pool.query("SELECT city,potential_value FROM leads WHERE id=$1", [
          l.id,
        ])
      ).rows[0],
    ).toMatchObject({ city: "São Paulo", potential_value: "1200.00" });
  });
});

describe("Agenda, prospecção, score e CSV", () => {
  it("agenda e cancela reunião com escopo protegido e score único", async () => {
    const l = await createLead(lead(1), admin);
    const payload = {
      action: "meeting.create",
      lead_id: l.id,
      title: "Diagnóstico",
      starts_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
    };
    await expect(operate(payload, bruna)).rejects.toMatchObject({
      status: 403,
    });
    const m = await operate(payload, maria);
    expect(
      (await pool.query("SELECT score FROM leads WHERE id=$1", [l.id])).rows[0]
        .score,
    ).toBe(20);
    await operate(payload, maria);
    expect(
      (await pool.query("SELECT score FROM leads WHERE id=$1", [l.id])).rows[0]
        .score,
    ).toBe(20);
    await operate({ action: "meeting.cancel", id: m?.id }, maria);
    expect(
      (
        await pool.query("SELECT cancelled_at FROM meetings WHERE id=$1", [
          m?.id,
        ])
      ).rows[0].cancelled_at,
    ).toBeTruthy();
  });
  it("bloqueia perfis duplicados entre SDRs e protege alterações", async () => {
    const p = await operate(
      {
        action: "prospect.create",
        name: "Perfil teste",
        username: "@Teste.Perfil",
      },
      maria,
    );
    await expect(
      operate(
        {
          action: "prospect.create",
          name: "Mesmo perfil",
          username: "teste.perfil",
        },
        bruna,
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("Maria Clara"),
    });
    await expect(
      operate(
        { action: "prospect.update", id: p?.id, status: "Abordado" },
        bruna,
      ),
    ).rejects.toMatchObject({ status: 403 });
    await operate(
      { action: "prospect.update", id: p?.id, status: "Convertido" },
      maria,
    );
    expect(
      (await pool.query("SELECT lead_id FROM prospects WHERE id=$1", [p?.id]))
        .rows[0].lead_id,
    ).toBeTruthy();
  });
  it("CSV mapeia colunas, deduplica e faz rollback integral ao falhar", async () => {
    const r = await importCsv(
      {
        csv: "Nome Completo,Email\nPessoa Um,one@example.test\nPessoa Um,one@example.test\nPessoa Dois,two@example.test",
        mapping: { name: "Nome Completo", email: "Email" },
      },
      admin,
    );
    expect(r).toEqual({ created: 2, duplicates: 1 });
    await expect(
      importCsv(
        {
          csv: "Nome,Email\nPessoa Três,three@example.test\nInválido,erro",
          mapping: { name: "Nome", email: "Email" },
        },
        admin,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect((await pool.query("SELECT count(*) FROM leads")).rows[0].count).toBe(
      "2",
    );
    await expect(
      importCsv(
        {
          csv: "Nome,Email\nTeste,test@example.test",
          mapping: { name: "Nome", email: "Email" },
        },
        maria,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(safeCsvCell('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
  });
  it("mock persiste conversa e mensagem; SDR não acessa conversa alheia", async () => {
    const r = await operate(
      {
        action: "demo.message",
        name: "Lead demo",
        phone: "11999992222",
        channel: "whatsapp",
        body: "Mensagem fictícia",
      },
      admin,
    );
    expect((await operationData(maria)).conversations).toHaveLength(1);
    expect((await operationData(bruna)).conversations).toHaveLength(0);
    await expect(
      operate({ action: "conversation.read", id: r?.id }, bruna),
    ).rejects.toMatchObject({ status: 403 });
    const m = await operate({ action: "conversation.read", id: r?.id }, maria);
    expect(m?.messages?.[0].body).toBe("Mensagem fictícia");
    const adapter = new DisconnectedMetaAdapter("whatsapp");
    await expect(adapter.sendMessage()).rejects.toMatchObject({ status: 503 });
    expect((await adapter.testConnection()).connected).toBe(false);
  });
  it("notificações de SLA são persistidas sem duplicar no polling", async () => {
    const l = await createLead(lead(1), admin);
    await pool.query(
      "UPDATE leads SET created_at=now()-interval '1 hour' WHERE id=$1",
      [l.id],
    );
    await syncNotifications(maria);
    await syncNotifications(maria);
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM notifications WHERE event_key=$1",
          ["sla:" + l.id],
        )
      ).rows[0].count,
    ).toBe("1");
  });
});
