import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { SocialPlatform } from "@prisma/client";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { validateSocialPost, type SocialQaIssue } from "../social/qa-heuristic";
import { CHAR_LIMITS, PLATFORM_LABEL } from "../social/limits";

/**
 * Social QA Agent — valida o rascunho social contra cada plataforma de destino
 * (limite de caracteres, link, clickbait). Regista QAReport. SOCIAL_DRAFTED → SOCIAL_QA_OK.
 * Um problema crítico (excede limite) não bloqueia o fluxo mas fica assinalado para o
 * humano antes de distribuir (a distribuição continua a exigir acção humana).
 */

const inputSchema = z.object({ pipelineRunId: z.string() });
const outputSchema = z.object({
  passed: z.boolean(),
  checked: z.number(),
  issueCount: z.number(),
});

export const socialQaAgent = defineAgent({
  name: "SOCIAL_QA",
  inputSchema,
  outputSchema,
  async run(input) {
    const post = await prisma.socialPost.findFirst({
      where: { pipelineRunId: input.pipelineRunId, status: "DRAFT" },
      include: { targets: { include: { account: true } } },
      orderBy: { createdAt: "desc" },
    });
    if (!post) throw new Error("Social QA sem rascunho social");

    const platforms: SocialPlatform[] = post.targets.length > 0
      ? Array.from(new Set(post.targets.map((t) => t.account.platform)))
      : ["X"];

    const allIssues: SocialQaIssue[] = [];
    for (const platform of platforms) {
      const r = validateSocialPost({
        text: post.text,
        hasLink: !!post.linkUrl,
        charLimit: CHAR_LIMITS[platform],
        platformLabel: PLATFORM_LABEL[platform],
      });
      allIssues.push(...r.issues);
    }

    const passed = !allIssues.some((i) => i.severity === "critical");

    await prisma.qAReport.create({
      data: {
        pipelineRunId: input.pipelineRunId,
        stage: "social",
        agent: "SOCIAL_QA",
        passed,
        issues: allIssues as unknown as object[],
      },
    });

    return {
      nextState: "SOCIAL_QA_OK" as const,
      output: { passed, checked: platforms.length, issueCount: allIssues.length },
      audit: { model: "heuristico", promptVersion: PROMPT_VERSION },
    };
  },
});
