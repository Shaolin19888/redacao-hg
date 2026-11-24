import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { completeJSON, resolveLlmMode } from "../llm/client";
import { buildReviserSystem, PROMPT_VERSION } from "../llm/prompts";
import { isReviserApproved, describeFalhas } from "../editorial/reviser-decision";
import { titleAttributesToOutlet } from "../editorial/media-outlets";
import { analyzeVoice, describeVoiceSignals } from "../editorial/voice";
import { detectInternalLeaks, countUnofficialMarkers, detectFormulaicOpening } from "../editorial/body-rules";

/**
 * Agente Revisor — o guardião do ciclo de revisão (PROMPTS-INTERNOS §A e §H).
 * Confronta a peça já escrita com a checklist de 7 pontos da doutrina e devolve um
 * veredicto estruturado. NÃO reescreve: avalia e aponta.
 *
 * Fluxo: WRITTEN → EDITORIAL_QA_OK (cópia/invenção) → [revise] → REVISED_OK → SEO_QA_OK.
 *  - APROVADO → REVISED_OK (segue para SEO e, mais à frente, aprovação humana).
 *  - REPROVADO → guarda o feedback e devolve TEXT_REJECTED; o Writer corrige SÓ o apontado
 *    (§I) e volta a passar pelo ciclo. Máximo de 3 voltas.
 *  - Ao fim de 3 voltas ainda REPROVADO → NÃO descarta: avança para REVISED_OK com um
 *    QAReport crítico "A precisar de verificação humana reforçada" (§A.6). Chega sempre à
 *    mão humana, com o problema à vista no cartão/painel.
 *
 * Em modo simulado passa em vazio: a prosa heurística não cumpre a doutrina e o objectivo
 * do simulado é testar a máquina, não gerar peça publicável (mesma política do QA editorial).
 */

// Máximo de voltas de correção pedidas pelo Revisor (PROMPTS-INTERNOS §A.5).
const MAX_REVISER_ROUNDS = 3;

const inputSchema = z.object({ pipelineRunId: z.string() });

const outputSchema = z.object({
  estado: z.string(),
  passed: z.boolean(),
  round: z.number(),
  falhas: z.array(z.string()),
  notaTitulo: z.number().nullable(),
  notaDiscover: z.number().nullable(),
  risco: z.string().nullable(),
  needsHumanReview: z.boolean(),
});

const verdictSchema = z.object({
  estado: z.enum(["APROVADO", "REPROVADO"]),
  // Etiquetas curtas (não números): a checklist vive na doutrina e pode ser renumerada sem
  // partir o código. Ex.: "titulo-cita-orgao", "sem-angulo-proprio", "rumor-como-facto".
  falhas: z.array(z.string()).default([]),
  titulo_cita_orgao: z.boolean().optional().default(false),
  correcoes: z.array(z.string()).default([]),
  nota_titulo: z.number().min(0).max(10).nullable().optional(),
  nota_discover: z.number().min(0).max(10).nullable().optional(),
  risco: z.enum(["baixo", "medio", "alto"]).nullable().optional(),
});


export const reviserAgent = defineAgent({
  name: "REVISER",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: {
        article: true,
        candidate: { select: { title: true } },
        ledger: { include: { facts: true } },
      },
    });
    if (!run?.article) throw new Error("Revisor sem artigo");

    const passThrough = (extra: Partial<z.infer<typeof outputSchema>> = {}) => ({
      nextState: "REVISED_OK" as const,
      output: {
        estado: "APROVADO",
        passed: true,
        round: 0,
        falhas: [] as number[],
        notaTitulo: null,
        notaDiscover: null,
        risco: null,
        needsHumanReview: false,
        ...extra,
      },
      audit: { model: "heuristico", promptVersion: PROMPT_VERSION },
    });

    // Modo simulado: passa em vazio (não bloqueia a máquina com prosa heurística).
    if ((await resolveLlmMode()) !== "real") {
      return passThrough();
    }

    // Volta atual = quantas rejeições o Revisor já emitiu para este run.
    const priorRejections = await prisma.agentDecision.count({
      where: { pipelineRunId: input.pipelineRunId, agent: "REVISER", toState: "TEXT_REJECTED" },
    });
    const round = priorRejections + 1;

    const facts = run.ledger?.facts ?? [];
    const confirmedBlock =
      facts
        .filter((f) => f.status === "CONFIRMED" || f.status === "DOUBTFUL")
        .map((f, i) => `${i + 1}. [${f.status}] ${f.text}`)
        .join("\n") || "(sem factos confirmados registados)";

    // Sinais objectivos da voz (pilar 5-A): provas para o teste de ler em voz alta.
    const voice = analyzeVoice(run.article.body);

    // Aberturas usadas nas últimas peças: o Revisor tem de ver o que já foi feito para
    // apanhar muletas NOVAS (o modelo troca a palavra e mantém o molde). Auto-adaptativo,
    // não depende de uma lista fixa de fórmulas.
    const recentes = await prisma.article.findMany({
      where: { pipelineRunId: { not: input.pipelineRunId } },
      select: { body: true },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    const aberturasRecentes = recentes
      .map((a) => a.body.trim().split(/(?<=[.!?])\s/)[0].slice(0, 70))
      .filter(Boolean);

    const user = `Peça a avaliar.

Título: ${run.article.title}

Lead: ${run.article.lead ?? ""}

Texto:
${run.article.body}

Factos confirmados/atribuídos disponíveis (para verificar as afirmações, sem inventar):
${confirmedBlock}

Medições automáticas da VOZ (usa-as como prova no teste de ler em voz alta):
${describeVoiceSignals(voice)}

ABERTURAS JÁ USADAS nas peças anteriores do site (a desta peça NÃO pode repetir o molde de nenhuma):
${aberturasRecentes.map((o, i) => `${i + 1}. ${o}`).join("\n") || "(nenhuma registada)"}`;

    // Chamada ao Revisor. Se o LLM falhar, não bloqueamos o pipeline em loop: deixa passar
    // com um aviso, para o humano decidir (nunca descartar em silêncio).
    let verdict: z.infer<typeof verdictSchema>;
    let model = "desconhecido";
    let tokensIn: number | undefined;
    let tokensOut: number | undefined;
    try {
      const r = await completeJSON({ tier: "text", system: buildReviserSystem(), user, schema: verdictSchema });
      verdict = r.data;
      model = r.model;
      tokensIn = r.tokensIn;
      tokensOut = r.tokensOut;
    } catch {
      await prisma.qAReport.create({
        data: {
          pipelineRunId: input.pipelineRunId,
          stage: "revisor",
          agent: "REVISER",
          passed: false,
          issues: [{ type: "revisor", severity: "warning", detail: "O Agente Revisor não respondeu; a peça segue para revisão humana sem veredicto automático." }] as unknown as object[],
        },
      });
      return passThrough({ estado: "SEM_VEREDICTO", needsHumanReview: true });
    }

    // Regra 3 (título nunca cita um órgão): verificação DETERMINISTA sobre o título, que manda
    // sobre o juízo do modelo. Se o próprio modelo o assinalar, também conta.
    const tituloCitaOrgao = titleAttributesToOutlet(run.article.title) || verdict.titulo_cita_orgao === true;
    if (tituloCitaOrgao && !verdict.falhas.some((f) => f.includes("titulo-cita-orgao"))) {
      verdict.falhas.push("titulo-cita-orgao");
      verdict.correcoes.push(
        "Reescreve o título sem citar nenhum órgão de comunicação. Lidera pelo tema e pelo ângulo próprio; a origem, se for precisa, fica no corpo.",
      );
    }
    // ABERTURA FORMULAICA: todos os textos a começar pela mesma fórmula. Determinista.
    const abertura = detectFormulaicOpening(run.article.body);
    if (abertura && !verdict.falhas.some((f) => f.includes("abertura-formulaica"))) {
      verdict.falhas.push("abertura-formulaica");
      verdict.correcoes.push(
        `Reescreve a ABERTURA: começa ${abertura}, uma fórmula batida que se repete em todos os textos. Abre pelo facto concreto ou por uma observação afiada, diferente de peça para peça. Nada de "Reparem", "Vamos ao que interessa", "Começou", "Imaginem", "Deixem-me".`,
      );
    }

    // BASTIDORES: instruções internas ou processo editorial no texto publicado. Determinista.
    const leaks = detectInternalLeaks(run.article.body);
    if (leaks.length > 0 && !verdict.falhas.some((f) => f.includes("bastidores-no-corpo"))) {
      verdict.falhas.push("bastidores-no-corpo");
      verdict.correcoes.push(
        `Tira do texto as expressões de bastidores (${leaks.join("; ")}). O leitor não quer saber do processo editorial, só da notícia.`,
      );
    }

    // §7: a marca de informação não oficial aparece no MÁXIMO uma vez por peça.
    const marcas = countUnofficialMarkers(run.article.body);
    if (marcas.total > 1 && !verdict.falhas.some((f) => f.includes("marca-nao-oficial-repetida"))) {
      verdict.falhas.push("marca-nao-oficial-repetida");
      verdict.correcoes.push(
        `A marca de informação não oficial aparece ${marcas.total} vezes (${marcas.matches.slice(0, 4).join("; ")}). Deixa UMA só, leve e perto do fim, e corta as restantes.`,
      );
    }

    // Pilar 5-A: as expressões que a doutrina proíbe pelo nome reprovam sempre, mesmo que o
    // modelo não dê por elas. O resto do juízo de tom fica com o Revisor (ler em voz alta).
    if (voice.banned.length > 0 && !verdict.falhas.some((f) => f.includes("sem-voz-humana"))) {
      verdict.falhas.push("sem-voz-humana");
      verdict.correcoes.push(
        `Tira a linguagem de consultoria (${voice.banned.join("; ")}) e escreve com voz: opinião assumida, frases curtas a cortar as longas, linguagem viva. Se soa a relatório, reescreve.`,
      );
    }

    const approved = isReviserApproved(verdict.estado, verdict.falhas, { tituloCitaOrgao });

    const auditBase = { model, promptVersion: PROMPT_VERSION, tokensIn, tokensOut };

    if (approved) {
      await prisma.qAReport.create({
        data: {
          pipelineRunId: input.pipelineRunId,
          stage: "revisor",
          agent: "REVISER",
          passed: true,
          score: verdict.nota_titulo ?? undefined,
          issues: [] as unknown as object[],
        },
      });
      // Limpa feedback pendente (caso venha de uma volta anterior).
      await clearReviserFeedback(input.pipelineRunId, run.meta);
      return {
        nextState: "REVISED_OK" as const,
        output: {
          estado: verdict.estado,
          passed: true,
          round,
          falhas: verdict.falhas,
          notaTitulo: verdict.nota_titulo ?? null,
          notaDiscover: verdict.nota_discover ?? null,
          risco: verdict.risco ?? null,
          needsHumanReview: false,
        },
        audit: auditBase,
      };
    }

    // REPROVADO. Esgotámos as voltas? Então não descarta: segue flagueado para o humano.
    if (priorRejections >= MAX_REVISER_ROUNDS) {
      await prisma.qAReport.create({
        data: {
          pipelineRunId: input.pipelineRunId,
          stage: "revisor",
          agent: "REVISER",
          passed: false,
          score: verdict.nota_titulo ?? undefined,
          issues: [
            {
              type: "revisor",
              severity: "critical",
              detail: `A precisar de verificação humana reforçada: após ${MAX_REVISER_ROUNDS} voltas, o Revisor manteve falhas na checklist ${describeFalhas(verdict.falhas)}.`,
            },
          ] as unknown as object[],
        },
      });
      await clearReviserFeedback(input.pipelineRunId, run.meta);
      return {
        nextState: "REVISED_OK" as const,
        output: {
          estado: verdict.estado,
          passed: false,
          round,
          falhas: verdict.falhas,
          notaTitulo: verdict.nota_titulo ?? null,
          notaDiscover: verdict.nota_discover ?? null,
          risco: verdict.risco ?? null,
          needsHumanReview: true,
        },
        audit: auditBase,
      };
    }

    // Ainda há voltas: guarda o feedback e manda o Writer corrigir só o apontado (§I).
    const meta = (run.meta as Record<string, unknown> | null) ?? {};
    await prisma.pipelineRun.update({
      where: { id: input.pipelineRunId },
      data: {
        meta: {
          ...meta,
          reviserFeedback: {
            title: run.article.title,
            body: run.article.body,
            falhas: verdict.falhas,
            correcoes: verdict.correcoes,
          },
        },
      },
    });

    return {
      nextState: "TEXT_REJECTED" as const,
      output: {
        estado: verdict.estado,
        passed: false,
        round,
        falhas: verdict.falhas,
        notaTitulo: verdict.nota_titulo ?? null,
        notaDiscover: verdict.nota_discover ?? null,
        risco: verdict.risco ?? null,
        needsHumanReview: false,
      },
      audit: auditBase,
    };
  },
});

/** Remove o feedback do Revisor do meta do run (depois de consumido ou já irrelevante). */
async function clearReviserFeedback(pipelineRunId: string, meta: unknown): Promise<void> {
  const m = (meta as Record<string, unknown> | null) ?? {};
  if (!("reviserFeedback" in m)) return;
  const { reviserFeedback: _drop, ...rest } = m;
  void _drop;
  await prisma.pipelineRun
    .update({ where: { id: pipelineRunId }, data: { meta: rest as Prisma.InputJsonValue } })
    .catch(() => {});
}
