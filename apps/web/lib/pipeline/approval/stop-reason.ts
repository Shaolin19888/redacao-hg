/**
 * Traduz a paragem de um run para uma explicação que o editor entende.
 *
 * Porquê: quando o editor carrega em "escrever" e a notícia morre a meio, o sistema ficava
 * calado. Pior, o aviso de falha só existia para pedidos do editor e para o site oficial do
 * Benfica — uma notícia do Record aprovada à mão morria em silêncio absoluto. Do lado de lá
 * é indistinguível de "ainda está a escrever".
 *
 * Lógica pura, sem I/O: recebe o último passo do run e devolve texto.
 */

export interface ParagemInput {
  /** Agente onde o run parou (o último a decidir). */
  agent: string;
  /** Estado final: ARCHIVED (decisão do sistema) ou FAILED (avaria/limite). */
  toState: string;
  /** Saída desse agente, tal como ficou registada. */
  output?: Record<string, unknown> | null;
  /** Mensagem de erro guardada no run, quando existe. */
  error?: string | null;
  /** Endereço da fonte, para reconhecer páginas sem texto (vídeo, directo). */
  sourceUrl?: string | null;
}

export interface Paragem {
  /** Cabeçalho curto da mensagem. */
  titulo: string;
  /** O que aconteceu, em linguagem corrente. */
  explicacao: string;
  /** O que o editor pode fazer a seguir, quando há alguma coisa a fazer. */
  sugestao?: string;
}

const n = (o: ParagemInput["output"], k: string): number =>
  typeof o?.[k] === "number" ? (o[k] as number) : 0;

/** Páginas que são só vídeo ou relato ao minuto: quase não têm texto para extrair factos. */
function paginaSemTexto(url?: string | null): boolean {
  if (!url) return false;
  return /\/(multimedia|video|videos|em-direto|direto|ao-minuto|podcast|galeria|fotogaleria)\//i.test(url);
}

export function explicarParagem(input: ParagemInput): Paragem {
  const erro = input.error ?? "";

  // Anti-cópia: o Writer não conseguiu afastar-se do texto da fonte.
  if (/copiada|Reescrita esgotada/i.test(erro)) {
    return {
      titulo: "Não consegui escrever sem copiar",
      explicacao:
        "Tentei escrever e o texto ficou demasiado colado ao da fonte. Reescrevi e voltou a acontecer, " +
        "por isso parei em vez de publicar uma cópia.",
      sugestao: "Manda-me os pontos principais por palavras tuas, ou reformula o pedido.",
    };
  }

  switch (input.agent) {
    case "FACT_QA": {
      const confirmados = n(input.output, "confirmed");
      const duvidosos = n(input.output, "doubtful");
      const total = confirmados + duvidosos + n(input.output, "unconfirmed");
      const base =
        `Fui ler a fonte e só consegui apurar ${total === 1 ? "um facto" : `${total} factos`}, ` +
        `${confirmados === 0 ? "nenhum deles confirmado" : `${confirmados} confirmado(s)`}` +
        `${duvidosos > 0 ? ` (${duvidosos} ficou por confirmar)` : ""}. ` +
        "Sem base factual não escrevo, porque seria inventar.";
      return {
        titulo: "Não havia factos que chegassem",
        explicacao: base,
        sugestao: paginaSemTexto(input.sourceUrl)
          ? "Esta é uma página de vídeo ou de directo, quase sem texto — daí ter ficado tão pouco. Manda o link de uma notícia escrita sobre o mesmo, ou os pontos principais."
          : "Manda-me outra fonte sobre o mesmo assunto, ou os pontos principais por palavras tuas.",
      };
    }

    case "FACT_EXTRACTION":
      return {
        titulo: "Não consegui tirar factos da fonte",
        explicacao: "Abri a fonte e não encontrei texto suficiente para extrair o que aconteceu.",
        sugestao: "Manda o link de uma notícia escrita, ou os pontos principais.",
      };

    case "DUPLICATE_DETECTOR":
      return {
        titulo: "Já tinha esta notícia",
        explicacao: "Este assunto já entrou por outra fonte, por isso não dupliquei o trabalho.",
      };

    case "RELEVANCE":
      return {
        titulo: "A triagem pôs esta de lado",
        explicacao: "Depois de ler o conteúdo todo, a notícia não passou o critério editorial.",
        sugestao: "Se achas que devia ter passado, manda-me o link outra vez e eu escrevo à mesma.",
      };

    case "EDITORIAL_QA":
      return {
        titulo: "O texto não passou na revisão",
        explicacao: erro || "A revisão editorial encontrou problemas que não consegui corrigir.",
        sugestao: "Manda-me os pontos principais por palavras tuas para eu tentar de outra maneira.",
      };
  }

  // Rede de segurança: nunca devolver silêncio, nem sequer para um caso não previsto.
  return {
    titulo: input.toState === "FAILED" ? "A notícia falhou" : "A notícia não avançou",
    explicacao: erro || `Parou no passo ${input.agent} e não chegou a texto.`,
  };
}

/** Mensagem final para o Telegram (HTML simples). */
export function formatarParagem(titulo: string, p: Paragem): string {
  return (
    `⚠️ <b>${p.titulo}</b>\n` +
    `«${titulo}»\n\n` +
    `${p.explicacao}` +
    (p.sugestao ? `\n\n<i>${p.sugestao}</i>` : "")
  );
}
