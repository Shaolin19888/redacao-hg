import { z } from "zod";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { getDoctrine } from "../editorial/doctrine";
import { costEur } from "../report/pricing";
import type { AuditDecisionValue } from "./types";

/**
 * Agente Auditor — camada 2 da auditoria (docs/AUDITORIA-CONTEUDO.md §"por IA, só na dúvida").
 * Lê o conteúdo de um artigo antigo da zona cinzenta e avalia-o à luz da doutrina
 * (ESTILO-EDITORIAL-HG.md) para decidir apagar, juntar, melhorar ou manter. Só corre em
 * modo LLM real; em simulado devolve null e a camada de dados decide.
 */

const verdictSchema = z.object({
  decision: z.enum(["DELETE", "MERGE", "IMPROVE", "KEEP"]),
  reason: z.string(),
  recoverable: z.boolean().optional().default(false),
});

export interface AiAuditResult {
  decision: AuditDecisionValue;
  reason: string;
  recoverable: boolean;
  model: string;
  costEur: number;
}

function buildAuditorSystem(): string {
  return `${getDoctrine()}

---

És o Agente Auditor da Redação HG. Avalias um artigo ANTIGO já publicado à luz da doutrina acima, para uma poda de conteúdo que faça subir a qualidade média do site e devolver a confiança da Google.

Decide UMA de quatro:
- DELETE: peso morto. Resumo fininho sem ângulo próprio, clickbait de indignação antigo, ou efémero desatualizado sem valor. Sem potencial de recuperação.
- MERGE: tema válido mas peça fraca que se sobrepõe a outras semelhantes; consolidar num só.
- IMPROVE: tema com potencial e procura, mas peça fraca; vale reescrever com a doutrina e os três níveis.
- KEEP: já tem valor próprio, análise ou autoridade, ou continua útil (evergreen).

Sê realista: a maioria do conteúdo velho de indignação ou de resumo sem ângulo é DELETE ou IMPROVE. Só KEEP se tiver mesmo valor próprio.

Respondes só em JSON: {"decision":"DELETE|MERGE|IMPROVE|KEEP","reason":"motivo numa frase curta, português europeu","recoverable":true|false}`;
}

export async function auditArticleWithAI(input: { title: string; contentText: string }): Promise<AiAuditResult | null> {
  if ((await resolveLlmMode()) !== "real") return null;
  const excerpt = input.contentText.slice(0, 3000);
  const user = `Artigo a auditar.\n\nTítulo: ${input.title}\n\nConteúdo:\n${excerpt || "(sem conteúdo extraído)"}`;
  try {
    const r = await completeJSON({ tier: "fast", system: buildAuditorSystem(), user, schema: verdictSchema });
    return {
      decision: r.data.decision,
      reason: r.data.reason,
      recoverable: r.data.recoverable ?? false,
      model: r.model,
      costEur: costEur(r.model, r.tokensIn ?? 0, r.tokensOut ?? 0),
    };
  } catch {
    return null;
  }
}
