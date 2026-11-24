/**
 * Geração heurística de copy para redes sociais (pura e testável). A partir do artigo
 * publicado, produz um texto curto com o título, um gancho e o link. Não inventa factos:
 * usa só o título, o lead e o link do artigo. Em modo real (LLM) o texto é mais trabalhado.
 */

export interface SocialComposeInput {
  title: string;
  lead: string | null;
  link: string;
  tags: string[];
  charLimit: number | null;
}

function hashtagize(tags: string[], max = 3): string {
  return tags
    .slice(0, max)
    .map((t) => "#" + t.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-zA-Z0-9]/g, ""))
    .filter((h) => h.length > 1)
    .join(" ");
}

/**
 * Remove apelos a clicar ("vê mais no site hugogil", "lê tudo em", etc.) e URLs que tenham
 * escapado para o texto. O link é sempre anexado à parte pela plataforma, nunca no corpo.
 */
export function stripCallToAction(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, "") // URLs soltos
    // Apelo a clicar: um verbo de CTA seguido, dentro da mesma frase, de um marcador do site.
    // Sem \b a seguir aos verbos (falha com acentos: "Vê", "Lê").
    .replace(
      /\s*[·|—-]?\s*(v[êe]|l[êe]|confere|acompanha|sabe|saiba|descobre|n[ãa]o percas|todos os detalhes)\s[^.!?\n]*?(no site|em hugogil|no hugogil|hugogil\.pt|no nosso site|link (na|em))[^.!?\n]*(?:\.\w{2,4})?[.!?]?/gi,
      ""
    )
    .replace(/\s*\bhugogil\.pt\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Compõe o texto respeitando o limite de caracteres da plataforma. */
export function composeSocialText(input: SocialComposeInput): string {
  const hashtags = hashtagize(input.tags);
  // Curto e chamativo: o título é o gancho. NÃO despejamos o lead (deixava a copy longa e a
  // parecer o início do artigo). Sem apelos a clicar nem link no corpo.
  const parts = [stripCallToAction(input.title).trim()];
  const link = input.link.trim();
  // O link NÃO entra no texto: o Facebook/LinkedIn recebem-no à parte (gera o cartão de
  // pré-visualização) e o X/Threads anexam-no eles próprios. Mas reservamos o seu espaço
  // no limite de caracteres, para que a versão dessas redes ainda caiba.
  const linkReserve = link ? link.length + 2 : 0;

  const buildWith = (body: string) => [body, hashtags].filter(Boolean).join("\n\n");

  let body = parts.join(" ");
  let text = buildWith(body);

  if (input.charLimit && text.length + linkReserve > input.charLimit) {
    const overhead = text.length - body.length + linkReserve;
    const room = Math.max(0, input.charLimit - overhead - 1);
    body = body.slice(0, room);
    const lastSpace = body.lastIndexOf(" ");
    if (lastSpace > room * 0.6) body = body.slice(0, lastSpace);
    body = body.trim() + "…";
    text = buildWith(body);
  }

  return text;
}
