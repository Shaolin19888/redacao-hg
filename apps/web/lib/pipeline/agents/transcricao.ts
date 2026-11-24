import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { PROMPT_VERSION } from "../llm/prompts";
import { decidirTranscricao, explicarRecusa, DURACAO_MAXIMA_SEG } from "../transcricao/fontes";
import { resolverVideo } from "../transcricao/resolver";
import { extrairAudioEmPartes } from "../transcricao/audio";
import { transcreverPartes, MODELO_TRANSCRICAO, custoTranscricaoEur } from "../transcricao/transcrever";

/**
 * Agente de Transcrição — transforma o áudio de uma conferência de imprensa em texto, para
 * que a extracção de factos tenha com que trabalhar.
 *
 * Corre SÓ depois de o editor aprovar o tema, e SÓ para fonte primária autorizada (o site
 * oficial do clube). Nunca para vídeos de outros jornais: transcrever o programa de estúdio
 * de outro meio seria apropriar-me do trabalho deles, não apurar um facto.
 *
 * A transcrição fica guardada internamente, como o corpo dos candidatos. O que sai para o
 * site são declarações com atribuição, nunca o texto corrido.
 *
 * Quando não há vídeo, ou a fonte não está autorizada, NÃO falha: segue em frente com o
 * texto que a página já tinha. A transcrição é um reforço, não uma condição.
 */

const inputSchema = z.object({ pipelineRunId: z.string() });

const outputSchema = z.object({
  transcrito: z.boolean(),
  motivo: z.string().nullable(),
  duracaoSeg: z.number(),
  caracteres: z.number(),
  custoEur: z.number(),
});

export const transcricaoAgent = defineAgent({
  name: "TRANSCRICAO",
  inputSchema,
  outputSchema,
  async run(input) {
    const run = await prisma.pipelineRun.findUnique({
      where: { id: input.pipelineRunId },
      include: { candidate: { select: { id: true, title: true, url: true } } },
    });
    const c = run?.candidate;
    if (!c) throw new Error("Transcrição sem candidato");

    const semTranscricao = (motivo: string) => ({
      // Sem transcrição o pipeline segue à mesma: TRANSCRIBED sem transcrição guardada faz o
      // orchestrator saltar o cartão e ir directo aos factos, com o texto que a página tem.
      //
      // NUNCA devolver TOPIC_APPROVED aqui: é o estado em que o run JÁ está, e o passo
      // rebentava com "Transição inválida: TOPIC_APPROVED → TOPIC_APPROVED". Como este é o
      // caminho de TODAS as notícias que não são conferências, isso bloqueava o pipeline
      // inteiro — nenhuma notícia chegava a ser escrita.
      nextState: "TRANSCRIBED" as const,
      output: { transcrito: false, motivo, duracaoSeg: 0, caracteres: 0, custoEur: 0 },
      audit: { model: "nenhum", promptVersion: PROMPT_VERSION },
    });

    // Já transcrita antes (reentrada, retry): não pagar duas vezes.
    const existente = await prisma.transcript.findUnique({ where: { candidateId: c.id } });
    if (existente) {
      return {
        nextState: "TRANSCRIBED" as const,
        output: {
          transcrito: true,
          motivo: null,
          duracaoSeg: existente.durationSec,
          caracteres: existente.text.length,
          custoEur: existente.costEur,
        },
        audit: { model: existente.model, promptVersion: PROMPT_VERSION },
      };
    }

    const decisao = decidirTranscricao(c.title, c.url);
    if (!decisao.transcrever) return semTranscricao(explicarRecusa(decisao.motivo));

    let video;
    try {
      video = await resolverVideo(c.url);
    } catch (e) {
      return semTranscricao(`Não consegui chegar ao vídeo: ${e instanceof Error ? e.message : "erro"}.`);
    }

    if (video.duracaoSeg > DURACAO_MAXIMA_SEG) {
      return semTranscricao(explicarRecusa("demasiado-longo", video.duracaoSeg));
    }

    const { partes } = await extrairAudioEmPartes(video.streamUrl);
    const t = await transcreverPartes({
      partes,
      duracaoSeg: video.duracaoSeg,
      contexto: c.title,
    });

    // Todos os pedaços falharam: não vale a pena guardar um texto que é só buracos.
    if (t.partesFalhadas === partes.length) {
      return semTranscricao("Não consegui enviar o áudio para transcrever (falharam todos os trechos).");
    }

    if (t.texto.length < 200) {
      return semTranscricao("A transcrição saiu vazia ou demasiado curta para servir de base.");
    }

    await prisma.transcript.create({
      data: {
        candidateId: c.id,
        mediaUrl: video.mediaUrl,
        text: t.texto,
        durationSec: video.duracaoSeg,
        model: t.modelo,
        costEur: t.custoEur,
      },
    });

    return {
      nextState: "TRANSCRIBED" as const,
      output: {
        transcrito: true,
        motivo: null,
        duracaoSeg: video.duracaoSeg,
        caracteres: t.texto.length,
        custoEur: t.custoEur,
      },
      audit: { model: MODELO_TRANSCRICAO, promptVersion: PROMPT_VERSION },
    };
  },
});

/** Estimativa do custo de transcrever, para mostrar no cartão antes de o editor decidir. */
export function estimativaTranscricaoEur(duracaoSeg: number): number {
  return custoTranscricaoEur(duracaoSeg);
}
