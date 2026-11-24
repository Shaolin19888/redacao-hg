import type { PrismaClient } from "@prisma/client";
import { listPublishedPosts } from "@/lib/wordpress/posts";
import { scoreArticle, detectCannibalization } from "./score-data";
import { parseGscPagesCsv, normalizeUrl, type PageTraffic } from "./gsc-csv";
import { auditArticleWithAI } from "./auditor";
import type { AuditArticleInput, AuditDecisionValue } from "./types";

/**
 * Corre um lote de auditoria de conteúdo (docs/AUDITORIA-CONTEUDO.md). Só LÊ do WordPress e
 * propõe decisões; NADA é apagado aqui (a execução é um passo humano posterior). Persiste um
 * AuditRun com um AuditItem por artigo. Regista progresso e custo de IA no Log.
 */

export interface AuditOptions {
  limit: number; // lote de teste = 100
  offset?: number;
  order?: "asc" | "desc"; // "asc" = mais antigos primeiro (onde vive o peso morto)
  gscCsv?: string; // CSV do relatório "Páginas" do Search Console (opcional)
  gscCsvs?: string[]; // vários CSVs (ex.: Pesquisa + Discover), somados por URL
  useAI?: boolean; // camada 2 (default: true; só corre se o modo LLM for real)
}

/** Soma o tráfego de vários relatórios "Páginas" (Pesquisa, Discover) por URL normalizado. */
function mergeTraffic(csvs: string[]): Map<string, PageTraffic> {
  const merged = new Map<string, PageTraffic>();
  for (const csv of csvs) {
    if (!csv || !csv.trim()) continue;
    for (const [url, t] of parseGscPagesCsv(csv)) {
      const cur = merged.get(url) ?? { clicks: 0, impressions: 0 };
      merged.set(url, { clicks: cur.clicks + t.clicks, impressions: cur.impressions + t.impressions });
    }
  }
  return merged;
}

const DECISION_WEIGHT: Record<AuditDecisionValue, number> = { DELETE: 100, MERGE: 40, IMPROVE: 20, KEEP: 0 };

export async function runContentAudit(
  prisma: PrismaClient,
  opts: AuditOptions,
): Promise<{ auditRunId: string; totals: Record<string, number> }> {
  const now = new Date();
  const order = opts.order ?? "asc";
  const useAI = opts.useAI ?? true;

  // Tráfego do GSC (se houver CSV). Vários relatórios (Pesquisa + Discover) somam-se por URL.
  let traffic: Map<string, PageTraffic> | null = null;
  const csvs = [...(opts.gscCsvs ?? []), ...(opts.gscCsv ? [opts.gscCsv] : [])].filter((c) => c && c.trim());
  if (csvs.length > 0) {
    traffic = mergeTraffic(csvs);
  }

  const run = await prisma.auditRun.create({
    data: { status: "running", batchSize: opts.limit, offset: opts.offset ?? 0 },
  });
  await prisma.log.create({
    data: { action: "audit_start", details: `Auditoria ${run.id}: lote ${opts.limit}, offset ${opts.offset ?? 0}, tráfego ${traffic ? `${traffic.size} URLs` : "sem CSV"}.` },
  });

  try {
    const posts = await listPublishedPosts({ limit: opts.limit, offset: opts.offset, order });

    // Monta os inputs, juntando o tráfego por URL normalizado.
    const inputs: (AuditArticleInput & { contentText: string })[] = posts.map((p) => {
      // Com CSV: URL ausente do export (que só traz o top ~1000) = tráfego zero, não "sem dados".
      // Sem CSV nenhum: null = desconhecido (triagem conservadora, nunca apaga só por isso).
      const t = traffic ? (traffic.get(normalizeUrl(p.link)) ?? { clicks: 0, impressions: 0 }) : null;
      return {
        wpPostId: p.id,
        url: p.link,
        title: p.title,
        publishedAt: p.date ? new Date(p.date) : null,
        clicks: t ? t.clicks : null,
        impressions: t ? t.impressions : null,
        contentChars: p.contentChars,
        contentText: p.contentText,
      };
    });

    // Camada 1: pontuação por dados.
    const scored = inputs.map((inp) => ({ inp, s: scoreArticle(inp, now) }));

    // Canibalização: grupos de títulos quase iguais.
    const groups = detectCannibalization(inputs.map((i) => ({ wpPostId: i.wpPostId, title: i.title })));
    // Primário de cada grupo = mais cliques, depois conteúdo mais longo.
    const byGroup = new Map<string, typeof scored>();
    for (const row of scored) {
      const g = groups.get(row.inp.wpPostId);
      if (!g) continue;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(row);
    }
    const primaryOfGroup = new Map<string, number>();
    for (const [g, rows] of byGroup) {
      const best = [...rows].sort(
        (a, b) => (b.inp.clicks ?? 0) - (a.inp.clicks ?? 0) || b.inp.contentChars - a.inp.contentChars,
      )[0];
      primaryOfGroup.set(g, best.inp.wpPostId);
    }

    let aiUsed = 0;
    let aiCostEur = 0;

    const itemsData = [];
    for (const { inp, s } of scored) {
      let decision: AuditDecisionValue = s.suggestedDecision;
      let reason = s.reason;
      let layer: "data" | "ai" = "data";
      let aiModel: string | null = null;
      let itemAiCost: number | null = null;
      const cannibalGroup = groups.get(inp.wpPostId) ?? null;

      // Canibalização: membros não-primários sem tráfego real → MERGE.
      if (cannibalGroup && primaryOfGroup.get(cannibalGroup) !== inp.wpPostId && !(inp.clicks && inp.clicks > 0)) {
        decision = "MERGE";
        reason = "Vários artigos sobre o mesmo tema, consolidar no melhor e redirecionar.";
      } else if (s.needsAI && useAI) {
        // Camada 2: IA só na zona cinzenta (e não resolvido por canibalização).
        const ai = await auditArticleWithAI({ title: inp.title, contentText: inp.contentText });
        if (ai) {
          decision = ai.decision;
          reason = ai.reason;
          layer = "ai";
          aiModel = ai.model;
          itemAiCost = ai.costEur;
          aiUsed++;
          aiCostEur += ai.costEur;
        }
      }

      const score = s.score + DECISION_WEIGHT[decision];

      itemsData.push({
        auditRunId: run.id,
        wpPostId: inp.wpPostId,
        url: inp.url,
        title: inp.title,
        publishedAt: inp.publishedAt,
        clicks16m: inp.clicks,
        impressions16m: inp.impressions,
        indexedGuess: s.indexedGuess,
        ageMonths: s.ageMonths,
        contentChars: inp.contentChars,
        score,
        layer,
        suggestedDecision: decision,
        reason,
        cannibalGroup,
        aiModel,
        aiCostEur: itemAiCost,
      });
    }

    if (itemsData.length > 0) {
      await prisma.auditItem.createMany({ data: itemsData });
    }

    // Totais.
    const totals: Record<string, number> = { DELETE: 0, MERGE: 0, IMPROVE: 0, KEEP: 0 };
    let withTraffic = 0;
    for (const it of itemsData) {
      totals[it.suggestedDecision]++;
      if (it.impressions16m !== null) withTraffic++;
    }
    const total = itemsData.length;
    const deadPct = total > 0 ? Math.round((totals.DELETE / total) * 100) : 0;
    const totalsFull = { ...totals, total, deadPct, aiUsed, aiCostEur: Number(aiCostEur.toFixed(4)), withTraffic };

    await prisma.auditRun.update({
      where: { id: run.id },
      data: { status: "done", totals: totalsFull },
    });
    await prisma.log.create({
      data: {
        action: "audit_done",
        details: `Auditoria ${run.id}: ${total} artigos — apagar ${totals.DELETE}, juntar ${totals.MERGE}, melhorar ${totals.IMPROVE}, manter ${totals.KEEP}. Peso morto ${deadPct}%. IA usada em ${aiUsed}, custo ${aiCostEur.toFixed(4)}€.`,
      },
    });

    return { auditRunId: run.id, totals: totalsFull };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.auditRun.update({ where: { id: run.id }, data: { status: "error", notes: msg } }).catch(() => {});
    await prisma.log.create({ data: { action: "audit_error", details: `Auditoria ${run.id}: ${msg}` } }).catch(() => {});
    throw err;
  }
}
