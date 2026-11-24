/**
 * Links internos (SEO): liga termos do corpo (clubes, jogadores, adversários) a outros
 * conteúdos do site. Puro e testável. A escolha do URL de destino (post relacionado) é
 * feita no agente, com pesquisa ao WordPress; aqui ficam a extracção de termos candidatos
 * e a inserção dos links no texto sem sobreposições.
 */

// Palavras capitalizadas que NÃO são termos a ligar (inícios de frase, preposições, comuns).
const STOP = new Set([
  "O", "A", "Os", "As", "Um", "Uma", "De", "Do", "Da", "Dos", "Das", "Em", "No", "Na",
  "Nos", "Nas", "Por", "Para", "Com", "Sem", "Segundo", "Após", "Ainda", "Mais", "Já",
  "Há", "Trata", "Esta", "Este", "Estes", "Estas", "Isto", "Fontes", "Também", "Quando",
  "Onde", "Como", "Mas", "Ontem", "Hoje", "Agora", "Luz", "Foi", "Será", "Está", "Não",
  "Sim", "Depois", "Antes", "Entre", "Sobre", "Desde",
  // Verbos e apelos no início de frase: davam âncoras absurdas ("Reparem", "Assinou").
  "Reparem", "Vamos", "Deixem", "Imaginem", "Começou", "Comecemos", "Vejam", "Olhem",
  "Assinou", "Assinaram", "Chegou", "Chegaram", "Ficou", "Ficaram", "Venceu", "Perdeu",
  "Marcou", "Jogou", "Somou", "Tem", "Teve", "Vai", "Vem", "Pode", "Parece", "Resta",
  "Falta", "Conta", "Custa", "Nada", "Tudo", "Muito", "Pouco", "Melhor", "Pior",
  "Talvez", "Apenas", "Quase", "Sempre", "Nunca", "Certo", "Claro", "Convém", "Importa",
]);

/**
 * Um nome próprio aparece capitalizado a MEIO de frases; uma palavra que só surge
 * capitalizada no início de frase é apenas a maiúscula da frase, não uma entidade.
 * Evita âncoras como "Reparem" ou "Assinou". Só se aplica a termos de uma palavra.
 */
function looksLikeSentenceStartOnly(term: string, text: string): boolean {
  if (term.includes(" ")) return false; // termos compostos são quase sempre entidades
  const re = new RegExp(`(^|[^.!?]\\s+|[.!?]\\s+)(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\b`, "g");
  let m: RegExpExecArray | null;
  let sentenceStart = 0;
  let midSentence = 0;
  while ((m = re.exec(text)) !== null) {
    const prefix = m[1];
    if (prefix === "" || /[.!?]\s+$/.test(prefix)) sentenceStart++;
    else midSentence++;
  }
  return midSentence === 0 && sentenceStart > 0;
}

/**
 * Termos candidatos a link: nomes próprios (1-3 palavras capitalizadas) do título e do
 * corpo. Ordenados dos mais longos para os mais curtos (para "Marco Silva" ganhar a "Marco")
 * e por ordem de aparição. A pesquisa ao site é que confirma se há conteúdo para ligar.
 */
export function linkableTerms(title: string, body: string): string[] {
  const text = `${title}. ${body}`;
  const re = /\b[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zá-úâêîôûãõç]{2,}(?:\s+[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][a-zá-úâêîôûãõç]+){0,2}\b/g;
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const m of text.match(re) ?? []) {
    const first = m.split(/\s+/)[0];
    if (STOP.has(first)) continue;
    if (m.length < 5 && !m.includes(" ")) continue; // single-word curto → provável ruído
    // Palavra que só aparece capitalizada no início de frase não é entidade, é maiúscula
    // de frase. Evita âncoras como "Reparem", "Assinou", "Chegou".
    if (looksLikeSentenceStartOnly(m, text)) continue;
    const k = m.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    terms.push(m);
  }
  // Multi-palavra primeiro (mais específico), depois por comprimento.
  return terms.sort((a, b) => b.length - a.length);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface LinkTarget {
  term: string;
  url: string;
}

/**
 * Insere links na PRIMEIRA ocorrência de cada termo, sem sobreposições e sem repetir URL.
 * Devolve o corpo com os <a> e o número de links inseridos.
 */
export function insertInternalLinks(body: string, targets: LinkTarget[]): { body: string; count: number } {
  const matches: Array<{ start: number; end: number; text: string; url: string }> = [];
  const usedUrl = new Set<string>();

  for (const t of targets) {
    if (!t.term || !t.url || usedUrl.has(t.url)) continue;
    const re = new RegExp(`\\b${escapeRegex(t.term)}\\b`, "i");
    const m = re.exec(body);
    if (m) {
      matches.push({ start: m.index, end: m.index + m[0].length, text: m[0], url: t.url });
      usedUrl.add(t.url);
    }
  }

  // Ordenar por posição e descartar sobreposições (fica o que aparece primeiro).
  matches.sort((a, b) => a.start - b.start);
  const chosen: typeof matches = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.start >= lastEnd) {
      chosen.push(m);
      lastEnd = m.end;
    }
  }

  let result = "";
  let cursor = 0;
  for (const m of chosen) {
    result += body.slice(cursor, m.start) + `<a href="${m.url}">${m.text}</a>`;
    cursor = m.end;
  }
  result += body.slice(cursor);
  return { body: result, count: chosen.length };
}
