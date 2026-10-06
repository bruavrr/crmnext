import { test, expect } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";
import argon2 from "argon2";
import { readFile } from "node:fs/promises";
const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const email = "e2e.admin@example.test";
const password = randomBytes(24).toString("base64url");
let token: string;
test.beforeAll(async () => {
  await pool.query("DROP SCHEMA public CASCADE;CREATE SCHEMA public");
  await pool.query(await readFile("migrations/001_initial.sql", "utf8"));
  await pool.query(await readFile("migrations/002_operations.sql", "utf8"));
  await pool.query(await readFile("migrations/003_modules.sql", "utf8"));
  await pool.query(
    await readFile("migrations/004_search_identity.sql", "utf8"),
  );
  for (const [name, email, role] of [
    ["Admin E2E", "e2e.admin@example.test", "admin"],
    ["Maria Clara", "maria@example.test", "sdr"],
    ["Bruna", "bruna@example.test", "sdr"],
  ])
    await pool.query("INSERT INTO users(name,email,role) VALUES($1,$2,$3)", [
      name,
      email,
      role,
    ]);
  for (const [i, name] of [
    "Lead novo",
    "Contato realizado",
    "Qualificado",
    "Reunião agendada",
    "Proposta enviada",
    "Fechado / Ganho",
    "Perdido",
  ].entries())
    await pool.query(
      "INSERT INTO pipeline_stages(name,position,kind) VALUES($1,$2,$3)",
      [name, i, i === 5 ? "won" : i === 6 ? "lost" : "open"],
    );
  const user = (
    await pool.query("SELECT id FROM users WHERE email=$1", [email])
  ).rows[0];
  await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2", [
    await argon2.hash(password, { type: argon2.argon2id }),
    user.id,
  ]);
  token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO invitations(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [user.id, createHash("sha256").update(token).digest("hex")],
  );
});
test.afterAll(() => pool.end());
test("convite → login → lead → contato → follow-up → venda → dashboard", async ({
  page,
}) => {
  await page.goto("/invite#" + token);
  await page.getByLabel("Nova senha", { exact: true }).fill(password);
  await page.getByLabel("Confirmar senha").fill(password);
  await page.getByRole("button", { name: "Criar minha senha" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Novo lead", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Cliente E2E");
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("lead.e2e@example.test");
  await page.getByLabel("Empresa", { exact: true }).fill("Empresa de teste");
  await page.getByRole("button", { name: "Criar e distribuir lead" }).click();
  await expect(page.getByRole("status")).toContainText("distribuído");
  await page.getByRole("button", { name: /^Leads/ }).click();
  await page.getByText("Cliente E2E", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Maria Clara");
  await page
    .getByRole("button", { name: "Registrar contato", exact: true })
    .click();
  await page
    .getByLabel("Como foi o contato?")
    .fill("Ligação registrada no teste funcional");
  await page.getByRole("button", { name: "Salvar no histórico" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByText("Cliente E2E", { exact: true }).click();
  await page.getByRole("button", { name: "Follow-up", exact: true }).click();
  await page.getByRole("button", { name: "Agendar follow-up" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByText("Cliente E2E", { exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Ligação registrada");
  await expect(page.getByRole("dialog")).toContainText("Follow-up agendado");
  await page.getByRole("button", { name: "Mover etapa", exact: true }).click();
  await page
    .getByRole("button", { name: "Fechado / Ganho", exact: true })
    .click();
  await page.getByLabel("Valor vendido (R$)").fill("4500");
  await page.getByLabel("Produto / Serviço").fill("Gestão de tráfego");
  await page.getByRole("button", { name: "Confirmar e registrar" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("R$ 4.500,00 em receita")).toBeVisible();
  await page.screenshot({ path: "/tmp/nextgen-dashboard.png", fullPage: true });
  const sales = (await pool.query("SELECT amount FROM sales")).rows;
  expect(sales).toHaveLength(1);
  expect(sales[0].amount).toBe("4500.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Visão geral" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("button", { name: "Pipeline", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "/tmp/nextgen-mobile.png", fullPage: true });
});
test("API exige autenticação e rejeita origem externa", async ({ request }) => {
  expect((await request.get("/api/crm")).status()).toBe(401);
  expect(
    (
      await request.post("/api/leads", {
        headers: { Origin: "https://attacker.example" },
        data: { name: "Ataque", email: "bad@example.test" },
      })
    ).status(),
  ).toBe(403);
});

test("CSV, configuração, agenda, prospecção, conversas e relatórios", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no CRM" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Leads/ }).click();
  await page.getByRole("button", { name: "Importar CSV" }).click();
  await page.locator("input[type=file]").setInputFiles({
    name: "leads.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "name,email\nCSV Um,csv.one@example.test\nCSV Um,csv.one@example.test\nCSV Dois,csv.two@example.test",
    ),
  });
  await page.getByRole("button", { name: "Validar e importar" }).click();
  await expect(page.getByRole("status")).toContainText("2 leads criados");
  await expect(page.getByText("CSV Um", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Configurações", exact: true })
    .click();
  await page.getByRole("button", { name: "Nova etapa", exact: true }).click();
  await page.getByLabel("Nome da etapa").fill("Diagnóstico E2E");
  await page.getByRole("button", { name: "Salvar etapa" }).click();
  await expect(
    page.getByText("Diagnóstico E2E", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agenda", exact: true }).click();
  await page.getByRole("button", { name: "Reunião", exact: true }).click();
  await page.getByLabel("Título", { exact: true }).fill("Reunião E2E");
  await page.getByRole("button", { name: "Agendar reunião" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText(/Reunião E2E/)).toBeVisible();
  await page.getByRole("button", { name: "Prospecção", exact: true }).click();
  await page.getByRole("button", { name: "Novo perfil" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Prospect E2E");
  await page.getByLabel("Instagram", { exact: true }).fill("@perfil.e2e");
  await page.getByRole("button", { name: "Cadastrar perfil" }).click();
  await expect(page.getByText("@perfil.e2e", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Conversas", exact: true }).click();
  await page.getByRole("button", { name: "Simular entrada local" }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Conversa E2E");
  await page.getByLabel("Telefone", { exact: true }).fill("11989990000");
  await page
    .getByLabel("Mensagem", { exact: true })
    .fill("Mensagem fictícia para validar a central");
  await page.getByRole("button", { name: "Simular recebimento" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: /Conversa E2E/ }).click();
  await expect(
    page
      .getByText("Mensagem fictícia para validar a central", { exact: true })
      .last(),
  ).toBeVisible();
  await expect(page.getByText("Demonstração", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Conversão por origem" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Motivos de perda" }),
  ).toBeVisible();
});
