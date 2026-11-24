import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { resolveLlmMode } from "../llm/client";
import { PROMPT_VERSION } from "../llm/prompts";
import { classifyFacts, type QaInputFact } from "../facts/qa-heuristic";
import { isOfficialBenficaSource } from "../dedup/decide";

/**
 * Fact QA Agent — classifica cada facto (confirmado/duvidoso/não confirmado),
 * assinala os sensíveis e TRANCA o ledger. Se não houver factos confirmados,
 * o run é arquivado (não há base para escrever). nextState → FACTS_QA_OK | ARCHIVED.
 *
 * Nota: a classificação é heurística e conservadora mesmo em modo real — o objectivo
 * é NUNCA confirmar rumores/lesões/valores a partir de uma única fonte. O LLM entra
 * na Fase 3 (Editorial QA) para verificação cruzada mais fina.
 */

const inputSchema = z.object({
  pipelineRunId: z.string(),
});

const outputSchema = z.object({
  confirmed: z.number(),
  doubtful: z.number(),
  unconfirmed: z.number(),
  sensitive: z.number(),
  locked: z.boolean(),
});

export const factQaAgent = defineAgent({
  name: "FACT_QA",
  inputSchema,
  outputSchema,
  async run(input) {
    const mode = await resolveLlmMode();

    const ledger = await prisma.factLedger.findUnique({
      where: { pipelineRunId: input.pipelineRunId },
      include: { facts: true },
    });
    if (!ledger) throw new Error("Ledger não encontrado para o run");

    // Fonte oficial do Benfica (site do clube, na recolha ou num link do editor) → tudo
    // é oficial e verificado; os factos passam a confirmados sem ressalvas.
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      select: { candidate: { select: { origin: true, url: true, source: { select: { url: true } } } } },
    });
    const c = run?.candidate;
    const officialSource =
      isOfficialBenficaSource(c?.source?.url) || (c?.origin === "editor" && isOfficialBenficaSource(c?.url));

    const qaInput: QaInputFact[] = ledger.facts.map((f) => ({
      id: f.id,
      type: f.type,
      confidence: f.confidence,
      text: f.text,
      sourceCount: 1,
      officialSource,
    }));

    const summary = classifyFacts(qaInput);

    // Aplicar as decisões aos factos e trancar o ledger.
    await prisma.$transaction([
      ...summary.decisions.map((d) =>
        prisma.fact.update({
          where: { id: d.id },
          data: { status: d.status, sensitive: d.sensitive },
        })
      ),
      prisma.factLedger.update({ where: { id: ledger.id }, data: { locked: true } }),
    ]);

    const output = {
      confirmed: summary.confirmed,
      doubtful: summary.doubtful,
      unconfirmed: summary.unconfirmed,
      sensitive: summary.sensitive,
      locked: true,
    };

    return {
      // Sem factos confirmados não há base factual para escrever → arquivar.
      nextState: summary.confirmed > 0 ? ("FACTS_QA_OK" as const) : ("ARCHIVED" as const),
      output,
      audit: { model: mode === "real" ? "heuristico-conservador" : "heuristico", promptVersion: PROMPT_VERSION },
    };
  },
});
