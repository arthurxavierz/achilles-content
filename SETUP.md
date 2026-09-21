# Referência técnica

Complemento do [README.md](README.md). Aqui está como cada peça funciona por dentro, o que pode dar errado e onde olhar.

---

## Arquitetura

```
Cloudflare (DNS)
  └─ Netlify
       ├─ dist/            SPA React (Vite)
       └─ functions/       Netlify Functions (Node 20)
            ├─ chamadas do cliente e do admin
            ├─ generate-images-background   Background Function, até 15 min
            └─ cron-*                       Scheduled Functions
                 └─ Supabase (Postgres + Auth + Storage privado)
                      └─ OpenAI (uma chave só, custo consolidado)
```

O frontend **nunca** fala com a OpenAI e nunca escreve crédito. Toda escrita de saldo passa por funções `security definer` no Postgres, com permissão de execução apenas para a `service_role`.

---

## O fluxo de uma geração

1. **`generate-copy`** — debita os créditos da copy, chama o modelo de texto com o Brand Brain no prompt, grava `copy_json` e registra o custo real em `generations.cost_usd`.
2. **`approve-copy`** — o cliente revisa e aprova. Nada é cobrado aqui. Só depois da aprovação as imagens ficam liberadas: é o que evita o cliente pagar por arte de uma copy que ele ia descartar.
3. **`generate-images`** — debita todas as imagens de uma vez, cria o job e despacha para a Background Function.
4. **`generate-images-background`** — o trabalho pesado, em dois estágios:
   - **Direção de arte:** o modelo de texto lê marca, preset e copy e devolve um JSON fechado (paleta, luz, textura, composição, clima, e uma cena por slide). É calculado uma vez por geração e reaproveitado em retentativas.
   - **Imagens:** cada peça é montada com o bloco fixo do preset + a direção + a cena. Da segunda imagem em diante, a primeira vai anexada como referência via `/images/edits`, o que segura a identidade visual do carrossel.
5. **`sign-generation-urls`** — o bucket é privado. As artes só saem por URL assinada, válida por uma hora.

### Se falhar no meio

O estorno é proporcional. `refundUnproducedImages` devolve só os créditos das peças que **não** chegaram ao cliente — imagem entregue já custou dinheiro na OpenAI e não volta para o saldo. Se ao menos uma peça saiu, a geração fica como `images_ready` e o cliente mantém o que recebeu.

`cron-maintenance` roda a cada 20 minutos e recolhe job travado: reenfileira até três tentativas, depois marca como falho e estorna.

---

## Créditos

Dois saldos separados em `profiles`:

- **`credits_plan`** — vem do plano. Expira no fim do ciclo, não acumula. `set_plan_credits` zera o que sobrou e escreve o valor novo, registrando a expiração no extrato.
- **`credits_extra`** — pacotes avulsos e concessões manuais. Nunca expira.

`spend_credits` consome **primeiro o saldo do plano**, depois o avulso. É o que faz sentido: o saldo que expira é gasto antes do que não expira.

Tudo passa pelo `credit_ledger`, com saldo depois de cada movimento. O extrato do cliente e o CSV saem daí.

### Travas contra gasto descontrolado

Três camadas, e você quer as três:

1. `spend_credits` — sem saldo, sem chamada. É a regra de negócio.
2. `MONTHLY_API_CEILING_USD` — teto de gasto do mês somando `generations.cost_usd`. Ao atingir, o sistema para de gerar mesmo com crédito disponível. Protege contra bug de loop.
3. Limite de uso na conta OpenAI — fora do sistema, então funciona mesmo se o sistema for a origem do problema.

Além disso, `check_rate_limit` limita chamadas por minuto por usuário e operação.

---

## Cálculo de margem

`generations.cost_usd` acumula o custo real de cada chamada, somado atomicamente por `add_generation_cost`. O custo vem do `usage` que a OpenAI devolve, convertido pelas variáveis `OPENAI_*_USD_PER_M`. Quando a resposta não traz `usage`, cai numa tabela de tokens por tamanho e qualidade.

`admin-metrics` cruza isso com os pagamentos aprovados do mês e devolve a margem. As views `admin_margin_month` e `admin_margin_client` servem para consulta direta no SQL Editor quando você quiser investigar.

> Os números de preço da OpenAI nas variáveis de ambiente são uma referência, não um contrato. Se a OpenAI reajustar, a margem do painel fica errada até você atualizar. Confira de tempos em tempos.

---

## Pagamentos

### PIX manual, o caminho padrão

`create-pix-charge` monta um BR Code estático (padrão EMV do Banco Central) apontando direto para a `PIX_KEY`, gera o QR como data URL e cria um `payment` pendente com validade de 24h. Uma cobrança aberta por item: reabrir a tela não gera um segundo QR.

Não há gateway e não há confirmação automática. Você confere o extrato e dá baixa em `/admin`. O `txid` no QR é o id do pagamento sem hifens — é por ele que você casa o extrato com a linha da tabela.

`admin-resolve-payment` marca a linha como aprovada **antes** de conceder, com `.eq('status','pending')`. Se dois admins clicarem ao mesmo tempo, só um encontra a linha pendente e o crédito não é concedido em dobro.

### Mercado Pago, opcional

Continua funcionando em paralelo se você preencher `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`. Sem essas variáveis, `create-checkout` responde com uma mensagem clara mandando usar o PIX. O webhook valida assinatura HMAC e confere se o valor pago bate com o valor cobrado antes de creditar.

Os dois caminhos terminam em `applyApprovedPayment`, então não divergem.

---

## Direção de arte

Presets vivem em `art_presets`. Cada um é um bloco de prompt fixo e específico — lente, luz, textura, profundidade de campo — e a marca entra como variável por cima. É o que separa "imagem de IA" de peça com assinatura: adjetivo solto no prompt produz resultado genérico; especificação fotográfica concreta, não.

Para adicionar um preset, insira em `art_presets` — ele aparece no estúdio e no Brand Brain sem deploy.

### Qual modelo roda cada faixa

`pricing.openai_model` define o motor de cada faixa de preço, então Padrão e Assinatura não precisam usar o mesmo. Hoje: `gpt-image-2.5-flare` para Padrão (rápido, do dia a dia) e `gpt-image-2.5-sunburst` para Assinatura (precisão e fidelidade à referência). Trocar é um `update`, sem deploy — e o modelo usado fica gravado em `generations.openai_model`, para o histórico não mentir depois de uma troca.

A família 2.5 aceita dimensão customizada (lados múltiplos de 16, proporção entre 1:3 e 3:1, área entre 655.360 e 8.294.400 pixels), por isso o feed sai em **4:5 nativo** (1024x1280) e o story em **9:16 nativo** (1152x2048). Não há recorte em lugar nenhum. `validSize` recusa qualquer valor fora dessas regras e cai no padrão, para uma configuração errada em `app_settings` não derrubar a geração.

`input_fidelity` só existe na família `gpt-image-1`. Mandar esse parâmetro para um modelo 2.5 derruba a chamada, então `supportsInputFidelity` decide na hora do envio.

### Referências de imagem

Descrição em texto não reproduz mascote, motivo gráfico nem tratamento de luz específico. Por isso o Brand Brain aceita até seis imagens reais da marca, e as duas primeiras vão anexadas a **toda** arte gerada, via `/images/edits`. O texto continua valendo para as regras; a imagem passa a valer para o look.

Quantas entram e com que fidelidade são lidas fica em `app_settings` (`reference_images_max`, `reference_fidelity`), ajustável por SQL. Cada referência anexada soma tokens de entrada no custo da imagem — subir o teto encarece cada geração.

O upload vai direto do navegador para o Storage com o JWT do usuário; as policies do bucket garantem que ninguém escreve na pasta de outro.

### Texto na arte

Até a V10 o prompt proibia qualquer caractere legível na imagem, partindo da premissa de que a tipografia entraria numa camada de composição. Essa camada não existe no produto, e marca com identidade gráfica forte tem o título como parte da arte. Virou escolha, em dois níveis: `brand_profiles.render_text` é o padrão da marca, e cada geração pode decidir diferente.

Com o modo ligado, o título da copy vai para o prompt **entre aspas e literal**, com instrução explícita de não inventar, não traduzir e não acrescentar nada. Modelo de imagem que "interpreta" texto erra grafia e cria palavra. O subtítulo só entra se tiver até 110 caracteres — acima disso vira parede de texto e a taxa de erro sobe.

O modo escolhido fica gravado em `generations.render_text`, então uma regeneração de peça isolada sai coerente com o resto do carrossel. `brand_profiles.text_style` guarda a orientação de tipografia, separada de `visual_rules` porque só se aplica nesse modo.

Com o modo desligado, a regra antiga volta inteira: nada de texto, e área limpa reservada para a tipografia entrar depois.

---

## Cadastro e limite de contas

O cliente se cadastra sozinho em `/criar-conta`. A conta nasce confirmada (`email_confirm: true`) de propósito: o atrito fica no pagamento do plano, que é o que o admin valida, não na porta de entrada.

O cadastro **não** usa `supabase.auth.signUp` no navegador — passa pela function `signup`, porque é lá que o limite é aplicado. Por isso o signup por e-mail precisa estar **desligado** no painel do Supabase: ligado, dá para criar conta chamando a API do Supabase direto e furar o limite.

Duas camadas contam contas, ambas em `app_settings`:

- **`signup_max_per_device`** (3): um UUID gerado no navegador e guardado em `localStorage`. Limpar o navegador zera — e tudo bem, é a primeira barreira, não a última.
- **`signup_max_per_network`** (8): hash de IP + user agent, com o `INTERNAL_JOB_SECRET` como sal. Pega quem limpou o storage. O IP nunca é guardado em claro.

`signup_window_days` (30) é a janela dos dois. `signup_open` fecha a porta sem derrubar o site. A contagem roda em `check_signup_quota`, no banco, para ser atômica: duas abas abertas ao mesmo tempo não furam o limite.

Nada disso impede uma fraude determinada — VPN mais navegador anônimo passa. O objetivo é travar a criação casual de contas para farmar os 200 créditos de cortesia, e esse custo é de centavos por conta.

---

## O que o sistema não decide pelo cliente

A plataforma **sugere** estilo, não impõe. Até a V11 o código carregava opinião como lei: "nada de emoji", "legenda de três a cinco frases", "quatro a oito hashtags", "nada de colagem nem moldura", "nenhum texto na imagem". Nenhum campo do Brand Brain conseguia derrubar isso.

Agora a plataforma tem padrões em `app_settings` (`copy_style_default`, `image_style_default`), e a marca sobrescreve por inteiro em `brand_profiles.copy_rules` e `brand_profiles.image_rules`. Campo vazio usa o padrão; campo preenchido manda.

O único limite que continua de pé é o de conteúdo da própria OpenAI, que se aplica na API dela e não depende deste código.

---

## Segurança

- **RLS ligada em tudo.** O cliente lê apenas as próprias linhas. `admin_audit_log`, `webhook_events` e `rate_limits` ficam com RLS ligada e nenhuma policy: só a `service_role` enxerga.
- **Storage privado.** As artes só saem por URL assinada de uma hora.
- **A Background Function exige `x-job-secret`.** Sem o `INTERNAL_JOB_SECRET` correto ela devolve 403 — senão qualquer um dispararia geração paga.
- **CSP restritiva** no `netlify.toml`. `img-src` precisa de `data:` por causa do QR do PIX; `connect-src` precisa do Supabase.
- **Toda ação de admin vai para `admin_audit_log`**, com quem fez, em quem e o quê.

---

## Variáveis de ambiente

Estão documentadas uma a uma em `.env.example`. As que costumam causar problema:

| Variável | Armadilha |
|---|---|
| `APP_URL` | Se apontar para a `.netlify.app` em vez do domínio final, a Background Function não é chamada e a geração fica travada em "processando". |
| `INTERNAL_JOB_SECRET` | Se estiver vazio dos dois lados, a comparação passa e qualquer um pode disparar job. Sempre preencha. |
| `VITE_*` | São lidas no **build**, não em runtime. Mudou o valor, precisa de redeploy. |
| `SUPABASE_SECRET_KEY` | Se vazar, o banco inteiro vazou. Só no Netlify. |

---

## Problemas comuns

**Geração trava em "processando".** Quase sempre `APP_URL` errada ou `INTERNAL_JOB_SECRET` diferente entre as duas pontas. Olhe os logs da `generate-images-background` no Netlify. O `cron-maintenance` recolhe em até 20 minutos, mas isso é rede de proteção, não solução.

**Carrossel demora demais / dá timeout.** Confirme que a função está rodando como Background Function. Cinco imagens em qualidade Assinatura passam fácil dos 10 segundos de uma função comum.

**"Tabela de preços indisponível".** A `migration-v5.sql` não rodou, ou rodou parcialmente. Cheque se `public.pricing` tem as seis linhas.

**Planos aparecem com valores errados na landing.** São os valores de fallback de `shared/pricing.js`. Significa que `list-plans` ou `list-pricing` falhou — olhe o console do navegador e os logs das funções.

**Cliente diz que pagou e o crédito não entrou.** É esperado: a baixa é manual. Confira o extrato e confirme em `/admin`.

**Margem negativa ou muito baixa.** Abra a aba de histórico do cliente e olhe o custo em dólar por geração. Cliente que só gera story em qualidade Assinatura é o pior caso da tabela de preços.

---

## Arquivos que importam

| Caminho | Papel |
|---|---|
| `supabase/schema.sql` | estrutura completa, idempotente |
| `supabase/migration-v5.sql` | preços, presets, custo real, PIX, cortesia de 200 |
| `supabase/migration-v6.sql` | presets de marca gráfica e elementos recorrentes |
| `supabase/migration-v7.sql` | imagens de referência da marca e app_settings |
| `supabase/migration-v8.sql` | formato das peças e área de segurança do recorte |
| `supabase/migration-v9.sql` | modelo de imagem por faixa e formato 4:5 nativo |
| `supabase/migration-v10.sql` | texto na arte como escolha, não como regra |
| `supabase/migration-v11.sql` | guardrails editáveis, cadastro próprio, contas por dispositivo |
| `netlify/functions/_shared.js` | catálogo, custo, despacho e estorno |
| `netlify/functions/_billing.js` | aplicação de pagamento aprovado |
| `netlify/functions/_pix.js` | gerador de BR Code |
| `shared/pricing.js` | espelho do catálogo para o frontend e o modo demo |
| `netlify.toml` | build, crons, redirects, headers |
