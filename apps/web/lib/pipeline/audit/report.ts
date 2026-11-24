import type { AuditDecisionValue } from "./types";

/**
 * Geração do CSV do relatório de triagem (docs/AUDITORIA-CONTEUDO.md §"relatório de triagem").
 * Uma linha por artigo, ordenada por prioridade de corte. Puro e testável.
 */

export interface AuditReportRow {
  url: string;
  title: string;
  publishedAt: Date | null;
  clicks16m: number | null;
  impressions16m: number | null;
  indexedGuess: boolean | null;
  suggestedDecision: AuditDecisionValue;
  reason: string;
}

const DECISION_PT: Record<AuditDecisionValue, string> = {
  DELETE: "Apagar",
  MERGE: "Juntar",
  IMPROVE: "Melhorar",
  KEEP: "Manter",
};

function csvCell(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isoDay(d: Date | null): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

/** Constrói o CSV com os cabeçalhos da spec, em português. */
export function buildAuditCsv(rows: AuditReportRow[]): string {
  const header = [
    "URL",
    "Título",
    "Data",
    "Cliques 16m",
    "Impressões 16m",
    "Indexada",
    "Decisão sugerida",
    "Motivo",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.url),
        csvCell(r.title),
        csvCell(isoDay(r.publishedAt)),
        csvCell(r.clicks16m),
        csvCell(r.impressions16m),
        csvCell(r.indexedGuess === null ? "sem dados" : r.indexedGuess ? "sim" : "não"),
        csvCell(DECISION_PT[r.suggestedDecision]),
        csvCell(r.reason),
      ].join(","),
    );
  }
  return lines.join("\n");
}

export { DECISION_PT };
