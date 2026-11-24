/**
 * Conteúdo da push notification (puro e testável). Título curto e corpo com o gancho, a
 * partir do artigo já escrito. Sem inventar: usa título, lead e meta descrição.
 */

const PUSH_TITLE_MAX = 65;
const PUSH_BODY_MAX = 140;

function cut(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const s = clean.slice(0, max);
  const lastSpace = s.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? s.slice(0, lastSpace) : s).trim() + "…";
}

export function generatePush(input: { title: string; lead: string | null; metaDescription: string | null }): { title: string; body: string } {
  const title = cut(input.title, PUSH_TITLE_MAX);
  const bodySource = (input.lead ?? input.metaDescription ?? input.title).trim();
  const body = cut(bodySource, PUSH_BODY_MAX);
  return { title, body };
}
