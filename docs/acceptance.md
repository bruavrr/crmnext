# Critérios de aceite e limites

A Fase 1 está implementada: convite/login; Maria Clara/Bruna e novas SDRs; cadastro/deduplicação; rodízio persistido/transacional; disponibilidade e fila; Kanban; timeline; tentativa de contato; follow-up/tarefas; ganho/perda; métricas; redistribuição administrativa; RBAC e auditoria.

Além do núcleo: webhook HMAC/idempotente; CSV; agenda interna; relatórios por origem/campanha/etapa/perda; etiquetas/score; notificações; prospecção manual com bloqueio de duplicatas; conversas locais de demonstração persistidas.

Ainda dependem de implementação/configuração externa: sincronização oficial Meta Lead Ads, envio/recebimento real WhatsApp e Instagram, OAuth Google Calendar. Adapters desconectados recusam essas operações. Nenhum módulo deve ser apresentado como conectado sem validação com credenciais oficiais.

Métricas referem-se à coorte de entrada e ao estado atual. Limites de listas/exportação, notificações por polling e recuperação por convite administrativo estão detalhados no README. O deploy de produção é separado do setup de desenvolvimento.

Validação automatizada: Vitest em PostgreSQL dedicado, Playwright desktop/mobile e build/types/lint. Resultados específicos da execução estão no relatório final da tarefa; não se deve presumir que os checks passaram após alterações posteriores.
