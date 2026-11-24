import { z } from "zod";
import { defineAgent } from "../contracts/agent";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { RELEVANCE_SYSTEM, PROMPT_VERSION } from "../llm/prompts";
import { applyRelevancePolicy } from "../relevance/policy";

/**
 * Relevance Agent — decide se o candidato interessa ao produto editorial.
 * Relevante → RELEVANT; irrelevante → ARCHIVED.
 */

const inputSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  contentText: z.string().nullable(),
  priorityClubs: z.array(z.string()),
  categories: z.array(z.string()),
});
type Input = z.infer<typeof inputSchema>;

const outputSchema = z.object({
  relevant: z.boolean(),
  score: z.number().min(0).max(1),
  reason: z.string(),
  category: z.string().nullable(),
  // Benfica é o tema CENTRAL da peça (não apenas mencionado de passagem).
  // Só quando é central é que a notícia é escrita automaticamente sem gate humano.
  benficaCentral: z.boolean(),
});
type Output = z.infer<typeof outputSchema>;

function heuristicRelevance(input: Input): Output {
  const p = applyRelevancePolicy(input.title, input.summary, input.contentText);
  return {
    relevant: p.relevant,
    score: p.relevant ? (p.benficaCentral ? 1 : 0.6) : 0,
    reason: p.reason,
    category: p.category,
    benficaCentral: p.benficaCentral,
  };
}

// Schema tolerante para a saída do LLM (score pode vir em escala 0-1 ou 0-10).
const llmRelevanceSchema = z.object({
  relevant: z.boolean(),
  score: z.number(),
  reason: z.string(),
  category: z.string().nullable(),
  benficaCentral: z.boolean(),
});

function normalizeScore(n: number): number {
  const v = n > 1 ? n / 10 : n;
  return Math.max(0, Math.min(1, v));
}

async function llmRelevance(input: Input): Promise<{ out: Output; model: string; tokensIn?: number; tokensOut?: number }> {
  const user = `Notícia recolhida:
Título: ${input.title}
Resumo: ${input.summary ?? "(sem resumo)"}
Texto: ${(input.contentText ?? "").slice(0, 1800)}

POLÍTICA EDITORIAL — aceita SÓ estes casos; tudo o resto é irrelevante (relevant=false):
1. BENFICA: qualquer notícia substancial sobre o Benfica (clube, jogadores, treinador,
   direcção, jogos, mercado do Benfica). → relevant=true, benficaCentral=true, category="Benfica".
2. FC PORTO ou SPORTING: APENAS se for polémica ou lance de arbitragem (VAR, penáltis,
   expulsões, erros de arbitragem, escândalos, acusações, guerras de bastidores). Jogos
   normais, contratações, treinos e resultados destes clubes NÃO interessam (relevant=false).
   Quando aceite → relevant=true, benficaCentral=false, category="FC Porto" ou "Sporting".
3. FEDERAÇÃO (FPF), LIGA PORTUGAL ou CONSELHO DE ARBITRAGEM: APENAS medidas, nomeações,
   casos, processos ou polémicas institucionais. → relevant=true, benficaCentral=false,
   category="Federação/Liga/Arbitragem".
Tudo o resto (outros clubes, futebol internacional, jogos normais, curiosidades) → relevant=false.

O Benfica só é benficaCentral=true se for o tema central, não uma menção de passagem.

Devolve JSON (score é decimal 0 a 1):
{"relevant": bool, "score": 0.0-1.0, "benficaCentral": bool, "reason": "curto", "category": "..." ou null}`;

  const res = await completeJSON({ tier: "fast", system: RELEVANCE_SYSTEM, user, schema: llmRelevanceSchema, temperature: 0.2 });
  return {
    out: {
      relevant: res.data.relevant,
      score: normalizeScore(res.data.score),
      reason: res.data.reason,
      category: res.data.category,
      benficaCentral: res.data.benficaCentral,
    },
    model: res.model,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
  };
}

export const relevanceAgent = defineAgent({
  name: "RELEVANCE",
  inputSchema,
  outputSchema,
  async run(input) {
    const mode = await resolveLlmMode();
    let output: Output;
    let audit: { model?: string; promptVersion?: string; tokensIn?: number; tokensOut?: number } = {
      model: "heuristico",
      promptVersion: PROMPT_VERSION,
    };

    if (mode === "real") {
      try {
        const r = await llmRelevance(input);
        output = r.out;
        audit = { model: r.model, promptVersion: PROMPT_VERSION, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
      } catch {
        output = heuristicRelevance(input); // fallback resiliente
      }
    } else {
      output = heuristicRelevance(input);
    }

    return {
      nextState: output.relevant ? ("RELEVANT" as const) : ("ARCHIVED" as const),
      output,
      audit,
    };
  },
});
