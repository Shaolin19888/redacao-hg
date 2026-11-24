/**
 * Interpreta a resposta do editor no Telegram quando edita uma peça.
 *
 * Formatos aceites:
 *   1. Só corpo (comportamento de sempre):        "O Benfica venceu…"
 *   2. Título + corpo:                            "Título: X\n\nO Benfica venceu…"
 *   3. Só título:                                 "Título: X"
 *
 * O prefixo é tolerante: "Título:", "Titulo:", "TÍTULO:", "título -".
 * Puro e testável.
 */

export interface ParsedEdit {
  title: string | null;
  body: string | null;
}

const TITLE_PREFIX = /^\s*t[íi]tulo\s*[:\-–]\s*(.+)$/i;

export function parseEditReply(text: string): ParsedEdit {
  const raw = (text ?? "").trim();
  if (!raw) return { title: null, body: null };

  const linhas = raw.split(/\r?\n/);
  const m = TITLE_PREFIX.exec(linhas[0]);

  if (!m) {
    // Sem prefixo: tudo é corpo (compatível com o que já existia).
    return { title: null, body: raw };
  }

  const title = m[1].trim();
  const resto = linhas.slice(1).join("\n").trim();
  return { title: title || null, body: resto.length > 0 ? resto : null };
}
