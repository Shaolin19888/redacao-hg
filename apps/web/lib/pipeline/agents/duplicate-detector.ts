import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineAgent } from "../contracts/agent";
import { decideDuplicate, DEFAULT_HAMMING_THRESHOLD, type DedupCandidate } from "../dedup/decide";

/**
 * Duplicate Detector. Compara o candidato contra os recentes e arquiva o que é repetido:
 *  - Repost verbatim (título exacto / SimHash baixo) → arquiva.
 *  - Mesmo tema noutra fonte → arquiva; fica o primeiro que chegou, e é sobre esse que o
 *    editor decide no gate. Evita receber o mesmo assunto várias vezes para aprovar.
 *
 * Nota: a agregação multi-fonte (juntar várias fontes numa peça, com janela de espera) foi
 * removida do projecto. Com o gate a valer para TODAS as fontes, o editor escolhe peça a peça.
 */

const inputSchema = z.object({
  candidateId: z.string(),
  simhash: z.string().nullable(),
  title: z.string(),
  text: z.string(),
  sourceUrl: z.string(),
});

const outputSchema = z.object({
  isDuplicate: z.boolean(),
  duplicateOfId: z.string().nullable(),
  distance: z.number().nullable(),
  reason: z.enum(["simhash", "titulo-exacto", "mesmo-tema"]).nullable(),
});

/** Janela de candidatos a considerar para dedup (dias). */
const WINDOW_DAYS = 3;

export const duplicateDetector = defineAgent({
  name: "DUPLICATE_DETECTOR",
  inputSchema,
  outputSchema,
  async run(input) {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
    const others = await prisma.candidate.findMany({
      where: { id: { not: input.candidateId }, fetchedAt: { gte: since }, duplicateOfId: null },
      select: { id: true, simhash: true, title: true, summary: true, runs: { select: { state: true } } },
      orderBy: { fetchedAt: "desc" },
      take: 500,
    });

    // Regra do editor: se já está uma notícia do mesmo tema à espera de decisão, é essa que
    // fica e a nova é arquivada. As pendentes vão à frente na lista para que seja a elas que
    // o "mesmo-tema" se agarre, em vez de a uma que já foi descartada na triagem.
    const pendente = (r: { state: string }[]) =>
      r.some((x) => x.state === "AWAITING_TOPIC_APPROVAL" || x.state === "AWAITING_APPROVAL");
    const ordenados = [...others].sort((a, b) => Number(pendente(b.runs)) - Number(pendente(a.runs)));

    const decision = decideDuplicate(
      { id: input.candidateId, simhash: input.simhash, title: input.title, text: input.text },
      ordenados.map((o) => ({ id: o.id, simhash: o.simhash, title: o.title, text: `${o.title} ${o.summary ?? ""}` })) as DedupCandidate[],
      DEFAULT_HAMMING_THRESHOLD,
    );

    if (decision.isDuplicate && decision.duplicateOfId) {
      await prisma.candidate.update({
        where: { id: input.candidateId },
        data: { duplicateOfId: decision.duplicateOfId },
      });
      return { nextState: "ARCHIVED" as const, output: decision };
    }

    return { nextState: "DEDUP_OK" as const, output: decision };
  },
});
