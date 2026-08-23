# Achilles Content V4 — Guia de publicação

## 1. Pré-requisitos

Node.js 20 LTS ou superior e npm 10 ou superior. Para rodar as Netlify Functions localmente, instale a CLI com `npm install -g netlify-cli`.

## 2. Teste visual imediato

```bash
npm install
npm run dev
```

`npm run dev` usa o modo `demo` (arquivo `.env.demo`) e serve para validar telas sem nenhuma chave externa. Abra `http://localhost:5173`.

Para testar frontend e Functions juntos, configure as variáveis reais e rode `npm run dev:real`.

## 3. Supabase

1. Crie um projeto no Supabase.
2. Abra o SQL Editor.
3. Cole e execute **`supabase/schema.sql` inteiro**.

Esse arquivo é completo e idempotente: funciona tanto em um projeto novo quanto sobre uma base V3 existente, e pode ser reexecutado sem quebrar nada. Ele cria as tabelas, as funções de crédito, o RLS, o bucket privado `generation-assets` e o trigger de novos usuários.

> `supabase/migration-v3.sql` ficou apenas como referência histórica. Não é mais necessário.

### Promover o primeiro administrador

Crie o usuário pelo Supabase Auth (Authentication → Users → Add user) e depois execute:

```sql
update public.profiles set role = 'admin' where email = 'seu-email@empresa.com.br';
```

## 4. Variáveis de ambiente

| Nome | Onde | Tipo | Observação |
| --- | --- | --- | --- |
| VITE_SUPABASE_URL | Netlify e local | Pública | |
| VITE_SUPABASE_PUBLISHABLE_KEY | Netlify e local | Pública | |
| VITE_APP_URL | Netlify e local | Pública | |
| VITE_DEMO_MODE | Apenas teste | Pública | `false` em produção |
| SUPABASE_URL | Functions | Operacional | |
| SUPABASE_PUBLISHABLE_KEY | Functions | Operacional | |
| SUPABASE_SECRET_KEY | Functions | **Secreta** | service role |
| OPENAI_API_KEY | Functions | **Secreta** | |
| OPENAI_TEXT_MODEL | Functions | Configuração | modelo habilitado na sua conta |
| OPENAI_IMAGE_MODEL | Functions | Configuração | modelo de imagem habilitado |
| MP_ACCESS_TOKEN | Functions | **Secreta** | |
| MP_WEBHOOK_SECRET | Functions | **Secreta** | |
| APP_URL | Functions | Configuração | usada no checkout, no webhook e no despacho interno |
| INTERNAL_JOB_SECRET | Functions | **Secreta** | string longa e aleatória |

Nunca prefixe um segredo com `VITE_`. Tudo que começa com `VITE_` vai para o bundle público.

Gere o `INTERNAL_JOB_SECRET` com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## 5. OpenAI

A copy é gerada no servidor com resposta estruturada em JSON. Os créditos são debitados antes da chamada e estornados em caso de falha. A geração de imagens cria um job e despacha o processamento para uma Background Function, então a requisição do cliente retorna rápido com status 202.

Se a geração de imagens falhar no meio, **apenas as imagens não produzidas são estornadas**, e o cliente pode retomar pelo botão "Tentar novamente" — a retomada cobra somente o que ainda falta.

## 6. Mercado Pago e o modelo de renovação

1. Abra a aplicação no painel de desenvolvedores do Mercado Pago.
2. Configure `MP_ACCESS_TOKEN` no Netlify.
3. Cadastre o webhook em `https://SEU-DOMINIO/.netlify/functions/mp-webhook`.
4. Copie o segredo de assinatura para `MP_WEBHOOK_SECRET`.
5. Teste primeiro com credenciais de teste.

O webhook valida a assinatura HMAC, reconsulta o pagamento na API, confere o valor e só então libera crédito. A coluna `mp_payment_id` é única e a saída de `pending` é condicional, então a mesma notificação nunca credita duas vezes.

### Como cada ciclo é renovado

A coluna `subscriptions.renewal_mode` define quem responde pelo próximo ciclo:

| Modo | Comportamento |
| --- | --- |
| `payment` | Autoatendimento. **Cada ciclo exige um pagamento aprovado novo.** Vencido sem pagamento, os créditos do plano expiram e a assinatura vai para `past_due`. |
| `manual` | Cliente comercial. O admin cobra fora da plataforma e o cron renova automaticamente. É o padrão para clientes criados pelo painel. |
| `preapproval` | Reservado para assinatura recorrente do Mercado Pago (ainda não implementada). |

Créditos avulsos **nunca expiram** e nunca são tocados pela virada de ciclo. Apenas o saldo do plano é substituído.

O modo pode ser trocado por cliente na aba **PLANO** do painel administrativo.

## 7. GitHub e Netlify

1. Crie o repositório no GitHub e faça o push (o `.gitignore` já exclui `node_modules`, `dist` e arquivos `.env`).
2. No Netlify, importe o repositório.
3. Build command: `npm run build` · Publish: `dist` · Functions: `netlify/functions`.
4. Cadastre todas as variáveis de ambiente da seção 4.
5. Faça o deploy.

O build de produção é bloqueado se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` estiverem ausentes.

### Tarefas agendadas

O `netlify.toml` já registra duas:

- `cron-renew-subscriptions` (08:00 UTC) — fecha os ciclos vencidos.
- `cron-maintenance` (04:25 UTC) — limpa `rate_limits` e `webhook_events` antigos e reenfileira jobs de imagem que ficaram travados.

## 8. Cloudflare e domínio

No Netlify, adicione `achilles-content.achillesmedia.com.br` como domínio personalizado. No Cloudflare, crie o CNAME indicado. Durante a emissão do certificado, mantenha o registro como **DNS only**. Depois que o HTTPS estiver estável, se ativar o proxy, use SSL/TLS em modo **Full (strict)**.

O `netlify.toml` já envia HSTS, CSP, `X-Frame-Options` e `Permissions-Policy`. Se adicionar um domínio ou serviço externo, lembre de liberar na CSP.

## 9. Primeiro cliente

1. Entre como administrador e acesse Administração.
2. Clique em Novo cliente, informe nome, e-mail, senha (mínimo 10 caracteres), plano e créditos extras.
3. Copie as credenciais ou abra o WhatsApp com a mensagem pronta.

O cliente entra sem confirmar e-mail (`email_confirm: true`), já recebe os créditos do plano e nasce com `renewal_mode = manual`. Se ele pagar pelo checkout, o webhook muda para `payment`.

## 10. Checklist antes de produção

- [ ] `supabase/schema.sql` executado sem erro.
- [ ] Build de produção passa com as variáveis reais.
- [ ] Primeiro administrador com `role = admin`.
- [ ] Login, logout e recuperação de senha funcionam.
- [ ] Criação de cliente funciona e as credenciais chegam ao cliente.
- [ ] Brand Brain persiste após recarregar em outro navegador.
- [ ] Copy debita o valor correto e a aprovação é obrigatória antes da imagem.
- [ ] Carrossel retorna 202 e o progresso avança no estúdio.
- [ ] **As artes aparecem na tela** no estúdio e no histórico, não só no download.
- [ ] Download individual e ZIP funcionam.
- [ ] Falha em imagem estorna apenas o que não foi produzido e o botão de retomar cobra só o restante.
- [ ] Preços e créditos dos planos aparecem corretos na tela de Planos (não zerados).
- [ ] Webhook do Mercado Pago testado duas vezes com a mesma notificação, sem crédito duplicado.
- [ ] Um cliente `payment` com ciclo vencido vai para `past_due` e os avulsos permanecem.
- [ ] RLS validada com um usuário cliente comum.
- [ ] Nenhum segredo aparece no bundle (`grep -r "sk-\|service_role" dist/`).

## 11. Solução de problemas

**Function retorna 502.** Veja os logs no Netlify. Confirme as variáveis secretas e se o `schema.sql` rodou. O frontend recebe mensagem genérica; o detalhe fica só no log.

**Carrossel não termina.** Abra `generation_jobs` e confira `status`, `done_count`, `attempts` e `last_error`. Confirme `APP_URL` e `INTERNAL_JOB_SECRET`. O `cron-maintenance` reenfileira jobs parados há mais de 15 minutos e desiste após 3 tentativas, estornando o que não foi produzido.

**Webhook não chega.** Confira a URL cadastrada, o `MP_WEBHOOK_SECRET` e os logs de `mp-webhook`. Toda notificação recebida é registrada em `webhook_events` antes do processamento.

**Imagem antiga não aparece.** O banco guarda `storage_path`, nunca a URL assinada. `sign-generation-urls` gera uma nova com validade de uma hora a cada consulta.

**Erro de RLS.** Confirme que o schema rodou por completo. Leituras do cliente usam filtro explícito por `user_id` além da RLS; escritas passam pelas Functions com a chave de serviço.

## 12. Limites desta versão

A composição determinística final — aplicar tipografia Anton, logo e layout fixo sobre o fundo gerado — **ainda não foi implementada**. O fluxo instrui a IA a gerar fundos sem texto, e é isso que o cliente recebe hoje. Essa camada deve ser um serviço separado (por exemplo satori + resvg em uma Function), encaixado depois de `generate-images-background`.

A assinatura recorrente do Mercado Pago (Preapproval) também não está implementada. Enquanto isso, o modelo `payment` exige um pagamento novo por ciclo e o modelo `manual` cobre os clientes faturados fora da plataforma.
