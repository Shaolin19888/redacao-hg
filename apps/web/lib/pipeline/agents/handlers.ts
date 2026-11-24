import { prisma } from "@/lib/prisma";
import type { Handler } from "../queues/worker-runner";
import { duplicateDetector } from "./duplicate-detector";
import { relevanceAgent } from "./relevance";
import { factExtractionAgent } from "./fact-extraction";
import { factQaAgent } from "./fact-qa";
import { writerAgent } from "./writer";
import { editorialQaAgent } from "./editorial-qa";
import { reviserAgent } from "./reviser";
import { seoQaAgent } from "./seo-qa";
import { wpDraftAgent } from "./wp-draft";
import { telegramApprovalAgent } from "./telegram-approval";
import { publishAgent } from "./publish";
import { socialDraftAgent } from "./social-draft";
import { socialQaAgent } from "./social-qa";
import { distributeAgent } from "./distribute";
import { imageResearchAgent } from "./image-research";
import { imageQaAgent } from "./image-qa";
import { topicApprovalAgent } from "./topic-approval";
import { transcricaoAgent } from "./transcricao";
import { isOfficialBenficaSource } from "../dedup/decide";
import { editorSourceLabel } from "../intake/editor-intake";
import { extractArticleContent } from "@/lib/sources/article-extractor";

/**
 * Construtores de handler: ligam um agente à sua fila e sabem buscar o input a partir
 * do PipelineRun. Mantêm os agentes puros (recebem input já pronto).
 */

async function candidateOfRun(pipelineRunId: string) {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: pipelineRunId },
    include: { candidate: { include: { source: true } } },
  });
  if (!run?.candidate) throw new Error("Run sem candidate associado");
  return run.candidate;
}

export function buildDedupHandler(): Handler {
  return {
    agent: duplicateDetector,
    concurrency: 1, // decisões deterministas entre near-duplicados
    buildInput: async (ctx) => {
      const c = await candidateOfRun(ctx.pipelineRunId);
      return { candidateId: c.id, simhash: c.simhash, title: c.title, text: `${c.title} ${c.summary ?? ""}`, sourceUrl: c.source.url };
    },
  };
}

export function buildRelevanceHandler(): Handler {
  return {
    agent: relevanceAgent,
    buildInput: async (ctx) => {
      const c = await candidateOfRun(ctx.pipelineRunId);
      return {
        candidateId: c.id,
        title: c.title,
        summary: c.summary,
        contentText: c.contentText,
        priorityClubs: c.source.priorityClubs ?? [],
        categories: c.source.categories ?? [],
      };
    },
  };
}

export function buildExtractFactsHandler(): Handler {
  return {
    agent: factExtractionAgent,
    buildInput: async (ctx) => {
      const c = await candidateOfRun(ctx.pipelineRunId);

      // Buscar o CORPO do artigo se ainda não o temos. A recolha automática guarda só o
      // resumo da listagem, que muitas vezes não traz o essencial (ex.: quem são os
      // adversários). Sem corpo, a extracção fica esfomeada e o Writer enche com texto
      // vazio. Fazemos o fetch AQUI (só nas notícias que vão mesmo ser escritas — depois
      // do gate), não na recolha, para não gastar em tudo o que não aprovas. O corpo é
      // guardado internamente e NUNCA publicado (o Writer só vê factos).
      let contentText = c.contentText;
      if ((!contentText || contentText.trim().length < 200) && /^https?:\/\//.test(c.url)) {
        const fetched = await extractArticleContent(c.url).catch(() => null);
        if (fetched && fetched.trim().length > (contentText?.trim().length ?? 0)) {
          contentText = fetched;
          await prisma.candidate.update({ where: { id: c.id }, data: { contentText } }).catch(() => {});
        }
      }

      // Conferência transcrita: o que o treinador disse vale muito mais do que as três
      // linhas da página. A transcrição passa a ser o corpo, com o texto da página à frente
      // como enquadramento. Fica interna, como o resto — o que sai são declarações citadas.
      const t = await prisma.transcript.findUnique({
        where: { candidateId: c.id },
        select: { text: true },
      }).catch(() => null);
      if (t?.text) {
        contentText = [contentText?.trim(), t.text.trim()].filter(Boolean).join("\n\n");
      }

      return {
        pipelineRunId: ctx.pipelineRunId,
        candidateId: c.id,
        url: c.url,
        sourceName: editorSourceLabel(c),
        title: c.title,
        summary: c.summary,
        contentText,
      };
    },
  };
}

export function buildFactQaHandler(): Handler {
  return {
    agent: factQaAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildWriteHandler(): Handler {
  return {
    agent: writerAgent,
    buildInput: async (ctx) => {
      const c = await candidateOfRun(ctx.pipelineRunId);

      // Frases que uma reescrita anterior copiou da fonte (feedback anti-cópia): o Writer
      // tem de as reformular por completo nesta tentativa.
      const runMeta = await prisma.pipelineRun.findUnique({ where: { id: ctx.pipelineRunId }, select: { meta: true } });
      const meta = runMeta?.meta as Record<string, unknown> | null;
      const avoidPhrases = Array.isArray(meta?.avoidPhrases) ? (meta!.avoidPhrases as string[]) : [];

      // Feedback do Agente Revisor (ciclo de revisão): se existe, o Writer corrige SÓ o
      // apontado sobre o texto atual (§I), em vez de reescrever de raiz.
      const rf = meta?.reviserFeedback as
        | { title: string; body: string; falhas: string[]; correcoes: string[] }
        | undefined;
      const correction = rf ?? null;

      // Factos do próprio candidato (uma fonte por peça).
      const ledger = await prisma.factLedger.findUnique({
        where: { pipelineRunId: ctx.pipelineRunId },
        include: { facts: true },
      });
      const facts = ledger?.facts ?? [];
      const map = (f: { id: string; text: string; type: string }) => ({ id: f.id, text: f.text, type: f.type });
      return {
        pipelineRunId: ctx.pipelineRunId,
        candidateTitle: c.title,
        sourceName: editorSourceLabel(c),
        confirmedFacts: facts.filter((f) => f.status === "CONFIRMED").map(map),
        doubtfulFacts: facts.filter((f) => f.status === "DOUBTFUL").map(map),
        avoidPhrases,
        correction,
        official: isOfficialBenficaSource(c.source.url) || (c.origin === "editor" && isOfficialBenficaSource(c.url)),
      };
    },
  };
}

export function buildEditorialQaHandler(): Handler {
  return {
    agent: editorialQaAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildReviseHandler(): Handler {
  return {
    agent: reviserAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildSeoQaHandler(): Handler {
  return {
    agent: seoQaAgent,
    buildInput: async (ctx) => {
      // Categoria vem da decisão do Relevance Agent (output.category).
      const relevance = await prisma.agentDecision.findFirst({
        where: { pipelineRunId: ctx.pipelineRunId, agent: "RELEVANCE" },
        orderBy: { createdAt: "desc" },
      });
      const category =
        relevance?.output && typeof relevance.output === "object" && !Array.isArray(relevance.output)
          ? ((relevance.output as Record<string, unknown>).category as string | null) ?? null
          : null;
      return { pipelineRunId: ctx.pipelineRunId, category };
    },
  };
}

export function buildWpDraftHandler(): Handler {
  return {
    agent: wpDraftAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildNotifyApprovalHandler(): Handler {
  return {
    agent: telegramApprovalAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildPublishHandler(): Handler {
  return {
    agent: publishAgent,
    buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }),
  };
}

export function buildSocialDraftHandler(): Handler {
  return { agent: socialDraftAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildSocialQaHandler(): Handler {
  return { agent: socialQaAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildDistributeHandler(): Handler {
  return { agent: distributeAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildImageResearchHandler(): Handler {
  return { agent: imageResearchAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildImageQaHandler(): Handler {
  return { agent: imageQaAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildTopicApprovalHandler(): Handler {
  return { agent: topicApprovalAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }) };
}

export function buildTranscricaoHandler(): Handler {
  // Concorrência 1: cada transcrição puxa um stream e corre ffmpeg — não vale a pena
  // ter várias ao mesmo tempo a competir por rede e CPU.
  return { agent: transcricaoAgent, buildInput: (ctx) => ({ pipelineRunId: ctx.pipelineRunId }), concurrency: 1 };
}
