import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { buildWriterSystem, buildCorrectionUser, PROMPT_VERSION } from "../llm/prompts";
import { composeArticleHeuristic, type ConfirmedFact } from "../writer/compose-heuristic";

/**
 * Article Writer Agent — escreve uma notícia original em português europeu a partir
 * dos factos CONFIRMED do ledger trancado. Restrição-chave (regra 7): o Writer só
 * recebe os factos confirmados; nunca o texto original. nextState → WRITTEN.
 */

const MIN_WORDS = 200;

const factShape = z.object({ id: z.string(), text: z.string(), type: z.string() });

const inputSchema = z.object({
  pipelineRunId: z.string(),
  candidateTitle: z.string(),
  sourceName: z.string(),
  confirmedFacts: z.array(factShape),
  // Rumores/informações não confirmadas: usáveis SÓ com atribuição à fonte (regra 4).
  doubtfulFacts: z.array(factShape),
  // Frases que uma reescrita anterior copiou da fonte — o Writer tem de as reformular.
  avoidPhrases: z.array(z.string()).optional().default([]),
  // Fonte oficial do Benfica: tudo é oficial e verificado (sem ressalvas de "não confirmado").
  official: z.boolean().optional().default(false),
  // Feedback do Agente Revisor: quando presente, corrige-se SÓ o apontado (§I), sobre o
  // texto atual, em vez de escrever de raiz.
  correction: z
    .object({
      title: z.string(),
      body: z.string(),
      // Etiquetas do Revisor (ex.: "titulo-cita-orgao"), não números: a checklist vive na doutrina.
      falhas: z.array(z.string()),
      correcoes: z.array(z.string()),
    })
    .nullable()
    .optional()
    .default(null),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  articleId: z.string(),
  wordCount: z.number(),
  usedFactCount: z.number(),
});

const llmOutputSchema = z.object({
  title: z.string(),
  lead: z.string(),
  body: z.string(),
});

async function llmWrite(input: Input) {
  // Modo de correção (ciclo de revisão §I): corrige só o que o Revisor apontou.
  if (input.correction) {
    const user = buildCorrectionUser({
      title: input.correction.title,
      body: input.correction.body,
      falhas: input.correction.falhas,
      correcoes: input.correction.correcoes,
    });
    return completeJSON({ tier: "text", system: buildWriterSystem(), user, schema: llmOutputSchema });
  }

  const confirmedBlock = input.confirmedFacts.length
    ? input.confirmedFacts.map((f, i) => `${i + 1}. [${f.type}] ${f.text}`).join("\n")
    : "(nenhum facto confirmado sobre o tema)";
  const doubtfulBlock = input.doubtfulFacts.length
    ? input.doubtfulFacts.map((f, i) => `${i + 1}. [${f.type}] ${f.text}`).join("\n")
    : "(nenhuma)";

  const avoidBlock = input.avoidPhrases.length
    ? `\n\nATENÇÃO — uma versão anterior foi rejeitada por CÓPIA. NUNCA reproduzas estas sequências da fonte; reformula-as por completo, com outras palavras e outra construção frásica:\n${input.avoidPhrases.map((p) => `- «${p}»`).join("\n")}`
    : "";

  // Informação ainda não oficial: marca-se UMA vez, leve e perto do fim (doutrina §7).
  // Nunca se repete a fonte nem "o clube não confirmou".
  const doubtfulRules =
    input.official || input.doubtfulFacts.length === 0
      ? ""
      : `\n- As informações NÃO CONFIRMADAS vêm da imprensa e ainda não são oficiais. Marca essa` +
        ` origem UMA ÚNICA VEZ, de forma leve e curta, de preferência já perto do FIM do texto` +
        ` (por exemplo, uma referência discreta a ${input.sourceName}). Depois nunca mais repitas.` +
        `\n- NÃO repitas "o clube não confirmou", "ainda não há confirmação" ou equivalente. Uma marca leve chega.` +
        `\n- Não apresentes o rumor como certeza, mas também não enchas o texto de ressalvas.` +
        ` Uma vez quando não é oficial, nenhuma quando é.`;

  const officialNote = input.official
    ? `\n\nA fonte é o SITE OFICIAL do Benfica: tudo o que é dado é OFICIAL e VERIFICADO. Escreve` +
      ` como factos assentes, com firmeza e naturalidade, SEM citar a fonte e SEM ressalvas.` +
      ` NÃO escrevas que "o clube não confirmou" nem "não foi confirmado" — vem do próprio clube.`
    : "";

  const user = `Fonte que reportou a informação: "${input.sourceName}".

O Benfica não é só futebol: tem várias modalidades (futsal, voleibol, andebol, basquetebol,
hóquei em patins, entre outras) e outras áreas. Escreve sobre a MODALIDADE / o TEMA que os
factos indicam. NUNCA assumas que é futebol se os factos forem de outra modalidade.${officialNote}

Factos CONFIRMADOS (podes afirmar como factos):
${confirmedBlock}

Informações NÃO CONFIRMADAS reportadas pela fonte:
${doubtfulBlock}

Regras:${doubtfulRules}
- Nunca acrescentes números, datas, valores ou declarações que não estejam nas listas acima.
- Português europeu, mínimo ${MIN_WORDS} palavras.
- TÍTULO: forte e honesto, e NUNCA cita um órgão de comunicação. Proibido "segundo a
  ${input.sourceName}" ou equivalente no título. Lidera pelo tema e pelo ângulo próprio.
- ANTI-CÓPIA (obrigatório): escreve tudo por palavras tuas. NUNCA reproduzas mais de 7
  palavras seguidas iguais às da fonte. Reformula cada facto com construção frásica própria:
  muda a ordem das ideias, troca o sujeito/verbo, usa sinónimos, junta ou parte frases.
  Trata os factos como informação a reescrever, não como texto a colar.${avoidBlock}
JSON: {"title":"...","lead":"...","body":"texto com parágrafos separados por \\n\\n"}`;

  return completeJSON({ tier: "text", system: buildWriterSystem(), user, schema: llmOutputSchema });
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export const writerAgent = defineAgent({
  name: "ARTICLE_WRITER",
  inputSchema,
  outputSchema,
  async run(input) {
    if (input.confirmedFacts.length === 0 && input.doubtfulFacts.length === 0) {
      throw new Error("Writer sem factos — não pode escrever");
    }

    const mode = await resolveLlmMode();
    const confirmed: ConfirmedFact[] = input.confirmedFacts;
    const doubtful: ConfirmedFact[] = input.doubtfulFacts;

    let title: string;
    let lead: string;
    let body: string;
    let usedFactIds: string[];
    let model = "heuristico";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    if (mode === "real") {
      try {
        const r = await llmWrite(input);
        title = r.data.title;
        lead = r.data.lead;
        body = r.data.body;
        usedFactIds = [...confirmed, ...doubtful].map((f) => f.id); // recebeu confirmados + atribuídos
        model = r.model;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
      } catch {
        const composed = composeArticleHeuristic(input.candidateTitle, confirmed, doubtful, input.sourceName);
        ({ title, lead, body, usedFactIds } = composed);
      }
    } else {
      const composed = composeArticleHeuristic(input.candidateTitle, confirmed, doubtful, input.sourceName);
      ({ title, lead, body, usedFactIds } = composed);
    }

    const wordCount = countWords(body);

    const article = await prisma.article.upsert({
      where: { pipelineRunId: input.pipelineRunId },
      update: { title, lead, body, wordCount, usedFactIds, model },
      create: { pipelineRunId: input.pipelineRunId, title, lead, body, wordCount, usedFactIds, model },
    });

    // Consumido o feedback do Revisor: limpa-o para a próxima volta ser avaliada de fresco.
    if (input.correction) {
      const run = await prisma.pipelineRun.findUnique({ where: { id: input.pipelineRunId }, select: { meta: true } });
      const m = (run?.meta as Record<string, unknown> | null) ?? {};
      if ("reviserFeedback" in m) {
        const { reviserFeedback: _drop, ...rest } = m;
        void _drop;
        await prisma.pipelineRun
          .update({ where: { id: input.pipelineRunId }, data: { meta: rest as Prisma.InputJsonValue } })
          .catch(() => {});
      }
    }

    return {
      nextState: "WRITTEN" as const,
      output: { articleId: article.id, wordCount, usedFactCount: usedFactIds.length },
      audit: { model, promptVersion: PROMPT_VERSION, tokensIn, tokensOut },
    };
  },
});
