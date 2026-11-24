/**
 * Import do CSV do relatório "Páginas" do Google Search Console (docs/AUDITORIA-CONTEUDO.md).
 * Enquanto a API Search Analytics não estiver ligada, o tráfego por URL vem daqui: cliques e
 * impressões dos últimos 16 meses (o período escolhido na exportação). Puro e testável.
 *
 * O Google exporta com cabeçalhos em PT ("Página principal", "Cliques", "Impressões") ou EN
 * ("Top pages", "Clicks", "Impressions"). Detectamos as colunas por nome, com tolerância.
 */

export interface PageTraffic {
  clicks: number;
  impressions: number;
}

/** Parser CSV mínimo (RFC4180: aspas, vírgulas e quebras dentro de aspas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, ""); // remove BOM
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); field = "";
      rows.push(row); row = [];
    } else if (c === "\r") {
      // ignora; o \n trata a quebra
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Normaliza um URL para comparação: sem protocolo/host-case, sem barra final, sem query/fragmento. */
export function normalizeUrl(url: string): string {
  let u = url.trim();
  try {
    const parsed = new URL(u);
    u = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}`;
  } catch {
    // não é URL absoluto: usa como está
  }
  u = u.replace(/\/+$/, ""); // sem barra final
  return u.toLowerCase();
}

/** Converte "1.234", "1 234", "1,234" ou "12" num inteiro. */
function toInt(raw: string): number {
  const digits = (raw ?? "").replace(/[^\d]/g, "");
  return digits ? parseInt(digits, 10) : 0;
}

function findColumn(header: string[], candidates: string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (const cand of candidates) {
    const idx = norm.findIndex((h) => h === cand);
    if (idx >= 0) return idx;
  }
  for (const cand of candidates) {
    const idx = norm.findIndex((h) => h.includes(cand));
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Interpreta o CSV do relatório "Páginas". Devolve um mapa URL normalizado → {cliques, impressões}.
 * Lança erro se não encontrar as colunas essenciais (URL + impressões).
 */
export function parseGscPagesCsv(text: string): Map<string, PageTraffic> {
  const rows = parseCsv(text);
  if (rows.length < 2) return new Map();
  const header = rows[0];

  const urlCol = findColumn(header, ["página principal", "páginas", "top pages", "page", "página", "url"]);
  const clicksCol = findColumn(header, ["cliques", "clicks"]);
  const imprCol = findColumn(header, ["impressões", "impressoes", "impressions"]);

  if (urlCol < 0 || imprCol < 0) {
    throw new Error(
      `CSV do Search Console não reconhecido. Cabeçalho: ${header.join(", ")}. Exporta o relatório "Páginas".`,
    );
  }

  const map = new Map<string, PageTraffic>();
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const rawUrl = r[urlCol];
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl.trim())) continue;
    const key = normalizeUrl(rawUrl);
    map.set(key, {
      clicks: clicksCol >= 0 ? toInt(r[clicksCol]) : 0,
      impressions: toInt(r[imprCol]),
    });
  }
  return map;
}
