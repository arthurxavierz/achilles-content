# Achilles Content V4

SaaS de geração de conteúdo com Brand Brain, fluxo de aprovação, créditos, histórico, administração e cobrança.

## Teste rápido

```bash
npm install
npm run dev
```

Abre a versão de demonstração, sem nenhuma chave externa. Para conectar Supabase, OpenAI e Mercado Pago de verdade, siga o `SETUP.md`.

## Rotas

| Rota | O que é |
| --- | --- |
| `/` | landing pública |
| `/entrar` | login |
| `/app` | painel do cliente |
| `/app/criar` | estúdio de criação |
| `/app/historico` | histórico e downloads |
| `/app/marca` | Brand Brain |
| `/app/planos` | planos e créditos |
| `/admin` | administração |

## Arquitetura

- **Frontend**: React 18 + Vite + React Router, servido pelo Netlify.
- **Backend**: Netlify Functions. Toda escrita passa por elas com a chave de serviço.
- **Banco**: Supabase (Postgres + Auth + Storage privado). RLS liberando ao cliente apenas leitura do que é dele.
- **IA**: OpenAI para copy (JSON estruturado) e para os fundos das artes.
- **Cobrança**: Mercado Pago Checkout Pro com webhook assinado e idempotente.

### Créditos

Dois saldos separados: `credits_plan` (renova a cada ciclo, não acumula) e `credits_extra` (avulso, nunca expira). O débito consome primeiro o saldo do plano. Todo movimento fica registrado em `credit_ledger`.

### Fluxo de geração

`briefing → copy → aprovação obrigatória → imagens`

A copy é cobrada na hora. As imagens só são cobradas depois da aprovação. Se a geração falhar no meio, apenas as imagens não produzidas são estornadas e o cliente pode retomar pagando só o restante.

## Banco de dados

Um único arquivo: `supabase/schema.sql`. É completo, idempotente e serve tanto para projeto novo quanto para atualizar uma base V3.

Consulte `SETUP.md` antes de publicar.
