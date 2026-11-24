import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { resolveLlmMode } from "../llm/client";
import { runEditorialQa } from "../editorial/qa-heuristic";
import { isOfficialBenficaSource } from "../dedup/decide";

/**
 * Editorial QA Agent — verifica clareza, ausência de cópia e ausência de invenção.
 * As verificações críticas (cópia, invenção) são mecânicas e deterministas: mais
 * fiáveis do que um LLM para este fim. Cópia/invenção → TEXT_REJECTED (reescreve).
 * Guarda anti-loop: após várias rejeições, vai para FAILED (intervenção humana).
 */

const MAX_REWRITES = 1; // 1 reescrita = 2 tentativas no total (era 4 = 5 tentativas)

const inputSchema = z.object({
  pipelineRunId: z.string(),
});

const outputSchema = z.object({
  passed: z.boolean(),
  score: z.number(),
  issueCount: z.number(),
  critical: z.number(),
});

export const editorialQaAgent = defineAgent({
  name: "EDITORIAL_QA",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: {
        article: true,
        candidate: { select: { title: true, summary: true, contentText: true, origin: true, url: true } },
        ledger: { include: { facts: true } },
      },
    });
    if (!run?.article) throw new Error("Editorial QA sem artigo");

    const c = run.candidate;
    // Pedido por TEXTO do editor (origem editorial + url não-http): o texto é base autorizada,
    // não uma fonte de terceiros. Não se verifica cópia contra ele e tudo o que o editor
    // escreveu é permitido (não conta como invenção). URL do editor mantém o anti-cópia.
    const isEditorText = c?.origin === "editor" && !(c?.url ?? "").startsWith("http");

    const facts = run.ledger?.facts ?? [];
    // Números/citações permitidos: confirmados + duvidosos (usáveis com atribuição, regra 4).
    // Só os "não confirmados" (UNCONFIRMED) ficam totalmente fora e disparam invenção.
    const factTexts = facts.filter((f) => f.status === "CONFIRMED" || f.status === "DOUBTFUL").map((f) => f.text);
    const allowedTexts = isEditorText
      ? [...factTexts, c?.contentText ?? "", c?.summary ?? "", c?.title ?? ""].filter(Boolean)
      : factTexts;
    const sourceTexts = isEditorText
      ? []
      : [
          c?.title ?? "",
          c?.summary ?? "",
          c?.contentText ?? "",
          ...facts.map((f) => f.evidenceQuote ?? ""),
        ].filter(Boolean);
    const hasSensitive = facts.some((f) => f.sensitive);

    // Fonte oficial do Benfica (fonte primária, textos curtos) → anti-cópia mais tolerante,
    // para não morrer em FAILED e chegar sempre à aprovação humana.
    const official = isOfficialBenficaSource(c?.url ?? "");

    const result = runEditorialQa({
      body: run.article.body,
      wordCount: run.article.wordCount,
      confirmedFactTexts: allowedTexts,
      sourceTexts,
      hasSensitiveFacts: hasSensitive,
      official,
    });

    await prisma.qAReport.create({
      data: {
        pipelineRunId: input.pipelineRunId,
        stage: "editorial",
        agent: "EDITORIAL_QA",
        passed: result.passed,
        score: result.score,
        issues: result.issues as unknown as object[],
      },
    });

    // O gate crítico (cópia/invenção) bloqueia em modo REAL. Em modo simulado o Writer
    // heurístico não parafraseia, por isso as falhas críticas são registadas mas não
    // bloqueiam (o objectivo do simulado é testar a máquina, não gerar prosa publicável).
    const strict = (await resolveLlmMode()) === "real";

    const output = {
      passed: result.passed,
      score: result.score,
      issueCount: result.issues.length,
      critical: result.issues.filter((i) => i.severity === "critical").length,
      strict,
    };

    if (result.passed || !strict) {
      return { nextState: "EDITORIAL_QA_OK" as const, output, audit: { model: "heuristico", promptVersion: PROMPT_VERSION } };
    }

    // Modo real e falhou (cópia/invenção). Reescrever, com limite anti-loop.
    const rewrites = await prisma.agentDecision.count({
      where: { pipelineRunId: input.pipelineRunId, toState: "TEXT_REJECTED" },
    });
    const exhausted = rewrites >= MAX_REWRITES;
    const nextState = exhausted ? ("FAILED" as const) : ("TEXT_REJECTED" as const);

    // Feedback de reescrita: guarda as frases copiadas (acumuladas) para o Writer as evitar
    // de propósito na próxima tentativa, em vez de repetir o mesmo erro às cegas.
    if (!exhausted && result.copiedPhrases.length > 0) {
      const meta = (run.meta as Record<string, unknown> | null) ?? {};
      const prev = Array.isArray(meta.avoidPhrases) ? (meta.avoidPhrases as string[]) : [];
      const merged = Array.from(new Set([...prev, ...result.copiedPhrases])).slice(0, 12);
      await prisma.pipelineRun.update({
        where: { id: input.pipelineRunId },
        data: { meta: { ...meta, avoidPhrases: merged } },
      });
    }

    // Motivo legível para o painel/Telegram quando desistimos (não publicar cópia/invenção).
    const critical = result.issues.filter((i) => i.severity === "critical");
    const failureReason = exhausted
      ? `Reescrita esgotada (${MAX_REWRITES} tentativas). QA editorial manteve: ${critical.map((i) => i.detail).join("; ") || "problema crítico"}.`
      : undefined;

    return { nextState, output, failureReason, audit: { model: "heuristico", promptVersion: PROMPT_VERSION } };
  },
});
