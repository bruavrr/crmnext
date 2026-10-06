# Publicar o CRM existente no Render

O Sites não está disponível nesta sessão. Este deploy usa o código atual inteiro,
com backend, autenticação e PostgreSQL. Não é uma exportação estática.
Ainda não há URL pública: criar os serviços abaixo é a etapa externa pendente.

## 1. Preservar e enviar o código

O checkout desta sessão fica em `/workspace/crmnext`. Os arquivos locais privados,
segredos, dumps e dados de demonstração estão excluídos do Git e da imagem Docker.
Baixe também o arquivo `nextgen-crm-deploy.tar.gz` entregue nesta sessão para
guardar uma cópia independente do código. Ele não inclui o banco nem senhas.

No terminal desta sessão, publique o checkout no repositório já indicado:

```bash
cd /workspace/crmnext
git push origin HEAD:main
```

Esse comando pressupõe o commit local preparado nesta sessão. Não use `--force`.
Se `main` já tiver avançado no GitHub, integre as alterações antes de enviar.
Se estiver usando o arquivo baixado em seu computador, extraia-o e faça commit
no seu clone de `bruavrr/crmnext`, depois envie normalmente para `main`.

## 2. Criar PostgreSQL

Abra <https://dashboard.render.com/> e crie um serviço **PostgreSQL** chamado
`nextgen-crm-db`. Escolha a região que usará também no serviço web. Para uso real,
escolha um plano persistente com backups e confirme o preço apresentado pelo provedor.
Não importe `.local/database.dump`: ele contém dados fictícios e contas locais.

Guarde a **Internal Database URL** para o serviço web da mesma região.
Se usar conexão externa, use a URL TLS do provedor com verificação de certificado;
nunca configure `rejectUnauthorized=false` nem `sslmode=no-verify`.

## 3. Criar o serviço web

No Render, **New → Web Service**, conecte o GitHub e selecione
`bruavrr/crmnext`, branch `main`.

| Campo             | Valor                                    |
| ----------------- | ---------------------------------------- |
| Nome              | `nextgen-crm` (ou outro nome disponível) |
| Região            | A mesma do PostgreSQL                    |
| Runtime           | Docker                                   |
| Root Directory    | Vazio                                    |
| Dockerfile Path   | `./Dockerfile`                           |
| Docker Command    | Vazio; usa o comando da imagem           |
| Health Check Path | `/login`                                 |

Escolha um plano web com acesso ao **Shell** para gerar o primeiro convite.
Confirme os custos no painel antes de criar/publicar. Não é necessário disco
persistente no serviço web: os dados ficam no PostgreSQL.

Configure as variáveis no painel, **antes do primeiro deploy**:

| Variável                | Valor                                                                                                    |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`          | Internal Database URL do banco criado                                                                    |
| `NEXTAUTH_URL`          | Origem HTTPS exata atribuída ao serviço, sem caminhos; por exemplo `https://nome-atribuido.onrender.com` |
| `NEXTAUTH_SECRET`       | Segredo aleatório exclusivo de sessão                                                                    |
| `WEBHOOK_SECRET`        | Outro segredo aleatório exclusivo                                                                        |
| `DEMO_MODE`             | `false`                                                                                                  |
| `BOOTSTRAP_ADMIN_EMAIL` | Seu e-mail real, em minúsculas                                                                           |
| `MARIA_EMAIL`           | E-mail real da Maria Clara, em minúsculas                                                                |
| `BRUNA_EMAIL`           | E-mail real da Bruna, em minúsculas                                                                      |

Os três e-mails precisam ser distintos. Gere cada segredo separadamente com
`openssl rand -hex 32` em terminal privado ou com um gerenciador de senhas.
Insira os valores somente em variáveis secretas do provedor. Não configure
`TEST_DATABASE_URL` em produção. `NODE_ENV=production` já é definido na imagem;
`PORT` é fornecido pelo provedor ou usa 3000.

Se o painel só revelar a URL após criar o serviço, atualize `NEXTAUTH_URL` com
a URL exibida e rode **Manual Deploy**. Não invente uma URL a partir do nome:
use a que o Render realmente atribuir.

Clique para criar/publicar o serviço. A imagem instala o lockfile e faz o build.
A inicialização valida as variáveis, aplica migrations com lock, cria usuários
sem senha e a estrutura inicial, então inicia o servidor. Nenhum lead fictício
é criado. Falha de configuração/migration impede o servidor de iniciar.

## 4. Criar sua senha e acessar pelo navegador

Depois do deploy saudável, abra o **Shell** do serviço web e execute:

```bash
npm run user:invite -- "$BOOTSTRAP_ADMIN_EMAIL"
```

Abra o link HTTPS gerado no seu navegador e crie sua senha (mínimo 12 caracteres).
O convite é secreto, de uso único e expira em 24h. Não cole o link no chat.
Depois faça login na URL pública do serviço. Gere os convites das SDRs no Shell:

```bash
npm run user:invite -- "$MARIA_EMAIL"
npm run user:invite -- "$BRUNA_EMAIL"
```

Compartilhe cada convite em canal privado com a pessoa correspondente.
Mantenha os mesmos e-mails de bootstrap após o primeiro deploy: alterá-los
criaria novos usuários no próximo startup. Gerencie a equipe no próprio CRM.

## 5. Validar o uso real

Crie dois leads com contatos distintos e confirme a alternância entre as SDRs.
Coloque uma SDR como indisponível e confirme que o próximo lead vai para a outra.
Registre contato, follow-up e mudança de etapa; recarregue a página e confira o
histórico. Teste o login de uma SDR e confirme que ela vê apenas seus registros.

O webhook estará em `https://SUA-URL/api/webhooks/leads`, com a assinatura descrita
no README. Meta, WhatsApp, Instagram e Google Calendar continuam desconectados:
o deploy não configura esses serviços. O CRM não envia mensagens reais.

## Atualizações e operação

Novos commits na branch conectada podem disparar deploy automático. Faça backup
do banco antes de migrations futuras; o código não cria backup de produção.
Migrations e seed atuais são idempotentes e não limpam dados existentes.
Não rode `cloud:setup`, seed `--demo` nem os testes destrutivos na produção.
Para domínio próprio, configure-o no Render e atualize `NEXTAUTH_URL` para a
origem HTTPS canônica; convites antigos usam a URL anterior.

`/login` é uma verificação HTTP; não prova sozinho que o banco está funcionando.
O startup exige conexão SQL, e o teste autenticado acima valida o fluxo completo.
Esta sessão valida a imagem em container com banco isolado; a criação dos serviços
e a verificação da URL pública ainda precisam ocorrer na sua conta do provedor.

## Validação realizada nesta sessão

A imagem Docker foi construída com sucesso e executada como usuário sem privilégios.
Em PostgreSQL isolado, foram verificadas quatro migrations, três usuários iniciais,
nenhum lead fictício, convite e criação de senha, login com cookie seguro, API
protegida, webhook assinado distribuindo dois leads para SDRs distintas e
persistência após reinício. Arquivos `.env.local` e `.local` não estão na imagem.
Lint e formatação também passaram. Esses testes não representam publicação no Render.
