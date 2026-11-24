import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirEntrada, ignorarNaEntrada } from "../../lib/pipeline/intake/video-pages";

const R = "https://www.record.pt";

test("secções que nunca deram texto ficam fora, seja qual for o título", () => {
  const casos = [
    [`${R}/multimedia/record-na-hora/detalhe/benfica-recusa-proposta`, "Benfica recusou proposta do Fenerbahçe por Pavlidis"],
    [`${R}/multimedia/fotogalerias/detalhe/as-imagens`, "Benfica: «As imagens do treino de hoje»"],
    [`${R}/futebol/em-direto/detalhe/benfica-hearts`, "Benfica-Hearts, em direto"],
    [`${R}/multimedia/infografias/detalhe/numeros`, "Os números do Benfica"],
  ];
  for (const [url, t] of casos) {
    const d = decidirEntrada(url, t);
    assert.equal(d.ignorar, true, url);
    assert.equal(d.motivo, "seccao-sem-texto");
  }
});

test("vídeo com voz primária passa: são as que o editor mandou escrever", () => {
  const querias = [
    "Benfica chega ao Algarve: fotografias, autógrafos e o pedido de um adepto",
    "Marco Silva: «Leandro Barreiro perdeu alguns quilos mas está a lutar pelo lugar»",
    "«Marco Silva resumiu o primeiro jogo como inaceitável. A resposta foi dada»",
    "Marco Silva: «Se não contasse com António Silva no Benfica, já o tinha dito»",
  ];
  for (const t of querias) {
    assert.equal(ignorarNaEntrada(`${R}/multimedia/videos/detalhe/seja-o-que-for`, t), false, t);
  }
});

test("vídeo sem voz primária nem Benfica fica fora", () => {
  const d = decidirEntrada(`${R}/multimedia/videos/detalhe/golo-bonito`, "Golo bonito no campeonato turco");
  assert.equal(d.ignorar, true);
  assert.equal(d.motivo, "video-sem-voz-primaria");
});

test("notícias escritas passam sempre, mesmo falando de vídeo ou sem citação", () => {
  const casos = [
    [`${R}/futebol/futebol-nacional/liga-portugal/benfica/detalhe/o-video-do-treino`, "O vídeo que o Benfica publicou"],
    ["https://www.abola.pt/nnh/2026-08-04/terceira-camisola/1050231", "Benfica apresenta terceira camisola"],
    ["https://www.slbenfica.pt/pt-pt/agora/noticias/2026/08/04/renovacao", "Afonso Bandeira renova até 2030"],
    [`${R}/futebol/detalhe/mercado`, "Trabzonspor confirma negociações com Salah"],
  ];
  for (const [url, t] of casos) assert.equal(ignorarNaEntrada(url, t), false, url);
});

test("só o caminho decide, não o domínio nem a query", () => {
  assert.equal(ignorarNaEntrada("https://videos.record.pt/futebol/detalhe/x", "Notícia normal"), false);
  assert.equal(ignorarNaEntrada(`${R}/futebol/detalhe/x?ref=/videos/`, "Notícia normal"), false);
});

test("aguenta lixo sem rebentar", () => {
  assert.equal(ignorarNaEntrada("", "t"), false);
  assert.equal(ignorarNaEntrada("nao-e-um-url", "t"), false);
  assert.equal(ignorarNaEntrada("simulacao://benfica-ramirez-a-x1", "Benfica prepara proposta"), false);
});
