import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fonteAutorizada, pareceConferencia, decidirTranscricao, explicarRecusa, DURACAO_MAXIMA_SEG,
} from "../../lib/pipeline/transcricao/fontes";
import { extrairIdVimeo, lerConfigVimeo } from "../../lib/pipeline/transcricao/resolver";
import { custoTranscricaoEur } from "../../lib/pipeline/transcricao/transcrever";

const CONF = "https://www.slbenfica.pt/pt-pt/agora/noticias/2026/07/29/futebol-marco-silva-antevisao-benfica-st-gallen";

test("a lista branca é branca: só a fonte primária autorizada entra", () => {
  assert.ok(fonteAutorizada(CONF));
  assert.ok(fonteAutorizada("https://slbenfica.pt/x"), "sem www também");
  assert.ok(!fonteAutorizada("https://www.record.pt/multimedia/record-na-hora/detalhe/x"));
  assert.ok(!fonteAutorizada("https://www.abola.pt/videos/detalhe/x"));
});

test("um domínio que só CONTÉM o nome não passa por parecido", () => {
  assert.ok(!fonteAutorizada("https://slbenfica.pt.exemplo.com/x"));
  assert.ok(!fonteAutorizada("https://naoeslbenfica.pt/x"));
});

test("reconhece conferências e declarações, com e sem acentos", () => {
  assert.ok(pareceConferencia("Conferência de imprensa", CONF));
  assert.ok(pareceConferencia("Marco Silva faz a antevisão", CONF));
  assert.ok(pareceConferencia("Flash interview", CONF));
  assert.ok(!pareceConferencia("Afonso Bandeira renova até 2030", "https://www.slbenfica.pt/pt-pt/agora/noticias/renovacao"));
});

test("o programa de estúdio de outro jornal é recusado, e explica-se porquê", () => {
  const d = decidirTranscricao("Conferência de imprensa", "https://www.record.pt/multimedia/record-na-hora/detalhe/x");
  assert.equal(d.transcrever, false);
  assert.equal(d.motivo, "fonte-nao-autorizada");
  assert.match(explicarRecusa(d.motivo), /copiar o trabalho deles/);
});

test("o tecto de duração trava vídeos longos", () => {
  assert.equal(decidirTranscricao("Conferência de imprensa", CONF, 30 * 60).transcrever, true);
  const longo = decidirTranscricao("Conferência de imprensa", CONF, DURACAO_MAXIMA_SEG + 1);
  assert.equal(longo.transcrever, false);
  assert.match(explicarRecusa(longo.motivo, 120 * 60), /120 minutos/);
});

test("encontra o vídeo embebido na página", () => {
  assert.equal(extrairIdVimeo('<iframe src="https://player.vimeo.com/video/1213965097"></iframe>'), "1213965097");
  assert.equal(extrairIdVimeo("<p>página sem vídeo nenhum</p>"), null);
});

test("lê a configuração do Vimeo: prefere ficheiro directo, aceita HLS", () => {
  const comProgressivo = lerConfigVimeo({
    video: { duration: 1812.4, title: "Conferência" },
    request: { files: { progressive: [{ url: "https://x/f.mp4", quality: "540p" }], hls: { default_cdn: "a", cdns: { a: { url: "https://x/h.m3u8" } } } } },
  });
  assert.equal(comProgressivo.streamUrl, "https://x/f.mp4");
  assert.equal(comProgressivo.duracaoSeg, 1812, "duração arredondada");

  const soHls = lerConfigVimeo({
    video: { duration: 600 },
    request: { files: { hls: { default_cdn: "akfire", cdns: { akfire: { url: "https://x/h.m3u8" } } } } },
  });
  assert.equal(soHls.streamUrl, "https://x/h.m3u8");
});

test("configuração sem stream nenhum falha com mensagem, não em silêncio", () => {
  assert.throws(() => lerConfigVimeo({ video: { duration: 10 }, request: { files: {} } }), /stream/);
});

test("o custo bate certo com o preço por minuto", () => {
  // 30 minutos × 0,006 USD × 0,92 = 0,1656 €
  assert.ok(Math.abs(custoTranscricaoEur(1800) - 0.1656) < 0.0001);
  assert.equal(custoTranscricaoEur(0), 0);
});

/**
 * Regressão: o agente devolvia TOPIC_APPROVED quando não havia nada a transcrever — que é o
 * estado em que o run JÁ está. Rebentava com "Transição inválida: TOPIC_APPROVED →
 * TOPIC_APPROVED" e, como esse é o caminho de todas as notícias que não são conferências,
 * bloqueava o pipeline inteiro. Nenhum estado de saída pode ser o estado de entrada.
 */
test("nenhuma saída do agente de transcrição repete o estado de entrada", async () => {
  const { TRANSITIONS } = await import("../../lib/pipeline/orchestrator/state-machine");
  for (const saida of ["TRANSCRIBED", "FACTS_EXTRACTED", "ARCHIVED", "FAILED"] as const) {
    assert.ok(
      TRANSITIONS.TOPIC_APPROVED.includes(saida),
      `TOPIC_APPROVED → ${saida} tem de ser transição válida`,
    );
  }
  assert.ok(
    !TRANSITIONS.TOPIC_APPROVED.includes("TOPIC_APPROVED" as never),
    "TOPIC_APPROVED nunca pode transitar para si próprio",
  );
});
