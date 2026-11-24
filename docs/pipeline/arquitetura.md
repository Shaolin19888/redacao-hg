# Redação HG — Pipeline Editorial Semi-Autónomo

> Documento de arquitectura. Fonte de verdade para a evolução da Redação HG de painel
> manual para redacção assistida por agentes, com controlo editorial e aprovação humana
> obrigatória. Aprovado em 2026-07 antes de qualquer implementação.

## 1. Princípios inegociáveis

1. **Nada publica sem aprovação humana explícita.** O pipeline pausa no gate e só o
   Telegram (ou o painel) o retoma.
2. **Nunca inventar** factos, declarações, datas, lesões, valores ou narrativas.
3. **Nunca copiar** frases das fontes. QA compara n-gramas contra os excertos guardados.
4. **Nunca transformar rumor em facto.** `Fact.status` distingue confirmado de não confirmado.
5. **Rastreabilidade total.** Fonte, URL, data de recolha e evidência guardados sempre.
6. **Fact Ledger fechado.** Lista de factos autorizados; o Writer só escreve a partir dela.
7. **Auditoria.** Cada decisão de agente grava uma linha `AgentDecision`.

## 2. Decisão de arquitectura central

Os "agentes" **não são processos autónomos**. Cada agente é uma **função pura tipada**
(um *step*) com contrato de entrada/saída validado por `zod`:

```ts
run(input: TIn, ctx: AgentContext): Promise<AgentResult<TOut>>
// determinístico, testável isoladamente, sem estado próprio
```

A inteligência de fluxo vive num **Orchestrator** (código, não LLM) que corre uma
**máquina de estados** sobre a entidade `PipelineRun`. Cada transição enfileira o job
seguinte numa fila BullMQ. Os agentes que precisam de raciocínio chamam o LLM com prompt
restrito e **saída estruturada obrigatória** (JSON validado por zod).

```
Orchestrator (máquina de estados, código)
  └─ enfileira job → BullMQ (Redis) → Worker (processo Node dedicado)
        └─ invoca Agent Step (função pura + zod)
              ├─ opcional: LLM com structured output
              └─ grava AgentDecision (log auditável)
```

Esta escolha é o que evita "caos de agentes independentes": um worker, uma fila por
etapa, retries/backoff automáticos, e um registo auditável de cada passo.

## 3. Modelo de execução

- **Worker**: processo Node dedicado (`worker.ts`), sob launchd com KeepAlive, ao lado do
  web. Mantém o cron existente (Radar) e adiciona os workers BullMQ do pipeline.
- **Filas** (BullMQ sobre o Redis já no docker-compose): uma por etapa —
  `collect · dedup · relevance · extract-facts · fact-qa · write · editorial-qa ·
  seo-qa · image-research · image-qa · wp-draft · notify-approval · publish ·
  social-draft · social-qa · distribute · site-health`.
- Retries com backoff exponencial; dead-letter por fila; concorrência limitada nas filas
  que chamam LLM/APIs externas.
- `collect` e `site-health` são repeatable jobs (cron do BullMQ), respeitando a frequência
  de cada `SourceConfig`.

## 4. Modelos LLM

Conforme o CLAUDE.md, o ChatGPT (OpenAI) é o redactor principal. Estratégia de custo:

| Etapa | Modelo | Racional |
|---|---|---|
| Relevance, Fact QA, Editorial QA (triagem) | económico (ex. `gpt-4o-mini`) | volume alto, decisão simples |
| Fact Extraction | intermédio | precisa rigor mas é estruturado |
| Article Writer, Editorial QA final | forte | qualidade editorial |

Configurável por `Setting`/`SourceConfig`. Tokens registados em `AgentDecision`.

## 5. Máquina de estados (`PipelineRun.state`)

```
COLLECTED → DEDUP_OK → RELEVANT → FACTS_EXTRACTED → FACTS_QA_OK
  → WRITTEN → EDITORIAL_QA_OK → SEO_QA_OK
  → IMAGE_READY → IMAGE_QA_OK → WP_DRAFTED
  → AWAITING_APPROVAL ──┬─ APPROVED_ALL → PUBLISHED → SOCIAL_DRAFTED → SOCIAL_QA_OK → DISTRIBUTED → DONE
                        ├─ TEXT_REJECTED   → (volta a WRITTEN)
                        ├─ IMAGE_REJECTED  → (volta a IMAGE_READY)
                        ├─ SAVED_DRAFT     → PAUSED
                        └─ REJECTED_ALL / CANCELLED → ARCHIVED
  Qualquer estado → FAILED (com erro) → retry ou intervenção humana
```

As transições permitidas são declaradas explicitamente em `state-machine.ts`. Uma
transição inválida é um erro (não avança em silêncio). Estados terminais: `DONE`,
`ARCHIVED`. Estados que aguardam humano: `AWAITING_APPROVAL`, `PAUSED`.

## 6. Schema de base de dados

Mantém os modelos actuais (`Source`, `NewsItem`, `Social*`, etc.). Adiciona o núcleo do
pipeline. Os modelos entram por fase para manter migrações pequenas.

| Modelo | Fase | Papel |
|---|---|---|
| `PipelineRun` | 0 | entidade do artigo no fluxo: `state`, `currentAgent`, erro, refs |
| `AgentDecision` | 0 | auditoria: agente, input/output JSON, modelo, prompt, tokens, duração |
| `SourceConfig` | 1 | config de fonte: tipo, categorias, frequência, regras (JSON), activo |
| `Candidate` | 1 | notícia recolhida normalizada + simhash para near-duplicate |
| `FactLedger` / `Fact` | 2 | lista fechada de factos atómicos com evidência e estado |
| `Article` | 2 | output do Writer + Fact IDs usados |
| `QAReport` | 3 | 1 por etapa de QA: passed, score, issues[] |
| `ImageAsset` | 4 | origem, url, alt, dimensões/peso, qaStatus, `isSynthetic`, wpMediaId |
| `ApprovalRequest` | 5 | ligação ao Telegram: chatId, messageId, decisão, quem/quando |
| `SocialDraft` | 7 | versões para redes + QA, liga ao Social Hub existente |

`AgentDecision` é a espinha dorsal: reconstrói qualquer artigo passo a passo.

## 7. Estrutura de pastas

O monorepo tem `packages/*` mas **o web não os consome** (são shells vazios). Para evitar
churn de wiring, o pipeline assenta em `apps/web/lib/pipeline` (mesmo Prisma, mesmos
imports `@/`, mesmo tsconfig) e o worker é `apps/web/worker.ts` (script já existente).

```
apps/web/
  lib/pipeline/
    orchestrator/     state-machine.ts, orchestrator.ts
    queues/           connection.ts, definitions.ts, register.ts
    agents/           um ficheiro por agente (função pura + zod)
    contracts/        schemas zod partilhados (I/O de cada agente)
    ledger/           fact-ledger.ts
    logging/          agent-decision.ts
  worker.ts           boot do cron (Radar) + workers BullMQ
  app/(dashboard)/pipeline/   painel: runs, estados, ledger, QA, aprovações
  app/api/pipeline/           controlo manual (retry, cancelar, forçar etapa)
  app/api/telegram/webhook/   callback dos botões (Fase 5)
docs/pipeline/          este documento + runbook + contratos
tests/                  unit por agente + e2e por fase
```

## 8. Riscos e mitigações

**Técnicos.** Worker é novo ponto de falha → launchd KeepAlive + dead-letter + painel de
saúde. Custo LLM por artigo → modelos baratos na triagem, log de tokens. Segredos
(Telegram/WP) só em `.env`.

**Editoriais.** Writer escorregar para além do ledger → Editorial QA rejeita afirmação sem
Fact ID (coração do sistema). Rumor como facto → `Fact.status` + Writer só afirma factos
`confirmado`, resto fica condicional.

**Legais.** Difamação/acusações → QA sinaliza temas sensíveis e força revisão humana
reforçada (CLAUDE.md §42/43). Imagens que enganam → `ImageAsset.isSynthetic` + Image QA
bloqueia gerar rostos/eventos reais. Cópia → comparação de n-gramas com excertos.

**SEO.** Títulos enganadores → SEO QA valida contra o ledger, não só keywords. Requisitos
Google News/Discover mudam → regras versionadas em config, não hardcoded.

## 9. Plano por fases — TODAS CONCLUÍDAS (2026-07)

Cada fase entregou código funcional + testes + logs + doc. Nada real publica sem
credenciais válidas e aprovação humana. Estado: **8/8 fases completas e verificadas E2E.**

- **Fase 0** ✓ — Fundação: BullMQ + worker, `zod`, `PipelineRun`, `AgentDecision`, painel,
  kill-switch da auto-reescrita legacy.
- **Fase 1** ✓ — Source Manager + config de fonte + recolha simulada + fila de candidatos +
  Duplicate Detector (URL + near-dup por simhash, limiar Hamming=6).
- **Fase 2** ✓ — Relevance + Fact Ledger + Fact QA + Writer (só factos confirmados do ledger).
- **Fase 3** ✓ — Editorial QA (cópia/invenção) + SEO/Discover QA + rascunho WordPress.
- **Fase 4** ✓ — Image Research (Openverse/CC, sem geração) + Image QA + ligação ao rascunho.
- **Fase 5** ✓ — Aprovação por Telegram (6 botões) + fallback no painel.
- **Fase 6** ✓ — Publicação final pós-aprovação.
- **Fase 7** ✓ — Social Publisher + Social QA (reusa Social Hub) + distribuição com gate humano.
- **Fase 8** ✓ — Site Health + relatórios.

Modos simulados por defeito, controlados por `Setting`: `pipeline_llm_mode`,
`pipeline_wp_mode`, `pipeline_images_mode`, `pipeline_social_mode` (todos `simulado` até
`real`); `pipeline_images_enabled`, `pipeline_social_autodistribute` (flags on/off).

## 10. Decisões registadas

| Tema | Decisão |
|---|---|
| Worker | Processo Node dedicado sob launchd |
| Modelos LLM | Triagem económica + Writer/QA forte |
| Geração de imagem | Só pesquisa real na Fase 4; geração adiada com guarda-rails |
| Auto-publicação legacy | `auto-rewrite`/`auto-publish` ficam atrás de kill-switch (`Setting`) |

## 11. Skills

Úteis e reais: `firecrawl` (recolha), `google-search-console` (SEO/Site Health),
`frontend-design`/`ui-ux-pro-max`/`shadcn` (painel), `webapp-testing` (testes),
`supabase-postgres-best-practices` (schema). Skills-fantasma (pastas vazias, não usar):
`news-seo`, `title-tag`, `meta-description`, `indexing`, `core-web-vitals`. Skills externas
só após avaliação de risco e confirmação humana (regras 10–11).
