# Arquitetura

Produto NextGen CRM, empresa NextDim. Next.js 16.3/React 19/TypeScript, Tailwind 4, PostgreSQL 16, Drizzle e SQL parametrizado, NextAuth Credentials, Argon2id. API Node no mesmo projeto. O servidor consulta usuário ativo, perfil e versão de sessão no banco em cada operação.

## Organização

- `src/lib/crm.ts`: ingestão, identidades, rodízio, contatos, pipeline, tarefas, follow-ups e auditoria.
- `src/lib/operations.ts`: agenda, prospecção, conversas locais, etiquetas, score e notificações.
- `src/lib/webhook.ts`: HMAC, idempotência e ingestão externa.
- `src/lib/csv.ts`: importação transacional/exportação segura.
- `src/lib/auth.ts`: sessão, autenticação e identidade atual.
- `src/app/api/*`: HTTP, proteção de origem, RBAC e validação.
- `src/app/crm.tsx`, `src/components/operations.tsx`: interface, tabelas, cards, modais e módulos operacionais.
- `migrations/*`: schema versionado com relacionamentos, constraints e índices.

## Dados e locks

Todos os dados de negócio ficam no PostgreSQL. A transação de ingestão obtém advisory lock global e bloqueia o cursor `FOR UPDATE`. Atualizações de elegibilidade usam a mesma ordem de locks e drenam a fila. Os identificadores, inclusive aliases adicionais, são únicos na equipe; entradas concorrentes não consomem várias rodadas para o mesmo contato. Uma rodada escolhe a primeira sequência superior ao cursor; sem candidato, volta ao início.

IDs são UUID. Datas são UTC. Valores monetários são numeric. Usuários são desativados, preservando histórico. Leads possuem `deleted_at`, mas exclusão definitiva não é exposta. Timeline e auditoria são append-only pelas APIs.

Dois perfis iniciais: admin e SDR. Novos SDRs são criados no painel sem mudar código. Novos tipos de perfil exigirão expandir a política de capacidades e migrations; identidade sempre vem da sessão, nunca do payload.

## Serviços externos

Webhook genérico é funcional. Adapters Meta/WhatsApp/Instagram/Google Calendar são explicitamente desconectados e não inventam endpoints. A simulação de mensagens usa dados persistidos e as mesmas regras de ingestão, é restrita ao administrador em desenvolvimento e rotula a conversa como demo. Nenhum Direct ou WhatsApp é enviado. Conexão real exigirá OAuth, credenciais, aprovação/configuração de ativos e testes em contas oficiais.

## Crescimento

O lock global privilegia consistência; medir antes de segmentar distribuição por equipes. Limites de consulta são documentados; paginação deverá preceder grandes volumes. Para alertas offline, adicionar jobs. Para produção: HTTPS, banco gerenciado com TLS e backups, envio seguro de convites, MFA/recuperação de senha, logs/observabilidade e política LGPD. Não misturar base de demonstração com contatos reais.
