import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEditReply } from "../../lib/pipeline/telegram/parse-edit";

test("sem prefixo, tudo é corpo (compatível com o que já existia)", () => {
  const r = parseEditReply("O Benfica venceu o Belenenses por 5-1 na Luz.");
  assert.equal(r.title, null);
  assert.equal(r.body, "O Benfica venceu o Belenenses por 5-1 na Luz.");
});

test("«Título: X» sozinho muda só o título", () => {
  const r = parseEditReply("Título: Benfica goleia e Marco Silva sorri");
  assert.equal(r.title, "Benfica goleia e Marco Silva sorri");
  assert.equal(r.body, null);
});

test("título na primeira linha e texto por baixo muda os dois", () => {
  const r = parseEditReply("Título: Novo título\n\nO Benfica venceu.\n\nSegundo parágrafo.");
  assert.equal(r.title, "Novo título");
  assert.equal(r.body, "O Benfica venceu.\n\nSegundo parágrafo.");
});

test("aceita variantes do prefixo (sem acento, maiúsculas, travessão)", () => {
  for (const p of ["Titulo: X do teste", "TÍTULO: X do teste", "título - X do teste", "título:  X do teste"]) {
    assert.equal(parseEditReply(p).title, "X do teste", `falhou em: ${p}`);
  }
});

test("um texto que só menciona a palavra título a meio não é confundido", () => {
  const r = parseEditReply("O clube anunciou o título de campeão nacional esta noite.");
  assert.equal(r.title, null);
  assert.ok(r.body?.startsWith("O clube anunciou"));
});

test("resposta vazia não produz nada", () => {
  const r = parseEditReply("   ");
  assert.equal(r.title, null);
  assert.equal(r.body, null);
});
