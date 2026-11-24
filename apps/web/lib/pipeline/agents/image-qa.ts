import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { validateImage } from "../image/qa-heuristic";

/**
 * Image QA Agent — valida a imagem (dimensões, formato, peso, alt, licença, não
 * sintética). Falha crítica → IMAGE_REJECTED (volta à pesquisa, com guarda anti-loop).
 * Caso contrário → IMAGE_QA_OK. Regista QAReport (stage=image).
 */

const MAX_RESEARCH = 2;

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({
  passed: z.boolean(),
  issueCount: z.number(),
  critical: z.number(),
});

export const imageQaAgent = defineAgent({
  name: "IMAGE_QA",
  inputSchema,
  outputSchema,
  async run(input) {
    const image = await prisma.imageAsset.findUnique({ where: { pipelineRunId: input.pipelineRunId } });
    if (!image) throw new Error("Image QA sem imagem");

    const result = validateImage({
      url: image.url,
      alt: image.alt,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      format: image.format,
      license: image.license,
      isSynthetic: image.isSynthetic,
    });

    await prisma.imageAsset.update({
      where: { pipelineRunId: input.pipelineRunId },
      data: { qaStatus: result.passed ? "ok" : "rejected" },
    });

    await prisma.qAReport.create({
      data: {
        pipelineRunId: input.pipelineRunId,
        stage: "image",
        agent: "IMAGE_QA",
        passed: result.passed,
        issues: result.issues as unknown as object[],
      },
    });

    const output = {
      passed: result.passed,
      issueCount: result.issues.length,
      critical: result.issues.filter((i) => i.severity === "critical").length,
    };

    if (result.passed) {
      return { nextState: "IMAGE_QA_OK" as const, output, audit: { model: "heuristico", promptVersion: PROMPT_VERSION } };
    }

    // Falha crítica: nova pesquisa, com limite anti-loop.
    const tries = await prisma.agentDecision.count({
      where: { pipelineRunId: input.pipelineRunId, toState: "IMAGE_REJECTED" },
    });
    const nextState = tries >= MAX_RESEARCH ? ("FAILED" as const) : ("IMAGE_REJECTED" as const);
    return { nextState, output, audit: { model: "heuristico", promptVersion: PROMPT_VERSION } };
  },
});
