import { prisma } from "@/lib/prisma";
import type { AgentName, PipelineState } from "@prisma/client";
import { assertTransition, isTerminal, isHumanGate, STATE_TO_NEXT_QUEUE } from "./state-machine";
import { enqueue } from "../queues/register";
import { recordDecision } from "../logging/agent-decision";
import { isOfficialBenficaSource } from "../dedup/decide";
import { notifyRunStopped, notifySocialApproval, notifyPushApproval, notifyTranscriptApproval } from "../approval/notify";
import type { Agent, AgentContext } from "../contracts/agent";

/**
 * O Orchestrator conduz a máquina de estados. NÃO é um LLM — é código determinístico.
 * Executa um agente-step, valida entrada/saída, aplica a transição de estado, regista
 * a decisão (auditoria) e enfileira o próximo passo. Ver docs/pipeline/arquitetura.md §2.
 */

/** Cria um novo run a partir de um Candidate. */
export async function startRun(candidateId: string): Promise<string> {
  const run = await prisma.pipelineRun.create({
    data: { candidateId, state: "COLLECTED" },
  });
  await recordDecision({
    pipelineRunId: run.id,
    agent: "SOURCE_MANAGER",
    toState: "COLLECTED",
    ok: true,
    output: { candidateId },
  });
  // Enfileira o primeiro passo real (dedup).
  await enqueueNext(run.id, "COLLECTED");
  return run.id;
}

/** Enfileira o job correspondente à fila seguinte de um dado estado, se existir. */
export async function enqueueNext(pipelineRunId: string, state: PipelineState): Promise<void> {
  // ARCHIVED é fim de linha, mas não pode ser fim de linha em SILÊNCIO quando o editor
  // mandou escrever: é preciso dizer-lhe porque é que a notícia não avançou.
  if (state === "ARCHIVED") {
    await notifyRunStopped(pipelineRunId).catch(() => {});
    return;
  }
  if (isTerminal(state) || isHumanGate(state)) return;

  // Pedido do editor que falhou (ex.: anti-cópia bloqueou): avisa-o para não ficar em silêncio.
  if (state === "FAILED") {
    await notifyRunStopped(pipelineRunId).catch(() => {});
    return;
  }

  // Transcrição feita: se houve mesmo transcrição, o editor vê-a antes de se escrever —
  // é onde se apanham nomes trocados antes de entrarem no texto. Sem transcrição (não era
  // conferência, ou não havia vídeo) segue directo aos factos, sem mais um toque.
  if (state === "TRANSCRIBED") {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      select: { candidate: { select: { transcript: { select: { id: true } } } } },
    });
    if (run?.candidate?.transcript) {
      await notifyTranscriptApproval(pipelineRunId).catch(() => {});
      return; // repousa até o editor decidir
    }
    await enqueue("extract-facts", { pipelineRunId });
    return;
  }

  // Imagem opcional: depois do SEO, se as imagens estiverem desligadas, salta a etapa
  // de imagem e vai directo ao rascunho WordPress.
  if (state === "SEO_QA_OK") {
    const setting = await prisma.setting.findUnique({ where: { key: "pipeline_images_enabled" } });
    const imagesEnabled = setting?.value === "true"; // default: desligado (Fase 4 liga)
    await enqueue(imagesEnabled ? "image-research" : "wp-draft", { pipelineRunId });
    return;
  }

  // Gate de pré-escrita: SÓ o site oficial do Benfica (slbenfica.pt) escreve automaticamente.
  // Todas as outras fontes (Record, A Bola, Mais Futebol, ...) pedem aprovação ANTES sequer de
  // extrair factos ou escrever — poupa o Writer (o passo mais caro) e a extracção de factos em
  // tudo o que o editor não aprovar. Controlável por Setting `pipeline_topic_gate`.
  if (state === "RELEVANT") {
    const gateSetting = await prisma.setting.findUnique({ where: { key: "pipeline_topic_gate" } });
    const gateEnabled = (gateSetting?.value ?? "true") === "true"; // default: ligado
    // Gate ligado → TODAS as fontes pedem aprovação antes de escrever, incluindo o site
    // oficial do Benfica. O editor escolhe o que vai para o site em todos os casos.
    if (gateEnabled) {
      await enqueue("topic-approval", { pipelineRunId });
      return;
    }
    await enqueue("extract-facts", { pipelineRunId });
    return;
  }

  // Distribuição em redes exige acção humana (regra §20). Auto-distribui só se ligado; senão
  // pede aprovação no Telegram (com a copy) para publicar no Facebook/redes activas.
  if (state === "SOCIAL_QA_OK") {
    const auto = await prisma.setting.findUnique({ where: { key: "pipeline_social_autodistribute" } });
    if (auto?.value === "true") {
      await enqueue("distribute", { pipelineRunId });
      return;
    }
    const gate = await prisma.setting.findUnique({ where: { key: "pipeline_social_gate" } });
    if ((gate?.value ?? "true") === "true") {
      await notifySocialApproval(pipelineRunId).catch(() => {});
    }
    return; // repousa até o humano decidir
  }

  // DISTRIBUTED é o fim do fluxo: finaliza para DONE (sem mais trabalho).
  if (state === "DISTRIBUTED") {
    await prisma.pipelineRun.update({ where: { id: pipelineRunId }, data: { state: "DONE" } });
    await recordDecision({ pipelineRunId, agent: "ORCHESTRATOR", fromState: "DISTRIBUTED", toState: "DONE", ok: true });
    return;
  }

  // Notícia publicada: pede aprovação para enviar a push (§21) e segue para o rascunho social.
  if (state === "PUBLISHED") {
    const gate = await prisma.setting.findUnique({ where: { key: "pipeline_push_gate" } });
    if ((gate?.value ?? "true") === "true") {
      await notifyPushApproval(pipelineRunId).catch(() => {});
    }
    await enqueue("social-draft", { pipelineRunId });
    return;
  }

  const queue = STATE_TO_NEXT_QUEUE[state];
  if (!queue) return;

  // Última rede contra o cancelamento ser desfeito: se o run já foi arquivado entretanto,
  // não se enfileira mais trabalho, venha o pedido de onde vier.
  const actual = await prisma.pipelineRun
    .findUnique({ where: { id: pipelineRunId }, select: { state: true } })
    .catch(() => null);
  if (actual?.state === "ARCHIVED") return;

  await enqueue(queue, { pipelineRunId });
}

/**
 * Executa um agente dentro de um job. Buscar o input é responsabilidade do caller
 * (o worker de cada fila), que passa o input já construído. Isto mantém os agentes
 * puros e testáveis.
 */
export async function runAgent<TIn, TOut>(
  agent: Agent<TIn, TOut>,
  pipelineRunId: string,
  buildInput: (ctx: AgentContext) => Promise<TIn> | TIn
): Promise<void> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: pipelineRunId } });
  if (!run) throw new Error(`PipelineRun não encontrado: ${pipelineRunId}`);

  // Re-tentativa do BullMQ depois de um step ter rebentado: o run ficou em FAILED, e a
  // partir de FAILED quase nenhuma transição é válida. Sem repor o estado anterior, a
  // segunda tentativa morria SEMPRE em "Transição inválida: FAILED → ..." e as três
  // tentativas configuradas nunca serviram para nada.
  // Cancelado pelo editor antes de este passo arrancar: não se começa sequer.
  if (run.state === "ARCHIVED") {
    await registarDescartado(pipelineRunId, agent.name, run.state, "cancelado antes de arrancar");
    return;
  }

  const fromState = await reporEstadoParaRetentativa(run.id, run.state, run.meta);
  const ctx: AgentContext = { pipelineRunId, state: fromState };
  const startedAt = Date.now();

  let input: TIn;
  try {
    input = agent.inputSchema.parse(await buildInput(ctx));
  } catch (err) {
    await fail(pipelineRunId, agent.name, fromState, err, "input inválido");
    throw err;
  }

  try {
    const result = await agent.run(input, ctx);
    const output = agent.outputSchema.parse(result.output);

    // Cancelado ENQUANTO este passo corria. O trabalho já foi feito e pago, mas o resultado
    // não se aplica e, sobretudo, não se enfileira o passo seguinte — senão o cancelamento
    // era desfeito pelo próprio passo que estava a decorrer, e a notícia seguia sozinha até
    // ao rascunho no site e ao cartão de aprovação, como aconteceu.
    const agora = await prisma.pipelineRun.findUnique({
      where: { id: pipelineRunId },
      select: { state: true },
    });
    if (agora?.state === "ARCHIVED") {
      await registarDescartado(pipelineRunId, agent.name, fromState, "cancelado durante a execução", Date.now() - startedAt);
      return;
    }

    assertTransition(fromState, result.nextState);

    // Um step pode decidir FAILED sem lançar (ex.: reescrita esgotada por cópia). Nesse
    // caso guardamos o motivo em error para ficar legível; caso contrário limpa-se o erro.
    const failMessage = result.nextState === "FAILED" ? result.failureReason ?? "Step terminou em FAILED sem motivo indicado." : null;

    await prisma.pipelineRun.update({
      where: { id: pipelineRunId },
      data: { state: result.nextState, currentAgent: agent.name, error: failMessage },
    });

    await recordDecision({
      pipelineRunId,
      agent: agent.name,
      fromState,
      toState: result.nextState,
      ok: failMessage === null,
      input,
      output,
      error: failMessage ?? undefined,
      model: result.audit?.model,
      promptVersion: result.audit?.promptVersion,
      tokensIn: result.audit?.tokensIn,
      tokensOut: result.audit?.tokensOut,
      durationMs: Date.now() - startedAt,
    });

    await enqueueNext(pipelineRunId, result.nextState);
  } catch (err) {
    await fail(pipelineRunId, agent.name, fromState, err, "erro no step", Date.now() - startedAt);
    throw err; // deixa o BullMQ aplicar retry/backoff
  }
}

/**
 * Regista que o resultado de um passo foi deitado fora por o editor ter cancelado.
 * Fica no histórico para se perceber onde é que o trabalho parou e quanto se gastou à toa.
 */
async function registarDescartado(
  pipelineRunId: string,
  agent: AgentName,
  fromState: PipelineState,
  motivo: string,
  durationMs?: number,
): Promise<void> {
  await recordDecision({
    pipelineRunId,
    agent,
    fromState,
    toState: "ARCHIVED",
    ok: true,
    output: { descartado: true, motivo },
    durationMs,
  }).catch(() => {});
}

/**
 * Se o run está em FAILED mas guardámos o estado em que estava antes de rebentar, repõe-o
 * para a re-tentativa poder correr. Devolve o estado a usar como origem.
 */
async function reporEstadoParaRetentativa(
  pipelineRunId: string,
  estadoActual: PipelineState,
  meta: unknown,
): Promise<PipelineState> {
  if (estadoActual !== "FAILED") return estadoActual;
  const m = (meta as Record<string, unknown> | null) ?? {};
  const anterior = m.estadoAntesDaFalha as PipelineState | undefined;
  if (!anterior || anterior === "FAILED") return estadoActual;

  await prisma.pipelineRun
    .update({ where: { id: pipelineRunId }, data: { state: anterior, error: null } })
    .catch(() => {});
  return anterior;
}

async function fail(
  pipelineRunId: string,
  agent: AgentName,
  fromState: PipelineState,
  err: unknown,
  context: string,
  durationMs?: number
): Promise<void> {
  const message = `${context}: ${err instanceof Error ? err.message : String(err)}`;
  // Guarda o estado em que o run estava: é o que permite à re-tentativa recomeçar de onde
  // devia, em vez de tentar sair de FAILED (que não vai a lado nenhum).
  const actual = await prisma.pipelineRun
    .findUnique({ where: { id: pipelineRunId }, select: { meta: true } })
    .catch(() => null);
  const meta = (actual?.meta as Record<string, unknown> | null) ?? {};

  await prisma.pipelineRun.update({
    where: { id: pipelineRunId },
    data: {
      state: "FAILED",
      currentAgent: agent,
      error: message,
      attempts: { increment: 1 },
      meta: { ...meta, estadoAntesDaFalha: fromState },
    },
  }).catch(() => {});
  await recordDecision({
    pipelineRunId,
    agent,
    fromState,
    toState: "FAILED",
    ok: false,
    error: message,
    durationMs,
  });

  // Uma excepção a meio do passo não passava por enqueueNext, por isso o editor nunca era
  // avisado de um rebentamento — só das falhas "arrumadas". Avisa-se depois de esgotadas as
  // tentativas do BullMQ (definitions.ts: attempts 3), para não gritar a cada retry.
  const estado = await prisma.pipelineRun
    .findUnique({ where: { id: pipelineRunId }, select: { attempts: true } })
    .catch(() => null);
  if ((estado?.attempts ?? 0) >= MAX_TENTATIVAS) {
    await notifyRunStopped(pipelineRunId).catch(() => {});
  }
}

/** Tentativas do BullMQ antes de um passo ser dado como perdido (lib/pipeline/queues/definitions.ts). */
const MAX_TENTATIVAS = 3;
