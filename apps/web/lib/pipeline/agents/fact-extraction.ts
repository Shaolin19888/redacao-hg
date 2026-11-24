import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { FactType } from "@prisma/client";
import { defineAgent } from "../contracts/agent";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { FACT_EXTRACTION_SYSTEM, PROMPT_VERSION } from "../llm/prompts";
import { extractFactsHeuristic } from "../facts/extract-heuristic";

/**
 * Fact Extraction Agent — constrói o Fact Ledger do run a partir do candidato.
 * Cria um FactLedger (1 por run) e os Fact atómicos. Não confirma nada aqui;
 * o estado dos factos é decidido pelo Fact QA. nextState → FACTS_EXTRACTED.
 */

const FACT_TYPES = ["EVENT", "TRANSFER", "INJURY", "QUOTE", "STAT", "GENERAL"] as const;

const inputSchema = z.object({
  pipelineRunId: z.string(),
  candidateId: z.string(),
  url: z.string(),
  sourceName: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  contentText: z.string().nullable(),
});
type Input = z.infer<typeof inputSchema>;

const factSchema = z.object({
  text: z.string(),
  type: z.enum(FACT_TYPES),
  // Tolerante: alguns modelos devolvem 0-10; normalizamos ao usar.
  confidence: z.number(),
  evidenceQuote: z.string(),
});
const outputSchema = z.object({
  factCount: z.number(),
  ledgerId: z.string(),
});
type Output = z.infer<typeof outputSchema>;

const llmOutputSchema = z.object({ facts: z.array(factSchema) });

async function llmExtract(input: Input) {
  const user = `Fonte: ${input.url}
Título: ${input.title}
Resumo: ${input.summary ?? "(sem resumo)"}
Texto: ${(input.contentText ?? "").slice(0, 3000)}

Extrai a lista fechada de factos atómicos que ESTÃO no texto. Para cada facto devolve
o excerto da fonte que o suporta. Não incluas nada que não esteja no texto.
JSON: {"facts":[{"text":"...","type":"EVENT|TRANSFER|INJURY|QUOTE|STAT|GENERAL","confidence":0..1,"evidenceQuote":"excerto"}]}`;

  return completeJSON({ tier: "fast", system: FACT_EXTRACTION_SYSTEM, user, schema: llmOutputSchema, temperature: 0.1 });
}

export const factExtractionAgent = defineAgent({
  name: "FACT_EXTRACTION",
  inputSchema,
  outputSchema,
  async run(input) {
    const mode = await resolveLlmMode();

    let facts: { text: string; type: FactType; confidence: number; evidenceQuote: string }[];
    let model = "heuristico";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;

    if (mode === "real") {
      try {
        const r = await llmExtract(input);
        facts = r.data.facts.map((f) => ({
          ...f,
          type: f.type as FactType,
          confidence: Math.max(0, Math.min(1, f.confidence > 1 ? f.confidence / 10 : f.confidence)),
        }));
        model = r.model;
        tokensIn = r.tokensIn;
        tokensOut = r.tokensOut;
      } catch {
        facts = extractFactsHeuristic(input.title, input.summary, input.contentText);
      }
    } else {
      facts = extractFactsHeuristic(input.title, input.summary, input.contentText);
    }

    // Criar/actualizar o ledger (1 por run) e substituir os factos.
    const ledger = await prisma.factLedger.upsert({
      where: { pipelineRunId: input.pipelineRunId },
      update: { locked: false },
      create: { pipelineRunId: input.pipelineRunId },
    });
    await prisma.fact.deleteMany({ where: { ledgerId: ledger.id } });

    if (facts.length > 0) {
      await prisma.fact.createMany({
        data: facts.map((f) => ({
          ledgerId: ledger.id,
          text: f.text,
          type: f.type,
          confidence: f.confidence,
          sourceUrl: input.url,
          sourceName: input.sourceName,
          evidenceQuote: f.evidenceQuote,
          status: "UNCONFIRMED" as const,
        })),
      });
    }

    return {
      nextState: "FACTS_EXTRACTED" as const,
      output: { factCount: facts.length, ledgerId: ledger.id },
      audit: { model, promptVersion: PROMPT_VERSION, tokensIn, tokensOut },
    };
  },
});
