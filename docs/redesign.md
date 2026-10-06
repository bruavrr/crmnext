# Redesign Next Gen Ads

O frontend existente recebeu um tema predominantemente preto, superfícies cinza,
accent laranja/dourado, tipografia Geist local e tratamento consistente de campos,
botões, cards, tabelas, badges, modais, empty states e notificações.

Telas: login, convite, Dashboard, Meu Dia, Leads e detalhes, Pipeline,
Conversas, Prospecção, Tarefas, Agenda, Relatórios, Equipe, Integrações e
Configurações. As rotas, endpoints, autenticação, permissões e regras comerciais
existentes foram mantidos. Nenhum arquivo de backend, migration ou `.env` foi alterado.

A tabela inclui contato e último atendimento. O dashboard destaca a participação
na distribuição por SDR e mantém os indicadores agregados existentes. Atendimento
e follow-ups por SDR são derivados dos leads retornados pelo servidor e ficam
indisponíveis quando a lista não contém o conjunto completo (limite existente).
Os filtros de tarefas são locais e preservam todas as ações originais.

O menu mobile/tablet tem controle de foco, Escape, retorno de foco e bloqueio de
scroll. Modais mantêm o focus trap existente e bloqueiam o scroll do fundo. O tema
respeita `prefers-reduced-motion`; tabelas, calendário e Kanban mantêm scroll apenas
nos seus próprios containers.

## Logo oficial — pendência de asset

A imagem exibida na conversa não foi disponibilizada como arquivo no workspace.
Não foi redesenhada nem substituída por uma marca fictícia. A área da logo está
reservada e o componente compartilhado `src/components/brand.tsx` está conectado
à sidebar, login, convite e loading. Siga `public/branding/README.md` para adicionar
o arquivo original e ativar seu caminho no manifest. O restante do frontend funciona
independentemente do asset; não há solicitação de arquivo inexistente.

## Validação

Lint e typecheck passaram. Os 30 testes de backend e os 3 testes Playwright
existentes passaram em banco dedicado. O build de produção passou. A revisão
no Chromium percorreu as 12 seções internas no desktop e as telas principais
em 320, 390, 768 e 1024 pixels, sem erro de JavaScript ou overflow do documento.
Login foi verificado no desktop/celular; menu mobile foi verificado com Escape
e restauração de foco/scroll. Nenhum lead fictício novo foi criado na base principal.

## Executar

Com as dependências e o banco já configurados:

```bash
cd /workspace/crmnext
npm run dev -- --port 3000
```

O redesign está no checkout local. Publicar novas alterações no GitHub e no provedor
é uma ação separada; a URL pública existente não se atualiza pelo servidor local.
