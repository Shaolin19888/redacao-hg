/**
 * Formatação do resumo de aprovação (puro e testável). HTML simples para o Telegram.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ApprovalSummaryInput {
  title: string;
  bodyExcerpt: string;
  sourceName: string;
  sourceUrl: string;
  wordCount: number;
  category: string | null;
  qaWarnings: string[]; // avisos editoriais/SEO a mostrar ao humano
  wpSimulated: boolean;
  costEur?: number | null; // custo de API já gasto nesta notícia
  /** Custo discriminado por etapa (triagem, factos, escrita, revisão…). */
  costSteps?: { label: string; calls: number; eur: number }[];
}

/** Euros com 3 casas e vírgula, como se lê em Portugal. */
function eur3(n: number): string {
  return n.toFixed(3).replace(".", ",");
}

export function formatApprovalSummary(input: ApprovalSummaryInput): string {
  const lines: string[] = [];
  lines.push(`📝 <b>${escapeHtml(input.title)}</b>`);
  const custo = input.costEur != null && input.costEur > 0 ? ` · 💰 ${eur3(input.costEur)} €` : "";
  if (input.category) lines.push(`📂 ${escapeHtml(input.category)} · ${input.wordCount} palavras${custo}`);
  else if (custo) lines.push(`${input.wordCount} palavras${custo}`);
  // Discriminação do custo: mostra em que etapa foi gasto e quantas vezes correu.
  for (const s of input.costSteps ?? []) {
    if (s.eur <= 0) continue;
    const vezes = s.calls > 1 ? ` ×${s.calls}` : "";
    lines.push(`<i>   ${escapeHtml(s.label)}${vezes}: ${eur3(s.eur)} €</i>`);
  }
  lines.push("");
  lines.push(escapeHtml(input.bodyExcerpt));
  lines.push("");
  lines.push(`🔗 Fonte: ${escapeHtml(input.sourceName)}`);
  if (input.qaWarnings.length > 0) {
    lines.push("");
    lines.push("⚠️ <b>A rever:</b>");
    for (const w of input.qaWarnings.slice(0, 6)) lines.push(`• ${escapeHtml(w)}`);
  }
  lines.push("");
  lines.push(
    input.wpSimulated
      ? "🧪 Modo simulado: ao aprovares, NÃO será criado no site (teste)."
      : "📄 Para editar, responde com o texto novo. Ao aprovares, é criado e publicado no site."
  );
  lines.push("<i>Nada vai para o site sem a tua aprovação.</i>");
  return lines.join("\n");
}

/**
 * Excerto do corpo até um número de caracteres, cortado ao espaço.
 *
 * PRESERVA as quebras entre parágrafos. Antes colapsava tudo com /\s+/ → " ", o que fazia o
 * cartão mostrar o artigo num bloco único; ao copiar o texto do cartão para editar, os
 * parágrafos perdiam-se e o artigo ficava sem divisões.
 */
export function excerpt(body: string, max = 400): string {
  const clean = body
    .split(/\n\s*\n/) // parágrafos
    .map((p) => p.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + "…";
}
