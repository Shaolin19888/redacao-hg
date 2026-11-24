/** Tipos partilhados da auditoria de conteúdo. Iguais aos valores do enum Prisma AuditDecision. */

export type AuditDecisionValue = "DELETE" | "MERGE" | "IMPROVE" | "KEEP";

export interface AuditArticleInput {
  wpPostId: number;
  url: string;
  title: string;
  publishedAt: Date | null;
  clicks: number | null; // null = sem dados de tráfego (GSC não ligado / URL não no CSV)
  impressions: number | null;
  contentChars: number;
}

export interface DataScore {
  suggestedDecision: AuditDecisionValue;
  reason: string;
  score: number; // prioridade de corte: maior = cortar primeiro
  needsAI: boolean; // zona cinzenta → camada 2 (Agente Auditor) decide
  indexedGuess: boolean | null;
  ageMonths: number | null;
}
