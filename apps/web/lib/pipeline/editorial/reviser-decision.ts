/**
 * Regra de decisão do Agente Revisor (pura, sem dependências, testável).
 * A CHECKLIST vive na doutrina (ESTILO-EDITORIAL-HG.md §8), não aqui: o Revisor devolve as
 * falhas por ETIQUETA curta, para a doutrina poder ser reescrita e renumerada sem partir o
 * código. Aqui ficam só as falhas que reprovam sempre.
 */

/** Falhas que reprovam sempre, qualquer que seja o resto do veredicto. */
export const HARD_FAIL_LABELS = [
  "abertura-formulaica", // todos os textos a começar pela mesma fórmula ("Reparem…", "Começou…")
  "bastidores-no-corpo", // instruções internas/processo editorial no texto publicado
  "marca-nao-oficial-repetida", // §7: a marca de não oficial aparece no máximo UMA vez
  "sem-voz-humana", // pilar 5-A: tom de analista neutro / linguagem de consultoria / ritmo morto
  "titulo-cita-orgao", // regra 3: o título nunca cita/atribui a um órgão de comunicação
  "titulo-engana", // título promete mais do que o texto entrega
  "rumor-como-facto",
  "invencao",
  "lista-negra",
] as const;

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s_]+/g, "-")
    .trim();
}

/**
 * Aprovado só se o estado vier APROVADO, o título não citar um órgão, e não houver nenhuma
 * falha dura. `tituloCitaOrgao` vem da verificação determinista (regex), que manda sobre o
 * juízo do modelo: a regra 3 não admite excepções.
 */
export function isReviserApproved(
  estado: string,
  falhas: string[],
  opts: { tituloCitaOrgao?: boolean } = {},
): boolean {
  if (opts.tituloCitaOrgao) return false;
  const norm = falhas.map(normalizeLabel);
  const hardFail = norm.some((f) => (HARD_FAIL_LABELS as readonly string[]).some((h) => f.includes(h)));
  return estado === "APROVADO" && !hardFail;
}

/** Lista legível das falhas, para o cartão do Telegram e para o painel. */
export function describeFalhas(falhas: string[]): string {
  return falhas.join("; ");
}
