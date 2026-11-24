import type { PrismaClient } from "@prisma/client";
import { costEur, hasPrice, loadPriceTable } from "./pricing";
import type { WeekRange } from "./week";
import { etapaLabel } from "../costs";

/**
 * Constrói e formata o relatório semanal. As consultas seguem o mapa exacto da spec
 * (docs/RELATORIO-SEMANAL.md §"De onde vêm os números"). A formatação é pura e testável.
 */

export interface ModelCost {
  model: string;
  tokensIn: number;
  tokensOut: number;
  eur: number;
  priced: boolean;
}

export interface StageCost {
  label: string;
  calls: number;
  eur: number;
}

export interface WeeklyReportData {
  label: string;
  approved: number;
  rejected: number;
  partial: number; // decisões parciais (reciclagem), fora da taxa
  decided: number; // aprovadas + recusadas
  approvalRate: number | null; // fracção 0..1, ou null se não houve decisões
  published: number;
  costByModel: ModelCost[]; // só modelos com tokens, ordenados por custo desc
  costByStage: StageCost[]; // o mesmo dinheiro visto por etapa do pipeline
  totalCostEur: number;
  avgCostPerApprovedEur: number | null;
  unpricedModels: string[]; // modelos com tokens mas sem preço na tabela
  avgRevisionRounds: number | null;
}

export async function buildWeeklyReport(prisma: PrismaClient, range: WeekRange): Promise<WeeklyReportData> {
  const { start, end } = range;
  const inWeek = { gte: start, lte: end };

  // 1. Aprovadas / recusadas / parciais — ApprovalRequest.decision por decidedAt.
  const decisions = await prisma.approvalRequest.groupBy({
    by: ["decision"],
    where: { decidedAt: inWeek, decision: { not: null } },
    _count: { _all: true },
  });
  const countOf = (d: string) => decisions.find((x) => x.decision === d)?._count._all ?? 0;
  const approved = countOf("APPROVE_ALL");
  const rejected = countOf("REJECT_ALL") + countOf("CANCEL");
  const partial = countOf("APPROVE_TEXT_REJECT_IMAGE") + countOf("REJECT_TEXT_APPROVE_IMAGE");
  const decided = approved + rejected;
  const approvalRate = decided > 0 ? approved / decided : null;

  // 2. Publicadas — AgentDecision toState=PUBLISHED na semana (runs distintos).
  const pub = await prisma.agentDecision.findMany({
    where: { toState: "PUBLISHED", createdAt: inWeek },
    select: { pipelineRunId: true },
    distinct: ["pipelineRunId"],
  });
  const published = pub.length;

  // 3. Custo — soma de tokens por modelo × tabela de preços.
  const table = loadPriceTable();
  const grouped = await prisma.agentDecision.groupBy({
    by: ["model"],
    where: { createdAt: inWeek, model: { not: null } },
    _sum: { tokensIn: true, tokensOut: true },
  });
  const costByModel: ModelCost[] = [];
  const unpricedModels: string[] = [];
  for (const g of grouped) {
    const model = g.model as string;
    const tokensIn = g._sum.tokensIn ?? 0;
    const tokensOut = g._sum.tokensOut ?? 0;
    if (tokensIn === 0 && tokensOut === 0) continue; // heurístico/telegram/etc. não têm tokens
    const priced = hasPrice(model, table);
    if (!priced) unpricedModels.push(model);
    costByModel.push({ model, tokensIn, tokensOut, eur: costEur(model, tokensIn, tokensOut, { table }), priced });
  }
  costByModel.sort((a, b) => b.eur - a.eur);
  const totalCostEur = costByModel.reduce((acc, m) => acc + m.eur, 0);

  // 3-B. O mesmo dinheiro, mas por ETAPA do pipeline (triagem, escrita, revisão…).
  // É esta vista que diz onde vale a pena mexer: o modelo diz "quanto", a etapa diz "porquê".
  const porEtapa = await prisma.agentDecision.groupBy({
    by: ["agent", "model"],
    where: { createdAt: inWeek, model: { not: null } },
    _sum: { tokensIn: true, tokensOut: true },
    _count: { _all: true },
  });
  const stageMap = new Map<string, StageCost>();
  for (const g of porEtapa) {
    const tIn = g._sum.tokensIn ?? 0;
    const tOut = g._sum.tokensOut ?? 0;
    if (tIn === 0 && tOut === 0) continue;
    const label = etapaLabel(g.agent);
    const atual = stageMap.get(label) ?? { label, calls: 0, eur: 0 };
    atual.calls += g._count._all;
    atual.eur += costEur(g.model as string, tIn, tOut, { table });
    stageMap.set(label, atual);
  }
  const costByStage = [...stageMap.values()].sort((a, b) => b.eur - a.eur);

  const avgCostPerApprovedEur = approved > 0 ? totalCostEur / approved : null;

  // 4. Voltas do ciclo de revisão — média de decisões REVISER por run com revisão.
  const rev = await prisma.agentDecision.groupBy({
    by: ["pipelineRunId"],
    where: { agent: "REVISER", createdAt: inWeek },
    _count: { _all: true },
  });
  const avgRevisionRounds = rev.length
    ? rev.reduce((acc, r) => acc + r._count._all, 0) / rev.length
    : null;

  return {
    label: range.label,
    approved,
    rejected,
    partial,
    decided,
    approvalRate,
    published,
    costByModel,
    costByStage,
    totalCostEur,
    avgCostPerApprovedEur,
    unpricedModels,
    avgRevisionRounds,
  };
}

// --- Formatação (pura) ---

/** Euros com vírgula decimal e duas casas, ex.: 6.4 → "6,40". */
export function eur(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/** Número com uma casa decimal e vírgula, ex.: 1.4 → "1,4". */
function oneDecimal(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

/** Percentagem inteira, ex.: 0.732 → "73%". */
function pct(frac: number): string {
  return `${Math.round(frac * 100)}%`;
}

/** Formata o relatório em HTML para o Telegram (parse_mode HTML), em português europeu. */
export function formatReport(data: WeeklyReportData): string {
  const lines: string[] = [];
  lines.push(`<b>Relatório semanal da Redação HG</b>`);
  lines.push(`Semana de ${data.label}`);
  lines.push("");
  lines.push(`Notícias decididas: ${data.decided}`);
  lines.push(`Aprovadas: ${data.approved}`);
  lines.push(`Recusadas: ${data.rejected}`);
  lines.push(`Taxa de aprovação: ${data.approvalRate === null ? "sem decisões" : pct(data.approvalRate)}`);
  lines.push(`Publicadas no site: ${data.published}`);
  lines.push("");
  lines.push(`Custo da semana: ${eur(data.totalCostEur)} euros`);
  lines.push(
    `Custo médio por notícia aprovada: ${data.avgCostPerApprovedEur === null ? "sem aprovadas" : `${eur(data.avgCostPerApprovedEur)} euros`}`,
  );

  if (data.costByStage.length > 0) {
    lines.push("");
    lines.push(`Por etapa:`);
    for (const s of data.costByStage) {
      lines.push(`- ${s.label}: ${eur(s.eur)} euros (${s.calls} chamadas)`);
    }
  }

  if (data.costByModel.length > 0) {
    lines.push("");
    lines.push(`Por modelo:`);
    for (const m of data.costByModel) {
      lines.push(`- ${m.model}: ${eur(m.eur)} euros${m.priced ? "" : " (sem preço na tabela)"}`);
    }
  } else {
    lines.push(`Por modelo: sem custos registados`);
  }

  if (data.unpricedModels.length > 0) {
    lines.push("");
    lines.push(`⚠️ Modelos sem preço na tabela (custo em falta): ${data.unpricedModels.join(", ")}. Acrescenta-os a model-prices.json.`);
  }

  if (data.avgRevisionRounds !== null) {
    lines.push("");
    lines.push(`Qualidade: ${oneDecimal(data.avgRevisionRounds)} voltas de revisão em média por peça`);
  }

  return lines.join("\n");
}
