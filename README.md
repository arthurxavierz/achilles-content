# Achilles Content

SaaS de geração de conteúdo para redes sociais. O cliente define a identidade da marca uma vez (Brand Brain), pede uma publicação, aprova a copy e só então gasta crédito com as artes. Tudo roda numa única chave da OpenAI, com o custo consolidado e a margem visível no painel.

**A regra que não se quebra:** nenhuma chamada à OpenAI acontece sem crédito debitado antes. Se o saldo não cobre, a operação nem começa.

---

## Como a economia funciona

Crédito é a unidade de consumo. O custo de cada operação vive na tabela `pricing` no banco — você reajusta lá, sem deploy.

| Operação | Créditos |
|---|---|
| Copy de post ou story | 50 |
| Copy de carrossel (5 slides) | 150 |
| Imagem Padrão | 100 |
| Imagem Assinatura | 300 |
| Análise de marca | 300 |

Um carrossel completo em qualidade Padrão: 150 + 5×100 = **650 créditos**.

### Planos

| Plano | Preço | Créditos | R$/crédito | Margem no pior caso¹ |
|---|---|---|---|---|
| Cortesia | grátis | 200 (uma vez) | — | custo de aquisição ~R$0,40 |
| Starter | R$147 | 7.500 | 0,0196 | 74% |
| Pro | R$297 | 20.000 | 0,0149 | 67% |
| Studio | R$597 | 45.000 | 0,0133 | 64% |
| Agência | R$1.197 | 100.000 | 0,0120 | 60% |

¹ Cenário em que o cliente queima 100% do saldo na operação mais cara (Imagem Assinatura vertical, ~R$1,45 de custo real). No uso normal a margem fica perto de 80%.

Pacotes avulsos custam mais por crédito que o plano — o desconto é a recorrência — e nunca expiram. Os créditos do plano expiram no fim de cada ciclo.

---

## O que depende de você para colocar no ar

Oito passos. Faça na ordem.

### 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com). Guarde a senha do banco.
2. Abra **SQL Editor** e rode, nesta ordem, o conteúdo completo de:
   - `supabase/schema.sql`
   - `supabase/migration-v5.sql`
   - `supabase/migration-v6.sql`
   - `supabase/migration-v7.sql`
   - `supabase/migration-v8.sql`
   - `supabase/migration-v9.sql`
   - `supabase/migration-v10.sql`
   - `supabase/migration-v11.sql`
   - `supabase/migration-v12.sql`
   - `supabase/migration-v13.sql`
   - `supabase/migration-v14.sql`
   - `supabase/migration-v15.sql`
   - `supabase/migration-v16.sql`

   Todos são idempotentes: pode rodar de novo sem quebrar nada.
3. Em **Project Settings → API**, copie:
   - `Project URL` → vira `SUPABASE_URL` e `VITE_SUPABASE_URL`
   - chave `anon` / publishable → `SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PUBLISHABLE_KEY`
   - chave `service_role` → `SUPABASE_SECRET_KEY`

   > A `service_role` ignora todas as regras de segurança do banco. Ela só pode existir nas variáveis de ambiente do Netlify. Nunca no frontend, nunca no Git.
4. Em **Storage**, confirme que os buckets `generation-assets` e `brand-references` existem e estão **privados**. As migrações já criam assim.

5. Em **Authentication → Providers → Email**, **desmarque "Enable email signups"**. O cadastro público do Achilles Content passa por uma Netlify Function, que é quem aplica o limite de contas por dispositivo. Com o signup direto do Supabase ligado, dá para furar esse limite chamando a API do Supabase pelo navegador.

### 2. Sua conta de administrador

1. Em **Authentication → Users**, crie seu usuário com e-mail e senha.
2. No SQL Editor, rode:
   ```sql
   update public.profiles set role='admin' where email='seu@email.com.br';
   ```
3. Sem esse passo o `/admin` fica inacessível para todo mundo.

### 3. OpenAI

1. Gere uma chave em [platform.openai.com](https://platform.openai.com) → `OPENAI_API_KEY`.
2. **Defina um limite de uso mensal na própria conta OpenAI.** Isso é o freio de emergência de fora do sistema; o `MONTHLY_API_CEILING_USD` é o de dentro. Os dois juntos.
3. Confirme o `OPENAI_TEXT_MODEL`. O modelo de imagem **não** vem do ambiente: cada faixa de preço escolhe o seu, na coluna `pricing.openai_model`. Padrão usa `gpt-image-2.5-flare`, Assinatura usa `gpt-image-2.5-sunburst`. Trocar de modelo é um `update` na tabela, sem deploy.
4. Confira a tabela de preços vigente e ajuste as variáveis `OPENAI_*_USD_PER_M` se estiver diferente. Elas não afetam a cobrança do cliente, só o cálculo de margem no painel.

### 4. PIX

1. Defina qual chave PIX recebe os pagamentos → `PIX_KEY`.
2. `PIX_MERCHANT_NAME` (até 25 caracteres) e `PIX_MERCHANT_CITY` (até 15). Sem acento — o sistema normaliza, mas confira como aparece no app do banco.
3. **Teste com valor real baixo antes de abrir para cliente.** Gere um pacote, pague, confirme que o QR abre corretamente no seu banco.

### 5. Git

```bash
git add -A
git commit -m "V5: economia de créditos, direção de arte e PIX manual"
git push
```

Confirme que o `.env` **não** está no commit. O `.gitignore` já cobre, mas olhe.

### 6. Netlify

1. **Add new site → Import an existing project**, conecte o repositório.
2. Build já vem do `netlify.toml`: comando `npm run build`, publish `dist`, functions `netlify/functions`.
3. Em **Site settings → Environment variables**, cadastre todas as variáveis do `.env.example`. As `VITE_*` precisam estar lá também: são lidas no momento do build.
4. Gere o `INTERNAL_JOB_SECRET`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
5. `APP_URL` e `VITE_APP_URL` precisam ser a URL final com domínio próprio, não a `.netlify.app`. O sistema usa `APP_URL` para chamar a própria função de background.
6. Faça o deploy e confirme em **Functions** que aparecem as 30+ funções e que `cron-renew-subscriptions` e `cron-maintenance` estão listadas como **Scheduled**.

> **Verifique o plano do Netlify.** A geração de imagem usa uma *Background Function* (`generate-images-background`), que roda até 15 minutos. Se o seu plano não incluir background functions, a geração de carrossel vai estourar o timeout de 10 segundos das funções comuns. É o único item da stack que pode exigir upgrade.

### 7. Cloudflare

1. Aponte o domínio: registro `CNAME` de `achilles-content` para o host que o Netlify informar em **Domain management**.
2. Deixe o registro como **DNS only** (nuvem cinza, sem proxy). O Netlify emite e renova o certificado sozinho; com o proxy ligado os dois brigam pelo SSL.
3. Se fizer questão do proxy laranja, mude o SSL/TLS do Cloudflare para **Full (strict)** — em qualquer outro modo o site entra em loop de redirecionamento.
4. Espere o Netlify mostrar o certificado ativo antes de divulgar o link.

### 8. Teste de ponta a ponta

Nesta ordem, e só considere no ar quando os oito passarem:

1. Abrir a landing e ver os planos carregando do banco (não os valores de fallback).
2. Criar uma conta nova e ver os **200 créditos** de cortesia no painel.
3. Preencher o Brand Brain e salvar.
4. Gerar uma copy. Conferir o débito no extrato.
5. Aprovar e gerar as artes. Acompanhar a barra de progresso até o fim.
6. Baixar o ZIP.
7. Gerar um PIX, pagar o valor real, confirmar no `/admin` e ver os créditos entrarem.
8. No `/admin`, conferir que **margem do mês** e **custo real de API** aparecem preenchidos.

---

## A rotina depois que estiver no ar

**Todo dia útil:** abrir o `/admin` e limpar a fila de **Conciliação**. É onde os PIX pagos esperam sua confirmação. Confira o extrato do banco antes de clicar em confirmar — a confirmação concede os créditos na hora e fica registrada no log de auditoria.

**Toda semana:** olhar o card de **margem do mês**. Se cair abaixo de 50% o card fica vermelho. Quando isso acontecer, o caminho é a aba de histórico do cliente: cada geração mostra o custo real em dólar, então dá para achar quem está consumindo desproporcionalmente.

**Autopreenchimento do Brand Brain.** A tela lê as imagens de referência do cliente e propõe os 22 campos, a 50 créditos (`pricing.brand_analysis`). Quantas imagens entram na leitura é `app_settings.brand_autofill_images`, padrão 4: é esse número que governa o custo na OpenAI, e mexer nele não exige deploy. A conta do onboarding fecha exata — 50 de análise + 50 de copy de post + 100 de imagem padrão = os 200 créditos de cortesia.

O `OPENAI_TEXT_MODEL` precisa ser um modelo que enxerga imagem — a análise manda as peças no mesmo endpoint `/v1/responses` que a copy usa. Modelo só de texto responde 400 e o cliente vê a mensagem de configuração recusada.

O gasto em dólar da análise fica no resultado do job, em `brand_autofill_jobs.result.usd`, e **não** entra no teto de `MONTHLY_API_CEILING_USD`, que só soma `generations.cost_usd`.

**Quando quiser reajustar preço:** não precisa de deploy. `update public.pricing set credits=... where slug='...'` no SQL Editor. O catálogo tem cache de 60 segundos, então o novo valor aparece em até um minuto.

---

## Rodando na sua máquina

```bash
npm install
npm run dev        # modo demonstração, não precisa de Supabase
npm run dev:real   # precisa do Netlify CLI e do .env preenchido
```

O modo demonstração usa dados falsos e não chama API nenhuma. Serve para mexer em layout sem gastar crédito.

---

## Rotas

| Rota | O que é |
|---|---|
| `/` | landing pública |
| `/entrar` | login |
| `/app` | painel do cliente |
| `/app/criar` | estúdio de geração |
| `/app/historico` | entregas anteriores |
| `/app/marca` | Brand Brain |
| `/app/planos` | planos, créditos e PIX |
| `/admin` | operação e conciliação |

Detalhes técnicos de cada peça estão em [SETUP.md](SETUP.md).
