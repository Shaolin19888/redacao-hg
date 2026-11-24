/**
 * Validação heurística de um post social (pura e testável). Verifica limite de
 * caracteres, presença do link e ausência de sinais de título enganador.
 */

export interface SocialQaIssue {
  type: "limite" | "link" | "enganador" | "vazio";
  severity: "critical" | "warning";
  detail: string;
}

export interface SocialQaInput {
  text: string;
  hasLink: boolean;
  charLimit: number | null;
  platformLabel: string;
}

export interface SocialQaResult {
  passed: boolean;
  issues: SocialQaIssue[];
}

// Palavras de clickbait a evitar em títulos/posts.
const CLICKBAIT = ["não vais acreditar", "chocante", "isto vai", "o que aconteceu a seguir", "bombástico"];

export function validateSocialPost(input: SocialQaInput): SocialQaResult {
  const issues: SocialQaIssue[] = [];

  if (!input.text.trim()) {
    issues.push({ type: "vazio", severity: "critical", detail: "Post sem texto." });
  }
  if (input.charLimit && input.text.length > input.charLimit) {
    issues.push({
      type: "limite",
      severity: "critical",
      detail: `Excede o limite de ${input.platformLabel} (${input.text.length}/${input.charLimit}).`,
    });
  }
  if (!input.hasLink) {
    issues.push({ type: "link", severity: "warning", detail: "Sem link para o artigo." });
  }
  const lower = input.text.toLowerCase();
  if (CLICKBAIT.some((c) => lower.includes(c))) {
    issues.push({ type: "enganador", severity: "warning", detail: "Possível linguagem de clickbait." });
  }

  return { passed: !issues.some((i) => i.severity === "critical"), issues };
}
