import { tokenize } from "../dedup/simhash";
import type { AuditArticleInput, DataScore, AuditDecisionValue } from "./types";

/**
 * Camada 1 da auditoria: triagem por DADOS, barata e sem IA (docs/AUDITORIA-CONTEUDO.md §"duas camadas").
 * Sinal principal: tráfego (zero impressões em 16 meses = página morta). Complementos: idade e
 * espessura do conteúdo. Conservador: SEM dados de tráfego nunca marca apagar só por isso.
 */

// Antigo o suficiente para que 16 meses de zero tráfego seja significativo (janela GSC = 16 meses).
const OLD_MONTHS = 16;
// Conteúdo curto ("resumo fininho sem ângulo").
const THIN_CHARS = 900;

function monthsBetween(from: Date | null, now: Date): number | null {
  if (!from) return null;
  const ms = now.getTime() - from.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Pontua um artigo pela camada de dados. Devolve a decisão sugerida, o motivo numa linha,
 * a prioridade de corte e se precisa da camada de IA (zona cinzenta).
 */
export function scoreArticle(input: AuditArticleInput, now: Date): DataScore {
  const ageMonths = monthsBetween(input.publishedAt, now);
  const old = ageMonths !== null && ageMonths >= OLD_MONTHS;
  const thin = input.contentChars < THIN_CHARS;
  const hasTraffic = input.impressions !== null;
  // Sinal de escala: zero impressões comporta-se como não indexada (spec §"Nota honesta").
  const indexedGuess: boolean | null = hasTraffic ? input.impressions! > 0 : null;

  let score = 0;
  let decision: AuditDecisionValue = "KEEP";
  let reason = "";
  let needsAI = false;

  if (hasTraffic) {
    const clicks = input.clicks ?? 0;
    const impressions = input.impressions ?? 0;

    if (clicks > 0) {
      // Tem tráfego real → manter, não mexer.
      decision = "KEEP";
      reason = `Tem tráfego real (${clicks} cliques, ${impressions} impressões em 16 meses).`;
      score = -clicks; // quanto mais cliques, mais longe do corte
    } else if (impressions === 0 && old) {
      // Zero impressões há 16 meses e antigo → peso morto, sem gastar IA.
      decision = "DELETE";
      reason = "Zero impressões em 16 meses e artigo antigo, comporta-se como não indexado.";
      score = 60 + Math.min(ageMonths ?? 0, 60) + (thin ? 10 : 0);
    } else if (impressions === 0 && !old) {
      // Sem impressões mas recente → cedo demais para julgar.
      decision = "KEEP";
      reason = "Recente e ainda sem histórico de tráfego, aguardar.";
      score = 5;
    } else {
      // Impressões sem cliques → há alguma procura mas a peça não converte. Zona cinzenta: a IA decide.
      decision = "IMPROVE";
      reason = `Tem ${impressions} impressões mas zero cliques em 16 meses, a rever pela doutrina.`;
      needsAI = true;
      score = 30 + (thin ? 10 : 0) + (old ? 5 : 0);
    }
  } else {
    // Sem dados de tráfego: nunca cortar só por isso. Conteúdo curto e antigo vai à IA.
    if (thin && old) {
      decision = "IMPROVE";
      reason = "Sem dados de tráfego; conteúdo curto e antigo, a rever pela doutrina.";
      needsAI = true;
      score = 20;
    } else {
      decision = "KEEP";
      reason = "Sem dados de tráfego e sem sinais fortes para cortar.";
      score = 0;
    }
  }

  return { suggestedDecision: decision, reason, score, needsAI, indexedGuess, ageMonths };
}

// Semelhança de títulos (Jaccard sobre tokens significativos) a partir da qual se considera
// o mesmo tema. Em títulos curtos, a sobreposição de tokens é muito mais fiável do que o
// SimHash (feito para documentos longos).
const CANNIBAL_JACCARD = 0.5;
const MIN_TOKEN_LEN = 4; // ignora "por", "de", "no"… que dão falsos positivos

function significantTokens(title: string): Set<string> {
  return new Set(tokenize(title).filter((t) => t.length >= MIN_TOKEN_LEN));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Deteta canibalização: grupos de artigos com títulos que tratam o mesmo tema/lance a
 * competir entre si. Une por semelhança de tokens (transitiva). Devolve um mapa
 * wpPostId → chave de grupo, só para grupos com 2+ membros.
 */
export function detectCannibalization(
  items: { wpPostId: number; title: string }[],
): Map<number, string> {
  const toks = items.map((it) => ({ id: it.wpPostId, set: significantTokens(it.title) }));
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const t of toks) parent.set(t.id, t.id);

  for (let i = 0; i < toks.length; i++) {
    for (let j = i + 1; j < toks.length; j++) {
      if (jaccard(toks[i].set, toks[j].set) >= CANNIBAL_JACCARD) {
        parent.set(find(toks[i].id), find(toks[j].id)); // une os grupos (union-find)
      }
    }
  }

  const counts = new Map<number, number>();
  for (const t of toks) counts.set(find(t.id), (counts.get(find(t.id)) ?? 0) + 1);
  const result = new Map<number, string>();
  for (const t of toks) {
    const rep = find(t.id);
    if ((counts.get(rep) ?? 0) >= 2) result.set(t.id, `canibal-${rep}`);
  }
  return result;
}
