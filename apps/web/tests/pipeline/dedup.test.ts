import { test } from "node:test";
import assert from "node:assert/strict";
import { simhash, hammingDistance, tokenize } from "../../lib/pipeline/dedup/simhash";
import { decideDuplicate, isOfficialBenficaSource } from "../../lib/pipeline/dedup/decide";

test("isOfficialBenficaSource distingue o site oficial", () => {
  assert.ok(isOfficialBenficaSource("https://www.slbenfica.pt"));
  assert.ok(isOfficialBenficaSource("https://www.slbenfica.pt/pt-pt/agora"));
  assert.ok(!isOfficialBenficaSource("https://www.record.pt"));
  assert.ok(!isOfficialBenficaSource(null));
});

test("tokenize remove acentos, pontuação e tokens curtos", () => {
  const t = tokenize("Benfica está atento ao médio! (River Plate)");
  assert.ok(t.includes("benfica"));
  assert.ok(t.includes("medio"));
  assert.ok(t.includes("river"));
  assert.ok(!t.includes("ao")); // token curto removido
});

test("simhash é determinístico e devolve 16 hex", () => {
  const a = simhash("Benfica contrata médio argentino do River Plate");
  const b = simhash("Benfica contrata médio argentino do River Plate");
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test("textos idênticos têm distância 0", () => {
  const a = simhash("Sporting vence o Porto por dois a zero no Dragão");
  const b = simhash("Sporting vence o Porto por dois a zero no Dragão");
  assert.equal(hammingDistance(a, b), 0);
});

test("repost quase-verbatim tem distância muito pequena", () => {
  const a = simhash("Benfica vence o Porto por 2-0 no Estádio da Luz com golos de Pavlidis e Aktürkoglu");
  const b = simhash("Benfica vence o Porto por 2-0 no Estádio da Luz, com golos de Pavlidis e Aktürkoglu.");
  const d = hammingDistance(a, b);
  assert.ok(d <= 6, `repost quase-verbatim devia ter distância baixa: ${d}`);
});

test("paráfrase de outra fonte NÃO fica dentro do limiar de dedup", () => {
  // Mesmo tema, palavras diferentes: é história relacionada (agrupar), não duplicado.
  const a = simhash("Benfica está atento ao médio argentino do River Plate");
  const b = simhash("Encarnados seguem médio argentino do River Plate");
  const d = hammingDistance(a, b);
  assert.ok(d > 6, `paráfrase não devia ser tratada como duplicado: ${d}`);
});

test("notícias de temas diferentes ficam distantes", () => {
  const a = simhash("Benfica contrata médio argentino do River Plate");
  const b = simhash("Governo aprova orçamento e sobe salário mínimo em Portugal");
  const d = hammingDistance(a, b);
  assert.ok(d >= 18, `distância demasiado baixa para temas diferentes: ${d}`);
});

const D = (id: string, title: string, text?: string) => ({ id, simhash: simhash(text ?? title), title, text: text ?? title });

test("decideDuplicate apanha título exacto", () => {
  const dec = decideDuplicate(
    D("t", "Benfica vence o Porto!"),
    [D("o", "benfica vence o porto")]
  );
  assert.ok(dec.isDuplicate);
  assert.equal(dec.reason, "titulo-exacto");
  assert.equal(dec.duplicateOfId, "o");
});

test("decideDuplicate apanha repost quase-verbatim por simhash", () => {
  const target = "Sporting empata com o Braga a uma bola em Alvalade em jogo da nona jornada da Liga";
  const near = "Sporting empata com o Braga a uma bola em Alvalade em jogo da nona jornada da Liga portuguesa";
  const dec = decideDuplicate(
    D("t", target),
    [D("o", "outro título diferente qualquer aqui", near)]
  );
  assert.ok(dec.isDuplicate);
  assert.equal(dec.reason, "simhash");
});

test("decideDuplicate apanha MESMO TEMA por paráfrase com jogador partilhado (regra: sem notícias iguais)", () => {
  const target = "Benfica prepara proposta pelo médio argentino Nicolás Ramírez do River Plate";
  const near = "Encarnados avançam por Ramírez, jovem médio do River Plate";
  const dec = decideDuplicate(D("t", target), [D("o", near)]);
  assert.ok(dec.isDuplicate, "mesma história sobre Ramírez não deve gerar dois artigos");
  assert.equal(dec.reason, "mesmo-tema");
});

test("decideDuplicate NÃO merge jogadores/temas diferentes do mesmo clube", () => {
  const target = "Benfica prepara proposta pelo médio argentino Nicolás Ramírez do River Plate";
  const outro = "Benfica renova contrato do guarda-redes Anatoliy Trubin até 2029";
  const dec = decideDuplicate(D("t", target), [D("o", outro)]);
  assert.ok(!dec.isDuplicate, "jogadores diferentes não são a mesma notícia");
});

test("decideDuplicate não marca falso positivo em temas totalmente diferentes", () => {
  const dec = decideDuplicate(
    D("t", "Benfica contrata médio Nicolás Ramírez do River Plate"),
    [D("o", "Governo sobe salário mínimo em Portugal")]
  );
  assert.ok(!dec.isDuplicate);
  assert.equal(dec.duplicateOfId, null);
});

test("decideDuplicate ignora o próprio candidato", () => {
  const dec = decideDuplicate(D("mesmo", "Benfica vence o Porto"), [D("mesmo", "Benfica vence o Porto")]);
  assert.ok(!dec.isDuplicate);
});
