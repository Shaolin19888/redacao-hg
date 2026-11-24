import { test } from "node:test";
import assert from "node:assert/strict";
import { explicarParagem, formatarParagem } from "../../lib/pipeline/approval/stop-reason";

/** Caso real: página de vídeo do Record, 1 facto, nenhum confirmado, arquivada em silêncio. */
test("factos insuficientes: diz quantos apurou e que a fonte é uma página de vídeo", () => {
  const p = explicarParagem({
    agent: "FACT_QA",
    toState: "ARCHIVED",
    output: { confirmed: 0, doubtful: 1, unconfirmed: 0, sensitive: 1 },
    sourceUrl: "https://www.record.pt/multimedia/record-na-hora/detalhe/benfica-recusa-proposta",
  });
  assert.match(p.explicacao, /um facto/);
  assert.match(p.explicacao, /nenhum deles confirmado/);
  assert.match(p.sugestao ?? "", /vídeo ou de directo/);
});

test("factos insuficientes numa notícia escrita: sugere outra fonte, sem falar de vídeo", () => {
  const p = explicarParagem({
    agent: "FACT_QA",
    toState: "ARCHIVED",
    output: { confirmed: 0, doubtful: 2, unconfirmed: 1 },
    sourceUrl: "https://www.record.pt/futebol/detalhe/uma-noticia-normal",
  });
  assert.match(p.explicacao, /3 factos/);
  assert.doesNotMatch(p.sugestao ?? "", /vídeo/);
});

test("bloqueio anti-cópia é explicado como tal, venha de que passo vier", () => {
  const p = explicarParagem({
    agent: "EDITORIAL_QA",
    toState: "FAILED",
    error: "Reescrita esgotada (1 tentativas). QA editorial manteve: frase copiada",
  });
  assert.match(p.titulo, /sem copiar/);
  assert.match(p.sugestao ?? "", /palavras tuas/);
});

test("duplicado e triagem têm explicações próprias", () => {
  assert.match(explicarParagem({ agent: "DUPLICATE_DETECTOR", toState: "ARCHIVED" }).explicacao, /outra fonte/);
  assert.match(explicarParagem({ agent: "RELEVANCE", toState: "ARCHIVED" }).explicacao, /critério editorial/);
});

test("um passo imprevisto nunca devolve silêncio", () => {
  const p = explicarParagem({ agent: "AGENTE_NOVO", toState: "FAILED", error: "" });
  assert.ok(p.titulo.length > 0 && p.explicacao.length > 0);
  assert.match(p.explicacao, /AGENTE_NOVO/);
});

test("a mensagem leva o título da notícia e a sugestão em itálico", () => {
  const out = formatarParagem("Benfica recusou proposta do Fenerbahçe", {
    titulo: "Não havia factos que chegassem",
    explicacao: "Só apurei um facto.",
    sugestao: "Manda outra fonte.",
  });
  assert.match(out, /Benfica recusou proposta do Fenerbahçe/);
  assert.match(out, /<i>Manda outra fonte\.<\/i>/);
});
