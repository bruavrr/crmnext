# NextGen CRM · NextDim

CRM comercial com foco em velocidade de atendimento, distribuição justa e acompanhamento das SDRs. Interface em português, desktop e celular. Dados e regras críticas são persistidos no PostgreSQL; não usamos arrays como banco de dados.

## O que funciona

- Login NextAuth, Argon2id, convites expiráveis de uso único e sessões revogadas após redefinição de senha. Usuários iniciais Maria Clara e Bruna, sem senha padrão.
- Administrador: todos os leads, equipe, convites, disponibilidade, participação no rodízio, redistribuição, SLA, etapas, etiquetas e regras de score. SDR: apenas seus registros e métricas.
- Leads, dados de contato/empresa, temperatura, valor potencial, pesquisa e filtros combinados de responsável, etapa, origem, campanha, data de entrada, etiqueta, último contato e follow-up.
- Round Robin atômico com cursor persistido. Ignora SDRs inativos/indisponíveis, permite adicionar novos SDRs pelo painel e processa a fila quando alguém se torna disponível.
- Deduplicação por telefone, e-mail e Instagram, inclusive identificadores adicionais associados ao contato. Conflitos entre pessoas diferentes exigem revisão.
- Pipeline drag and drop no desktop, com botão acessível para mover em qualquer dispositivo. Venda exige valor, serviço e data; perda exige motivo.
- Timeline append-only, tentativas de contato, notas, primeiro/último contato, follow-ups, tarefas, Meu Dia e auditoria.
- Dashboard, desempenho por SDR, conversão e receita por origem/campanha, distribuição por etapa e motivos de perda. Período filtra **data de entrada dos leads**, formando uma coorte; receita considera o estado atual ganho. Reabertura preserva a venda histórica e a exclui da receita atual.
- Agenda interna em dia/semana/mês; reuniões persistidas; notificações internas de atribuição, SLA, follow-ups e reuniões próximas. Atualização a cada 30 segundos enquanto o CRM está aberto.
- Prospecção manual de Instagram, perfis únicos na equipe, responsável e próximo follow-up. Conversão cria um lead pelo rodízio.
- Etiquetas, score baseado em eventos (cada evento pontua uma vez por lead), importação CSV com mapeamento/deduplicação/transação e exportação com proteção contra fórmulas.
- Webhook genérico autenticado, com validação, HMAC, idempotência e rate limiting persistido.

## O que depende de serviços externos

Meta Lead Ads, WhatsApp Business Platform, Instagram e Google Calendar **não estão conectados**. Os adapters em `src/lib/integrations/adapters.ts` recusam envio/conexão real. Não há APIs de terceiros inventadas nem tokens no frontend.

A central de conversas permite visualizar mensagens persistidas e, somente em desenvolvimento para administrador, simular entradas locais. Elas são identificadas como **Demonstração**, registradas na timeline e processadas pelo mesmo rodízio/deduplicação. **O CRM não envia mensagens reais.** A prospecção registra manualmente ações realizadas fora do CRM.

Para conexão oficial Meta: configurar aplicativo Meta, ativos empresariais, OAuth, permissões e aprovação/revisão aplicáveis, WABA/número no WhatsApp e contas profissionais compatíveis no Instagram. Consulte a documentação oficial: [Meta for Developers](https://developers.facebook.com/docs/), [WhatsApp Cloud API](https://developers.facebook.com/docs/whatsapp/cloud-api/), [Instagram Platform](https://developers.facebook.com/docs/instagram-platform/) e [Marketing API](https://developers.facebook.com/docs/marketing-apis/). Google Calendar exige projeto Google Cloud, tela de consentimento e OAuth: [Calendar API](https://developers.google.com/workspace/calendar/api/guides/overview). Credenciais devem ser armazenadas no servidor/vault; conexões reais exigem implementar e validar os adapters com os ativos autorizados.

## Deploy com URL pública

O projeto inclui Dockerfile e inicialização de produção com validação de configuração, migrations e seed sem dados fictícios. Siga [o guia de deploy no Render](docs/deploy.md) para publicar o CRM existente com PostgreSQL e HTTPS, criar sua senha por convite e acessar pelo navegador.

## Instalação rápida em desenvolvimento

Requisitos: Node.js 22.12+ (validado com Node 24), npm, Docker com daemon disponível, PostgreSQL 16.

```bash
cd /workspace/crmnext
npm ci --cache /workspace/.npm-cache
npm run cloud:setup
npm run dev
```

`cloud:setup` gera `.env.local` com credenciais aleatórias **somente se não existir configuração**, inicia o PostgreSQL local, cria a base exclusiva de testes, executa migrations e o seed de demonstração. A imagem é fixada pelo digest. O PostgreSQL expõe somente `127.0.0.1:5432` e usa volume `nextgen-pgdata`.

Para ambiente local fora da nuvem, use `npm ci` normalmente. Com PostgreSQL já disponível, copie `.env.example` para `.env.local`, preencha valores seguros e execute:

```bash
npm run db:migrate
npm run db:seed -- --demo
npm run dev
```

Não é necessário um Git worktree: use o checkout existente, pois cada tarefa na nuvem já é isolada.

### Primeiro acesso

Em desenvolvimento, o seed cria `admin@nextdim.local`, `maria@nextdim.local` e `bruna@nextdim.local`, todos **sem senha**. Gere o convite do administrador no terminal:

```bash
npm run user:invite -- admin@nextdim.local
```

Abra o link gerado por canal seguro e crie uma senha de pelo menos 12 caracteres. O token está no fragmento da URL, tem validade de 24h e seu hash fica no banco. Depois, em **Equipe**, crie novas SDRs e compartilhe seus convites. Para as SDRs iniciais, gere os convites pelo mesmo comando com seus e-mails. O comando também permite redefinir a senha de uma conta existente; sessões anteriores são revogadas quando o convite é aceito.

Nunca publique links de convite ou copie tokens para issues, commits ou chats públicos. Não há envio automático de convites por e-mail nesta versão; o administrador compartilha o link de maneira segura.

## Variáveis

| Nome                         | Uso                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Conexão PostgreSQL, exclusivamente no servidor. Produção: banco gerenciado com TLS verificado.                  |
| `TEST_DATABASE_URL`          | Banco separado cujo nome termina em `_test`; os testes apagam o schema `public`. Nunca aponte para dados reais. |
| `NEXTAUTH_URL`               | URL canônica, por exemplo `http://localhost:3000` no desenvolvimento e HTTPS em produção.                       |
| `NEXTAUTH_SECRET`            | Segredo aleatório forte de sessão, estável entre instâncias.                                                    |
| `WEBHOOK_SECRET`             | Segredo forte para HMAC do webhook, somente no servidor. Sem ele o endpoint retorna 503.                        |
| `DEMO_MODE`                  | `true` identifica visualmente o ambiente de demonstração; produção deve usar `false`.                           |
| `BOOTSTRAP_ADMIN_EMAIL`      | E-mail real do administrador no seed de produção.                                                               |
| `MARIA_EMAIL`, `BRUNA_EMAIL` | E-mails reais das SDRs iniciais no seed de produção.                                                            |
| `CHROMIUM_PATH`              | Caminho opcional do Chromium para Playwright; padrão `/usr/bin/chromium`.                                       |

`.env.local`, dumps, dependências e builds são ignorados pelo Git. A configuração não sobrescreve bindings existentes. Nenhum valor de segredo é persistido no rascunho de setup da plataforma.

## Banco, migrations e seed

```bash
npm run db:migrate
npm run db:seed           # estrutura inicial, sem leads fictícios
npm run db:seed -- --demo # somente desenvolvimento
```

Migrations SQL ordenadas, aplicadas em transação e protegidas por advisory lock. Contêm UUIDs, FKs, constraints, índices de unicidade, busca trigram e índices para atribuição/timeline/prazos. Drizzle é usado nas consultas de identidade; SQL parametrizado e `pg` nas transações que exigem locks explícitos.

O seed normal é repetível, preserva usuários existentes e customizações do pipeline. O seed demo cria 20 contatos `demo.*@example.test`, distribuídos entre Maria Clara e Bruna, além de vendas, perdas, tarefas, reuniões, follow-ups e mensagens fictícias. Não roda com `NODE_ENV=production`. A opção de manutenção `--enrich-existing-demo` atualiza os contatos fictícios existentes; não use em uma base que tenha editado manualmente esses contatos.

## Round Robin e concorrência

1. `BEGIN` e `pg_advisory_xact_lock(902)` coordenam ingestão, deduplicação e alterações de elegibilidade entre instâncias.
2. Busca os identificadores normalizados; um contato existente recebe nova origem/interação sem avançar o cursor.
3. Cria o lead e obtém `round_robin_state FOR UPDATE`.
4. Seleciona o próximo SDR com sequência superior à última; volta ao início quando necessário. Inclui somente SDRs ativos, disponíveis e habilitados.
5. Persiste responsável, atribuição, cursor, timeline e notificação; `COMMIT`.
6. Sem elegíveis, mantém `owner_id=NULL`. Alteração de disponibilidade ou criação de SDR drena a fila em ordem de entrada na mesma transação.

O lock global favorece correção na primeira versão. Para grande volume, medir contenção antes de fragmentar filas por equipe/canal. Não há estado crítico apenas em memória.

## Webhook de leads

`POST /api/webhooks/leads`, JSON máximo de 64 KB. Headers obrigatórios:

- `x-webhook-timestamp`: timestamp Unix em segundos, tolerância de 5 minutos.
- `x-webhook-signature`: `sha256=<hex>` calculado com `HMAC-SHA256(WEBHOOK_SECRET, timestamp + '.' + corpo_bruto)`.
- `idempotency-key`: string única de 8–128 caracteres por evento.

```json
{
  "name": "Pessoa de teste",
  "phone": "+55 11 99999-1234",
  "email": "pessoa@example.test",
  "source": "Landing Page",
  "campaign": "Campanha exemplo",
  "utm_source": "meta",
  "utm_medium": "paid",
  "utm_campaign": "exemplo",
  "utm_content": "criativo-a"
}
```

Aceita também `instagram`, `company`, `ad_set` e `ad`. Nome e ao menos um identificador são obrigatórios. Telefone local de 10/11 dígitos assume Brasil; use `+DDI` para outros países. E-mail é normalizado; Instagram aceita username ou URL de perfil oficial.

Assine o **corpo exato enviado**, sem reformatá-lo depois. Exemplo de cliente servidor:

```js
import { createHmac, randomUUID } from "node:crypto";
const raw = JSON.stringify({
  name: "Contato de teste",
  email: "teste@example.test",
  source: "Site",
});
const timestamp = String(Math.floor(Date.now() / 1000));
const signature =
  "sha256=" +
  createHmac("sha256", process.env.WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
await fetch(`${process.env.CRM_URL}/api/webhooks/leads`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-webhook-timestamp": timestamp,
    "x-webhook-signature": signature,
    "idempotency-key": randomUUID(),
  },
  body: raw,
});
```

Limite global desta chave: 60 requisições/minuto persistidas no banco. Uma chave repetida com o mesmo corpo retorna o lead anterior; com outro corpo retorna 409. Identificadores apontando para contatos diferentes retornam 409 para revisão, sem criar/alterar contatos. Rate limiting também protege login e convites. HTTPS é obrigatório ao expor esse endpoint.

## CSV

Em Leads → Importar CSV, selecione um arquivo e mapeie nome, telefone, e-mail, Instagram, empresa, origem e campanha. Máximo 500 linhas/60 KB. Uma falha cancela toda a transação. O resultado distingue criados e duplicados. Apenas administrador importa. A exportação respeita o escopo do usuário, limita a 10 mil registros e exporta o conjunto completo autorizado, independentemente dos filtros da tela.

## Verificação

```bash
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run test:e2e
npm run build
npm run start
```

**Testes usam banco destrutivo e dedicado `_test`.** Vitest cobre concorrência, rodízio, elegibilidade, fila, duplicidade, identificadores adicionais, permissões, contatos, tarefas/follow-ups, venda/perda, HMAC, replay/rate limiting, agenda, prospecção, CSV, conversas locais e notificações. Playwright cobre convite/login, lead/contato/follow-up/venda, mobile, proteção HTTP e módulos operacionais. Playwright inicia seu próprio servidor na porta 3001 e usa Chromium instalado; para outro sistema instale um navegador compatível e ajuste `CHROMIUM_PATH`.

Não rode Vitest e Playwright simultaneamente na mesma base de testes. `next build` e `next dev` também devem ser executados separadamente.

## Snapshot de desenvolvimento na nuvem

```bash
npm run cloud:checkpoint
npx tsx scripts/verify-restore.ts
```

O checkpoint privado `.local/database.dump` preserva registros e hashes para a publicação do ambiente; gere novamente antes de publicar se os dados mudarem. `cloud:setup` restaura esse arquivo **somente em banco local vazio**. A verificação usa um container/volume temporários e a porta 15432, compara contagens de leads/vendas/timeline e remove somente os recursos temporários criados por ela. O snapshot da plataforma e os processos Docker são coisas distintas; a restauração não depende de um processo sobreviver.

`install_script` e `start_skill` são salvos no rascunho da plataforma. Revisar/salvar/publicar é uma ação separada do usuário. O teste isolado de restauração não prova que uma nova tarefa da plataforma já foi publicada/restaurada.

## Operação e limites atuais

- Listas mostram até 1.000 leads e 500 tarefas/follow-ups/reuniões/conversas por consulta. Use filtros; métricas são calculadas sobre o conjunto inteiro. Paginação completa deve preceder crescimento além desses volumes.
- Notificações de prazo são materializadas no polling autenticado. Para alertas fora do expediente/com o CRM fechado, adicionar um job scheduler e canal de entrega.
- Integrações reais, sincronização bidirecional, recuperação de senha por e-mail e MFA não estão implementados. A recuperação atual exige administrador autorizado e convite seguro.
- PostgreSQL é relacional e preparado para soft delete de leads; a interface não oferece exclusão definitiva. Histórico não é sobrescrito; reatribuições registram quem fez, antes/depois e horário.
- Horários são armazenados em UTC. Contagens de hoje/mês e série diária usam America/Sao_Paulo; campos e agenda são exibidos no fuso do navegador.
- O deploy de produção ainda não foi feito. Usar HTTPS, banco gerenciado com TLS/backups, secrets no servidor, gestão de acesso e política LGPD de retenção, descarte e exportação. Dados fictícios devem ficar em base separada. O banco Docker e seus checkpoints são para desenvolvimento, não substituem um plano de backup de produção.

Arquitetura: [docs/architecture.md](docs/architecture.md). Status e critérios: [docs/acceptance.md](docs/acceptance.md).
