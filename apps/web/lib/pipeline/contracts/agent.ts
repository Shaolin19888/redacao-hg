import { z } from "zod";
import type { AgentName, PipelineState } from "@prisma/client";

/**
 * Contrato base de um agente-step. Cada agente é uma função pura tipada, sem estado
 * próprio, com entrada/saída validadas por zod. Ver docs/pipeline/arquitetura.md §2.
 */
export interface AgentContext {
  pipelineRunId: string;
  /** Estado do run no momento em que o step arranca. */
  state: PipelineState;
}

/** Resultado devolvido por um step ao orchestrator. */
export interface AgentResult<TOut> {
  /** Estado para onde transitar. Tem de ser uma transição válida a partir do actual. */
  nextState: PipelineState;
  output: TOut;
  /**
   * Motivo legível quando o step decide FAILED sem lançar excepção (ex.: reescrita
   * esgotada por cópia). Gravado em PipelineRun.error para ficar visível no painel/Telegram.
   */
  failureReason?: string;
  /** Metadados de auditoria opcionais (modelo LLM, tokens, versão do prompt). */
  audit?: {
    model?: string;
    promptVersion?: string;
    tokensIn?: number;
    tokensOut?: number;
  };
}

/**
 * Um Agent define o seu nome, os schemas de entrada/saída e a função run.
 * O orchestrator valida input com inputSchema antes de chamar run, e valida
 * output com outputSchema depois.
 */
export interface Agent<TIn, TOut> {
  name: AgentName;
  inputSchema: z.ZodType<TIn>;
  outputSchema: z.ZodType<TOut>;
  run(input: TIn, ctx: AgentContext): Promise<AgentResult<TOut>>;
}

/** Helper para declarar um agente com inferência de tipos. */
export function defineAgent<TIn, TOut>(agent: Agent<TIn, TOut>): Agent<TIn, TOut> {
  return agent;
}
