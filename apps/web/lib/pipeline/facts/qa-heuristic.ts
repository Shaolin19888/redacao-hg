import type { FactType, FactStatus } from "@prisma/client";

/**
 * Classificação heurística e conservadora de factos (Fact QA sem LLM). Pura e testável.
 * Regra editorial: na dúvida, não confirmar. Rumores de mercado, lesões e declarações
 * não são auto-confirmados a partir de uma única fonte.
 *
 * Distinção-chave (afinação 2026-07): um ANÚNCIO OFICIAL do clube (oficializou, anunciou,
 * confirmou, renovou, apresentou) é um FACTO confirmado, não um rumor. Só o INTERESSE /
 * ESPECULAÇÃO (prepara proposta, atento, segundo a imprensa) fica duvidoso e atribuído.
 */

export interface QaInputFact {
  id: string;
  type: FactType;
  confidence: number;
  text: string; // usado para distinguir anúncio oficial de rumor
  sourceCount?: number; // nº de fontes que suportam (1 por defeito)
  officialSource?: boolean; // veio do site OFICIAL do Benfica → oficial e verificado
}

export interface QaFactDecision {
  id: string;
  status: FactStatus;
  sensitive: boolean;
}

const SENSITIVE_TYPES: FactType[] = ["INJURY", "TRANSFER", "QUOTE"];

// Marcas de anúncio oficial (o próprio clube/entidade confirma).
const OFFICIAL_RE =
  /\b(oficializ\w*|anunci\w*|confirm\w*|apresent\w*|renov\w*|prolong\w*|assin\w+ (?:contrato|v[íi]nculo|renova)|fech\w+ a contrata|[ée] refor[çc]o|[ée] (?:oficialmente )?jogador d|passa a ser jogador|acordo fechado|revelou)\b/i;

// Marcas de rumor / especulação (não confirmado pelo clube).
const RUMOUR_RE =
  /\b(segundo|de acordo com|imprensa|jornal|ter[áa]|poder[áa]|estar[áa]|dever[áa]|alegad\w*|atento|interessad\w*|prepara (?:uma )?proposta|sond\w*|negoc\w*|na mira|no radar|alvo|aposta em|em conversa|estuda|equaciona|ambiciona|quer contratar|segue de perto|de olho)\b/i;

/** Um facto é um anúncio oficial se tem marca oficial e nenhuma marca de rumor. */
export function isOfficialAnnouncement(text: string): boolean {
  return OFFICIAL_RE.test(text) && !RUMOUR_RE.test(text);
}

export function classifyFact(fact: QaInputFact): QaFactDecision {
  const sources = fact.sourceCount ?? 1;
  const isSensitiveType = SENSITIVE_TYPES.includes(fact.type);
  // Vindo do site oficial do Benfica é tudo oficial e verificado; ou marca de anúncio oficial.
  const official = fact.officialSource === true || isOfficialAnnouncement(fact.text);

  let status: FactStatus;
  let sensitive = isSensitiveType;

  if (official) {
    // Anúncio oficial → facto confirmado. Deixa de ser rumor sensível (excepto lesões,
    // que continuam a merecer cautela editorial mesmo quando confirmadas).
    status = "CONFIRMED";
    sensitive = fact.type === "INJURY";
  } else if (isSensitiveType) {
    // Rumor sensível: confirmado só com corroboração de várias fontes; senão duvidoso.
    status = sources >= 2 ? "CONFIRMED" : "DOUBTFUL";
  } else if (fact.confidence >= 0.6) {
    status = "CONFIRMED";
  } else {
    status = "UNCONFIRMED";
  }

  return { id: fact.id, status, sensitive };
}

export interface QaSummary {
  decisions: QaFactDecision[];
  confirmed: number;
  doubtful: number;
  unconfirmed: number;
  sensitive: number;
}

export function classifyFacts(facts: QaInputFact[]): QaSummary {
  const decisions = facts.map(classifyFact);
  return {
    decisions,
    confirmed: decisions.filter((d) => d.status === "CONFIRMED").length,
    doubtful: decisions.filter((d) => d.status === "DOUBTFUL").length,
    unconfirmed: decisions.filter((d) => d.status === "UNCONFIRMED").length,
    sensitive: decisions.filter((d) => d.sensitive).length,
  };
}
