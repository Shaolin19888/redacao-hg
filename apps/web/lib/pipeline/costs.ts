import type { PrismaClient } from "@prisma/client";
import { costEur } from "./report/pricing";

/**
 * Custo de API por notícia. Os tokens de cada passo já ficam registados em AgentDecision
 * (model, tokensIn, tokensOut); aqui converte-se em euros com a tabela de preços do
 * relatório semanal (lib/pipeline/report/model-prices.json), que é editável sem tocar no código.
 */

/** Custo REAL já gasto numa notícia, somando todos os passos com tokens. */
export async function runCostEur(prisma: PrismaClient, pipelineRunId: string): Promise<number> {
  const passos = await prisma.agentDecision.findMany({
    where: { pipelineRunId, model: { not: null } },
    select: { model: true, tokensIn: true, tokensOut: true },
  });
  let total = 0;
  for (const p of passos) {
    total += costEur(p.model as string, p.tokensIn ?? 0, p.tokensOut ?? 0);
  }
  return total;
}

/** Nome legível de cada etapa do pipeline, para não mostrar siglas internas ao editor. */
export const ETAPA_LABEL: Record<string, string> = {
  RELEVANCE: "Triagem",
  FACT_EXTRACTION: "Factos",
  FACT_QA: "Verificação de factos",
  ARTICLE_WRITER: "Escrita",
  REVISER: "Revisão",
  EDITORIAL_QA: "QA editorial",
  SEO_QA: "SEO",
  SEO: "SEO",
  IMAGE_RESEARCH: "Imagem",
  SOCIAL_PUBLISHER: "Redes sociais",
  SOCIAL_DRAFT: "Redes sociais",
};

export function etapaLabel(agent: string): string {
  return ETAPA_LABEL[agent] ?? agent.toLowerCase().replace(/_/g, " ");
}

export interface CostStep {
  agent: string;
  label: string;
  models: string[];
  calls: number;
  tokensIn: number;
  tokensOut: number;
  eur: number;
}

/**
 * Custo REAL desta notícia, discriminado por etapa (triagem, factos, escrita, revisão…).
 * Uma etapa que corra várias vezes (reescritas, voltas de revisão) aparece somada, com o
 * número de chamadas, que é justamente onde o dinheiro costuma fugir.
 */
export async function runCostBreakdown(
  prisma: PrismaClient,
  pipelineRunId: string,
): Promise<{ steps: CostStep[]; total: number }> {
  const passos = await prisma.agentDecision.findMany({
    where: { pipelineRunId, model: { not: null } },
    select: { agent: true, model: true, tokensIn: true, tokensOut: true },
  });

  const porEtapa = new Map<string, CostStep>();
  for (const p of passos) {
    const tIn = p.tokensIn ?? 0;
    const tOut = p.tokensOut ?? 0;
    if (tIn === 0 && tOut === 0) continue; // passos heurísticos não gastam nada
    const model = p.model as string;
    const atual = porEtapa.get(p.agent) ?? {
      agent: p.agent,
      label: etapaLabel(p.agent),
      models: [],
      calls: 0,
      tokensIn: 0,
      tokensOut: 0,
      eur: 0,
    };
    atual.calls += 1;
    atual.tokensIn += tIn;
    atual.tokensOut += tOut;
    atual.eur += costEur(model, tIn, tOut);
    if (!atual.models.includes(model)) atual.models.push(model);
    porEtapa.set(p.agent, atual);
  }

  const steps = [...porEtapa.values()].sort((a, b) => b.eur - a.eur);
  return { steps, total: steps.reduce((s, e) => s + e.eur, 0) };
}

/**
 * Estimativa do que vai custar escrever uma notícia, a partir da MÉDIA REAL das últimas peças
 * que chegaram a ser escritas. Melhor do que um número inventado: acompanha sozinha as
 * mudanças de modelo, de prompt e do ciclo de revisão.
 * Devolve null quando ainda não há histórico suficiente.
 */
export async function estimateArticleCostEur(prisma: PrismaClient, amostra = 12): Promise<number | null> {
  const escritos = await prisma.article.findMany({
    select: { pipelineRunId: true },
    orderBy: { createdAt: "desc" },
    take: amostra,
  });
  if (escritos.length < 3) return null;

  const custos: number[] = [];
  for (const a of escritos) {
    const c = await runCostEur(prisma, a.pipelineRunId);
    if (c > 0) custos.push(c);
  }
  if (custos.length === 0) return null;
  return custos.reduce((s, c) => s + c, 0) / custos.length;
}

/**
 * Estimativa discriminada por etapa, também a partir da média real das últimas peças.
 * Serve o cartão de pré-escrita: antes de mandar escrever vê-se para onde vai o dinheiro.
 * A média é por peça (soma da etapa a dividir pelas peças da amostra), por isso as etapas
 * somam a estimativa total.
 */
export async function estimateArticleCostBreakdown(
  prisma: PrismaClient,
  amostra = 12,
): Promise<{ steps: { label: string; eur: number }[]; total: number } | null> {
  const escritos = await prisma.article.findMany({
    select: { pipelineRunId: true },
    orderBy: { createdAt: "desc" },
    take: amostra,
  });
  if (escritos.length < 3) return null;

  const soma = new Map<string, number>();
  let comCusto = 0;
  for (const a of escritos) {
    const { steps, total } = await runCostBreakdown(prisma, a.pipelineRunId);
    if (total <= 0) continue;
    comCusto += 1;
    for (const s of steps) soma.set(s.label, (soma.get(s.label) ?? 0) + s.eur);
  }
  if (comCusto === 0) return null;

  const steps = [...soma.entries()]
    .map(([label, eur]) => ({ label, eur: eur / comCusto }))
    .sort((a, b) => b.eur - a.eur);
  return { steps, total: steps.reduce((s, e) => s + e.eur, 0) };
}

/** Euros com vírgula e 3 casas (os valores por notícia são pequenos). */
export function formatEur(n: number): string {
  return n.toFixed(3).replace(".", ",");
}
