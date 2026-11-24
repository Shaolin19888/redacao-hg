/**
 * Regra 3 da doutrina: o título NUNCA cita um órgão de comunicação. Nada de "segundo a Record"
 * ou "segundo A Bola". O título lidera pelo tema e pelo ângulo próprio, nunca por quem deu a
 * notícia. Módulo puro e testável, usado pelo Reviser (reprovação) e pelos títulos SEO/Discover.
 *
 * Distinção importante:
 *  - ATRIBUIÇÃO ("segundo a Record", "Record avança que") → violação dura, reprova sempre.
 *  - MENÇÃO simples do órgão sem atribuir a notícia → aviso, não reprovação automática, porque
 *    a doutrina (§6.5) admite crítica de media, onde nomear o órgão é o próprio tema.
 */

// Nomes inequívocos. Sensível a maiúsculas de propósito: "A Bola" (jornal) ≠ "a bola" (do jogo).
export const OUTLETS = [
  "Record",
  "A Bola",
  "O Jogo",
  "Mais Futebol",
  "Maisfutebol",
  "MaisFutebol",
  "Bola na Rede",
  "Glorioso 1904",
  "CMTV",
  "SIC",
  "TVI",
  "RTP",
  "Sport TV",
  "Correio da Manhã",
  "Jornal de Notícias",
  "Diário de Notícias",
  "Observador",
  "Expresso",
  "Marca",
  "Mundo Deportivo",
  "Sky Sports",
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Menção do nome do órgão (sensível a maiúsculas, com fronteiras de palavra).
const OUTLET_RE = new RegExp(`(?<![\\p{L}])(${OUTLETS.map(escapeRe).join("|")})(?![\\p{L}])`, "u");

// Verbos/locuções de atribuição antes do órgão: "segundo a Record", "de acordo com O Jogo".
// Tolerante à maiúscula inicial, mas o NOME do órgão é sempre sensível a maiúsculas, senão
// "segundo a bola" casaria com o jornal "A Bola".
const ATTRIB_BEFORE = "(?:[Ss]egundo|[Dd]e acordo com|[Cc]onforme|[Tt]al como (?:avan[çc]a|escreve|noticia)|[Cc]omo (?:avan[çc]a|escreve|noticia))";
// Verbos de atribuição depois do órgão: "Record avança", "A Bola garante".
const ATTRIB_AFTER = "(?:avan[çc]a|avan[çc]ou|revela|revelou|escreve|escreveu|noticia|noticiou|garante|garantiu|adianta|adiantou|diz|disse|afirma|afirmou|conta|contou|assegura|assegurou)";

const OUTLETS_GROUP = OUTLETS.map(escapeRe).join("|");
const ATTRIB_BEFORE_RE = new RegExp(`${ATTRIB_BEFORE}\\s+(?:a|o|à|ao|na|no|com)?\\s*(${OUTLETS_GROUP})(?![\\p{L}])`, "u");
const ATTRIB_AFTER_RE = new RegExp(`(?<![\\p{L}])(${OUTLETS_GROUP})(?![\\p{L}])\\s+${ATTRIB_AFTER}(?![\\p{L}])`, "u");

export type MediaCitationKind = "atribuicao" | "mencao";

export interface MediaCitation {
  cites: boolean;
  kind: MediaCitationKind | null;
  outlet: string | null;
}

/**
 * Analisa um título. `atribuicao` é violação dura da regra 3; `mencao` é só um aviso
 * (pode ser crítica de media legítima, onde o órgão é o tema).
 */
export function citesMediaOutlet(title: string): MediaCitation {
  const attribBefore = ATTRIB_BEFORE_RE.exec(title);
  if (attribBefore) return { cites: true, kind: "atribuicao", outlet: attribBefore[1] };

  const attribAfter = ATTRIB_AFTER_RE.exec(title);
  if (attribAfter) return { cites: true, kind: "atribuicao", outlet: attribAfter[1] };

  const mention = OUTLET_RE.exec(title);
  if (mention) return { cites: true, kind: "mencao", outlet: mention[1] };

  return { cites: false, kind: null, outlet: null };
}

/** True só para o caso que reprova sempre: o título atribui a notícia a um órgão. */
export function titleAttributesToOutlet(title: string): boolean {
  return citesMediaOutlet(title).kind === "atribuicao";
}

/**
 * Remove a atribuição do início/fim de um título, para os títulos SEO/Discover nunca saírem
 * com "segundo a Record". Só limpa a construção de atribuição; não mexe no resto.
 */
export function stripMediaAttribution(title: string): string {
  return title
    // ", segundo a Record" / " - segundo O Jogo" no fim
    .replace(new RegExp(`[\\s,;:·|-]*${ATTRIB_BEFORE}\\s+(?:a|o|à|ao|na|no|com)?\\s*(?:${OUTLETS_GROUP})(?![\\p{L}])[.!?]?\\s*$`, "u"), "")
    // "Segundo a Record, " no início
    .replace(new RegExp(`^${ATTRIB_BEFORE}\\s+(?:a|o|à|ao|na|no|com)?\\s*(?:${OUTLETS_GROUP})(?![\\p{L}])[,:;\\s-]*`, "u"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
