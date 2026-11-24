import type { FactType } from "@prisma/client";

/**
 * Extracção heurística de factos (modo simulado, sem LLM). Puro e testável.
 * Divide o texto em frases e transforma cada frase substancial num facto atómico,
 * inferindo o tipo por palavras-chave. Não inventa: cada facto é uma frase da fonte,
 * guardada como evidenceQuote.
 */

export interface HeuristicFact {
  text: string;
  type: FactType;
  confidence: number;
  evidenceQuote: string;
}

function inferType(sentence: string): FactType {
  const s = sentence.toLowerCase();
  if (/(les[aã]o|lesionad|rutura|entorse|recupera[çc][aã]o)/.test(s)) return "INJURY";
  if (/(proposta|contrat|transfer|mercado|refor[çc]o|assin|renova|neg[oó]cia|cl[aá]usula)/.test(s)) return "TRANSFER";
  if (/(disse|afirmou|declarou|garantiu|revelou|"|«|»)/.test(s)) return "QUOTE";
  if (/\d/.test(s) && /(golo|resultado|minuto|jornada|marcou|venceu|empat|derrota|época|anos|milh)/.test(s)) return "STAT";
  if (/(venceu|empatou|derrotou|golo|resultado|jogo|frente a|defrontou)/.test(s)) return "EVENT";
  return "GENERAL";
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractFactsHeuristic(title: string, summary: string | null, contentText: string | null): HeuristicFact[] {
  const parts = [title, summary ?? "", contentText ?? ""].filter(Boolean).join(". ");
  const sentences = splitSentences(parts);

  const seen = new Set<string>();
  const facts: HeuristicFact[] = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    if (words.length < 5) continue; // frases curtas não são factos úteis
    const key = sentence.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);

    const type = inferType(sentence);
    facts.push({
      text: sentence.replace(/\.$/, ""),
      type,
      // Confiança base menor para tipos sensíveis (mercado, lesão, declaração).
      confidence: type === "TRANSFER" || type === "INJURY" || type === "QUOTE" ? 0.45 : 0.65,
      evidenceQuote: sentence,
    });
  }
  return facts;
}
