/**
 * Composição heurística de artigo (Writer sem LLM). Pura e testável.
 * Escreve APENAS a partir dos factos confirmados dados, um facto por frase, com
 * conectores neutros. NUNCA inventa nem repete factos para atingir contagem de palavras:
 * o mínimo de palavras é verificado depois pelo Editorial QA (Fase 3), que sinaliza para
 * revisão humana os textos demasiado curtos. Em modo real (LLM) o Writer elabora prosa
 * até ao mínimo sem acrescentar factos novos.
 */

export interface ConfirmedFact {
  id: string;
  text: string;
  type: string;
}

export interface ComposedArticle {
  title: string;
  lead: string;
  body: string;
  wordCount: number;
  usedFactIds: string[];
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function lower1(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// Conectores neutros, sem afirmar factos novos.
const CONNECTORS = [
  "De acordo com a informação disponível,",
  "No mesmo sentido,",
  "A par disso,",
  "Neste contexto,",
  "Importa ainda referir que,",
];

export function composeArticleHeuristic(
  candidateTitle: string,
  confirmedFacts: ConfirmedFact[],
  doubtfulFacts: ConfirmedFact[] = [],
  sourceName = "a fonte"
): ComposedArticle {
  const usedFactIds = [...confirmedFacts, ...doubtfulFacts].map((f) => f.id);
  const title = candidateTitle.replace(/\.$/, "").trim();

  const paragraphs: string[] = [];

  // Factos confirmados: afirmados directamente.
  if (confirmedFacts.length > 0) {
    paragraphs.push(`${confirmedFacts[0].text.replace(/\.$/, "")}.`);
    confirmedFacts.slice(1).forEach((f, i) => {
      const connector = CONNECTORS[i % CONNECTORS.length];
      paragraphs.push(`${connector} ${lower1(f.text.replace(/\.$/, ""))}.`);
    });
  } else {
    paragraphs.push(`${title}.`);
  }

  // Informações não confirmadas: SEMPRE atribuídas à fonte (regra 4).
  doubtfulFacts.forEach((f, i) => {
    const attr = i === 0 ? `Segundo a ${sourceName},` : `Ainda de acordo com a ${sourceName},`;
    paragraphs.push(`${attr} ${lower1(f.text.replace(/\.$/, ""))}.`);
  });

  // Quando há rumor mas nada confirmado, deixar claro que o clube nada disse.
  if (doubtfulFacts.length > 0) {
    paragraphs.push("O clube não confirmou nem comentou esta informação.");
  }

  paragraphs.push(
    "A redação acompanha o desenvolvimento do tema e atualizará esta notícia caso surjam novos dados confirmados pelas fontes."
  );

  const body = paragraphs.join("\n\n");
  const lead = confirmedFacts[0]
    ? `${confirmedFacts[0].text.replace(/\.$/, "")}.`
    : doubtfulFacts[0]
    ? `Segundo a ${sourceName}, ${lower1(doubtfulFacts[0].text.replace(/\.$/, ""))}. O clube não confirmou.`
    : `${title}.`;

  return { title, lead, body, wordCount: countWords(body), usedFactIds };
}
