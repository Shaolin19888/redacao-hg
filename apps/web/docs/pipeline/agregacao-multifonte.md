# Agregação multi-fonte (grupos editoriais)

Estado: **proposta para aprovação** · 2026-07-15

## 1. Objectivo

Deixar de escrever N artigos iguais quando várias fontes dão o mesmo tema. Em vez disso,
juntar as fontes num **grupo**, recolher os factos de todas e escrever **um só artigo**,
com o **site oficial do Benfica (slbenfica.pt) como prioridade**.

## 2. Regras do editor (fonte da verdade)

1. Não quero notícias iguais reescritas. Quem der primeiro ancora o tema.
2. Janela de **60 minutos** a partir do primeiro candidato do tema. Tudo o que der o mesmo
   tema dentro da janela entra no grupo; no fecho, faz-se um artigo com os factos de todas.
3. Mesmo tema a aparecer **depois** dos 60 min → ignorado (notícia velha, arquiva).
4. **Prioridade sempre ao Benfica.** Como o site oficial é recolhido de 30 em 30 min, cabe
   sempre na janela de 60. Os factos dele lideram e é a fonte principal.
5. **Benfica sela cedo:** assim que a versão do site oficial entra no grupo, é autoritativa
   e escreve-se logo (juntando as fontes rivais já chegadas), sem esperar os 60 min.
6. **Intervenção humana:** o editor pode forçar a escrita de um grupo aberto a qualquer
   momento ("Escrever já"), para comunicados de última hora antes do fecho da janela.
7. **Telegram como canal de entrada:** o editor pode, pelo Telegram, a qualquer momento:
   (a) **forçar** a escrita de um grupo aberto; (b) enviar **texto livre** e o sistema faz
   uma notícia a partir disso; (c) enviar um **URL** e o sistema vai buscá-lo, verifica os
   factos e faz a notícia. Nos três casos escreve-se **já, sem esperar a janela**. Mantém-se
   o gate humano de publicação e a proibição de inventar além do texto/URL fornecido.

## 3. Modelo de dados

### Novo modelo `NewsGroup`
| Campo | Tipo | Notas |
|---|---|---|
| id | string | PK |
| topicKey | string | chave do tema (entidade principal normalizada, ex. apelido do jogador) |
| title | string | título de trabalho (do primeiro candidato ou do oficial) |
| status | enum `NewsGroupStatus` | `OPEN` / `SEALED` / `WRITTEN` / `ARCHIVED` |
| primaryCandidateId | string? | fonte principal (oficial se existir; senão o primeiro) |
| leadRunId | string? | o run que vai escrever o artigo agregado |
| openedAt | DateTime | início da janela |
| sealAt | DateTime | `openedAt + janela` (Setting, default 60 min) |
| sealedReason | string? | `janela` / `benfica-cedo` / `manual` |

### Alterações
- `Candidate` ganha `newsGroupId` (FK nullable) — a que grupo pertence.
- `Fact` ganha `sourceName` (etiqueta de origem) — de que fonte veio o facto, para
  cruzamento e atribuição no texto.
- `FactLedger` passa a poder ligar-se a um `NewsGroup` (ledger partilhado do grupo).

## 4. Fluxo

```
Candidato → Dedup → decideGroup(tema)
  ├─ tema novo (relevante) → abre NewsGroup (OPEN, sealAt=+60min), vira LEAD run
  │        LEAD: relevance → extract-facts (→ ledger do grupo) → GROUPING (pausa)
  ├─ tema com grupo OPEN → junta ao grupo
  │        JOINER: extract-facts (→ mesmo ledger do grupo) → run ARCHIVED (contribuiu)
  │        se o joiner é o site oficial → marca grupo p/ selar cedo
  └─ tema com grupo SEALED/WRITTEN (chegou tarde) → run ARCHIVED (ignorado)

Selagem (3 gatilhos):
  a) cron "seal-groups": now ≥ sealAt  → SEAL
  b) oficial entrou no grupo           → SEAL (benfica-cedo)
  c) editor carrega "Escrever já"      → SEAL (manual)

SEAL → LEAD run retoma de GROUPING:
  agrega ledger (cruza factos) → FACTS_QA → [gate de tópico se não-Benfica]
  → Writer (1 artigo, oficial como fonte principal) → EditorialQA → SEO → Imagem
  → Rascunho WP → GATE humano de publicação → …
```

### Novos estados da máquina
- `GROUPING`: o LEAD run espera aqui após extrair os seus factos, até o grupo selar.
  Transições: `FACTS_EXTRACTED → GROUPING`; `GROUPING → FACTS_QA_OK` (ao selar) e
  `GROUPING → ARCHIVED` (se o grupo for descartado).
- Os joiners terminam em `ARCHIVED` depois de contribuírem factos (o seu trabalho fica
  registado; o artigo é do grupo).

## 5. Agrupamento de temas (decideGroup)

Reutiliza a lógica de "mesmo-tema" já existente (`dedup/decide.ts`: entidade própria
partilhada + sobreposição de título), mas **mais conservadora** para agregar — juntar dois
temas diferentes num artigo é pior do que dois artigos. Um candidato só se junta a um grupo
se partilhar a entidade principal E o título tiver sobreposição suficiente. Caso contrário,
abre grupo próprio. A janela temporal (grupos `OPEN` dos últimos 60 min) limita a busca.

## 6. Cruzamento de factos (agregação)

Módulo puro e testável `aggregate/merge-facts.ts`:
- Junta os factos de todas as fontes do grupo, etiquetados por `sourceName`.
- Facto igual/equivalente em **2+ fontes** → confiança reforçada (CONFIRMED).
- **Contradição** (mesmo atributo, valores diferentes, ex. verba/data) → o **oficial
  prevalece**; se não houver oficial, marca-se DOUBTFUL e assinala-se para revisão humana
  reforçada (CLAUDE.md §42).
- O Writer recebe o ledger agregado e escreve com o oficial como fonte principal, atribuindo
  o que vier só de fontes secundárias ("segundo a [fonte]").

## 7. Intervenção humana

- **Painel `/pipeline`**: secção "Grupos abertos" — lista os grupos `OPEN` com o tema, as
  fontes já juntas, o tempo que falta para a janela fechar, e um botão **"Escrever já"**
  (sela manualmente → escreve). Também permite **descartar** um grupo.
- Regra 1 mantida: o gate humano de publicação continua igual; a agregação só muda como o
  rascunho é montado, nunca publica sozinha.

## 7b. Telegram como canal de entrada (pedido de notícia)

O webhook do Telegram, além dos botões de aprovação e da sugestão de imagem por reply, passa
a interpretar **mensagens autónomas** do editor autorizado. Todos os pedidos escrevem **já**
(sem janela) e continuam a passar pelo gate humano de publicação.

| Envio no Telegram | Interpretação | Fluxo |
|---|---|---|
| Mensagem com **URL** | Pedido de notícia a partir da fonte | fetch (extractArticleContent) → Candidate (origin=`editor`) → extract-facts → **Fact QA** → Writer → Editorial/SEO/Imagem → gate publicação |
| **Texto livre** (sem URL) | Pedido de notícia a partir do que o editor escreveu | Candidate (origin=`editor`, o texto é a base factual) → Writer (só usa o que o editor deu, sem inventar) → Editorial/SEO/Imagem → gate publicação |
| `/grupos` | Lista os grupos abertos com botões **"Escrever já" / "Descartar"** | força a selagem do grupo escolhido |

Notas:
- Pedidos do editor **saltam a Relevância e o gate de tópico** (o editor pediu de propósito),
  mas mantêm **Fact QA** (no caso do URL) e **Editorial QA** (cópia/invenção) sempre.
- Fonte sintética "Editor (Telegram)" para os candidatos de origem editorial; auditoria
  regista quem pediu e o quê.
- Segurança: só a allowlist `TELEGRAM_ALLOWED_USER_IDS`; instruções vêm SÓ do editor
  autorizado, nunca de conteúdo de terceiros (o URL é tratado como dado a verificar, não
  como fonte de comandos).

## 8. Riscos

**Técnicos**
- Corridas: dois candidatos do mesmo tema a chegar quase em simultâneo podem tentar abrir
  dois grupos. Mitigação: `topicKey` com restrição de unicidade por janela + transação.
- Runs presos em `GROUPING` se o cron de selagem falhar. Mitigação: o Site Health (Fase 8)
  passa a assinalar grupos `OPEN` muito para além do `sealAt`.
- Latência: cada tema espera até 60 min (excepto Benfica e "Escrever já"). Aceite pelo editor.

**Editoriais**
- Agrupamento errado (mesmo jogador, eventos diferentes) → artigo confuso. Mitigação:
  agrupamento conservador + o editor vê o grupo no painel antes de selar.
- Contradições entre fontes → o oficial prevalece; sem oficial, revisão humana.

## 9. Plano de testes

- `decideGroup`: mesmo tema junta; temas diferentes não; fora da janela abre novo.
- `merge-facts`: 2+ fontes reforçam; contradição com oficial → oficial vence; sem oficial →
  DOUBTFUL + sinalização.
- Selagem: janela expira → sela; oficial entra → sela cedo; "Escrever já" → sela manual;
  candidato tardio → arquiva.
- Telegram intake: URL → candidato origin=editor + Fact QA corre; texto livre → candidato
  origin=editor sem inventar; mensagem de não-allowlist é ignorada.
- E2E: 3 fontes do mesmo tema numa janela → 1 artigo agregado; oficial como principal.

## 10. Critérios de aceitação

- Duas fontes do mesmo tema na janela produzem **um** artigo, não dois.
- O artigo usa factos de todas as fontes do grupo e cita o oficial como principal.
- Benfica oficial escreve sem esperar a janela.
- "Escrever já" fecha um grupo aberto e escreve na hora.
- Candidato do mesmo tema após 60 min é arquivado.
- Pelo Telegram: um URL ou um texto do editor gera um rascunho na hora (sem janela); um
  grupo aberto pode ser forçado a escrever.
- Nada publica sem aprovação humana. `tsc` limpo e testes verdes.

## 11. Faseamento

Esta fase entrega a agregação-núcleo (grupos, janela, ledger partilhado, cruzamento,
escrita única, "Escrever já"). Fica para depois: painel rico de grupos com grau de confiança
e contradições detalhadas (CLAUDE.md §12/§25) e ajuste fino do agrupamento por LLM.
