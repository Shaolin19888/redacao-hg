import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * Cliente LLM do pipeline, agnóstico de fornecedor (OpenAI ou Anthropic/Claude).
 *  - modo "real": chama o LLM e valida a saída JSON com zod.
 *  - modo "simulado": os agentes usam o caminho heurístico determinista (sem rede/custo).
 * O fornecedor é escolhido por Setting `pipeline_llm_provider` ("openai" | "claude").
 */

export type LlmMode = "real" | "simulado";
export type LlmProvider = "openai" | "claude";

function hasAnyKey(): boolean {
  return !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);
}

let cachedMode: { value: LlmMode; at: number } | null = null;
export async function resolveLlmMode(): Promise<LlmMode> {
  if (cachedMode && Date.now() - cachedMode.at < 30_000) return cachedMode.value;
  let value: LlmMode = "simulado";
  if (hasAnyKey()) {
    const setting = await prisma.setting.findUnique({ where: { key: "pipeline_llm_mode" } });
    value = setting?.value === "simulado" ? "simulado" : "real";
  }
  cachedMode = { value, at: Date.now() };
  return value;
}

let cachedProvider: { value: LlmProvider; at: number } | null = null;
export async function resolveLlmProvider(): Promise<LlmProvider> {
  if (cachedProvider && Date.now() - cachedProvider.at < 30_000) return cachedProvider.value;
  const setting = await prisma.setting.findUnique({ where: { key: "pipeline_llm_provider" } });
  // Default: openai (CLAUDE.md §4). Cai para claude se só houver chave Anthropic.
  let value: LlmProvider = (setting?.value as LlmProvider) ?? "openai";
  if (value === "openai" && !process.env.OPENAI_API_KEY && process.env.ANTHROPIC_API_KEY) value = "claude";
  cachedProvider = { value, at: Date.now() };
  return value;
}

export type ModelTier = "fast" | "text";

function openaiModel(tier: ModelTier): string {
  return tier === "text" ? (process.env.OPENAI_MODEL_TEXT ?? "gpt-4o") : (process.env.OPENAI_MODEL_FAST ?? "gpt-4o-mini");
}
/**
 * Modelo a usar em cada tier. Ordem: o que estiver guardado no painel de configurações,
 * depois a variável de ambiente, depois o default. Sem o primeiro passo, mudar o modelo no
 * painel não tinha efeito nenhum — o campo existia mas era decorativo.
 *
 * tier "text" = escrita e revisão (qualidade). tier "fast" = triagem e tarefas curtas (volume).
 */
async function claudeModel(tier: ModelTier): Promise<string> {
  const chave = tier === "text" ? "anthropic_model" : "anthropic_model_fast";
  const guardado = await prisma.setting.findUnique({ where: { key: chave } }).catch(() => null);
  if (guardado?.value) return guardado.value;
  return tier === "text"
    ? (process.env.ANTHROPIC_MODEL_TEXT ?? "claude-sonnet-5")
    : (process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5");
}

let openaiClient: OpenAI | null = null;
function openai(): OpenAI {
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}
let anthropicClient: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return anthropicClient;
}

export interface CompleteJsonResult<T> {
  data: T;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

/** Extrai o objecto JSON de uma resposta que pode vir com fences markdown (Claude). */
function extractJson(raw: string): unknown {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  else {
    const first = s.indexOf("{");
    const last = s.lastIndexOf("}");
    if (first >= 0 && last > first) s = s.slice(first, last + 1);
  }
  return JSON.parse(s);
}

/**
 * Chama o LLM (fornecedor configurado) e valida o JSON contra um schema zod.
 */
export async function completeJSON<T>(params: {
  tier: ModelTier;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
}): Promise<CompleteJsonResult<T>> {
  const provider = await resolveLlmProvider();

  if (provider === "claude") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY não configurada");
    const model = await claudeModel(params.tier);
    // Nota: os modelos Claude 4.6+ (opus-4-8, sonnet-4-6, ...) rejeitam `temperature`.
    // Omitimos o parâmetro para compatibilidade com toda a família.
    const res = await anthropic().messages.create({
      model,
      max_tokens: params.tier === "text" ? 3000 : 1024,
      system: params.system + "\nResponde apenas com JSON válido, sem texto antes ou depois.",
      messages: [{ role: "user", content: params.user }],
    });
    const raw = res.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
    const data = params.schema.parse(extractJson(raw));
    return { data, model, tokensIn: res.usage?.input_tokens, tokensOut: res.usage?.output_tokens };
  }

  // OpenAI
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY não configurada");
  const model = openaiModel(params.tier);
  const res = await openai().chat.completions.create({
    model,
    temperature: params.temperature ?? 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? "{}";
  const data = params.schema.parse(extractJson(raw));
  return { data, model, tokensIn: res.usage?.prompt_tokens, tokensOut: res.usage?.completion_tokens };
}
