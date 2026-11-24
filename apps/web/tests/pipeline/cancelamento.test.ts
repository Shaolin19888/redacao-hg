import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, STATE_TO_NEXT_QUEUE, isTerminal } from "../../lib/pipeline/orchestrator/state-machine";

/**
 * O cancelamento marca o run como ARCHIVED. O problema real observado: o passo que já estava
 * a decorrer terminava, sobrepunha-se ao ARCHIVED e o pipeline seguia sozinho até criar
 * rascunho no site e enviar cartão de aprovação — de uma notícia que o editor tinha
 * cancelado. Num dos casos escreveu o artigo três vezes DEPOIS do cancelamento.
 *
 * Estes testes fixam as garantias da máquina de estados em que a correcção assenta.
 */

test("ARCHIVED é terminal: nada avança a partir dele", () => {
  assert.ok(isTerminal("ARCHIVED"));
  assert.equal(STATE_TO_NEXT_QUEUE.ARCHIVED, undefined, "ARCHIVED não pode enfileirar trabalho");
});

test("de ARCHIVED não há caminho de volta para o fluxo de escrita", () => {
  for (const destino of ["WRITTEN", "FACTS_EXTRACTED", "WP_DRAFTED", "AWAITING_APPROVAL", "PUBLISHED"] as const) {
    assert.ok(!canTransition("ARCHIVED", destino), `ARCHIVED → ${destino} não pode ser válido`);
  }
});

test("cancelar é possível a partir dos estados onde o editor está à espera", () => {
  for (const origem of ["AWAITING_TOPIC_APPROVAL", "AWAITING_TRANSCRIPT_APPROVAL", "AWAITING_APPROVAL"] as const) {
    assert.ok(canTransition(origem, "ARCHIVED"), `${origem} → ARCHIVED tem de ser possível`);
  }
});

test("nenhum estado terminal enfileira trabalho seguinte", () => {
  for (const [estado, fila] of Object.entries(STATE_TO_NEXT_QUEUE)) {
    if (isTerminal(estado as never)) {
      assert.equal(fila, undefined, `${estado} é terminal mas enfileira ${fila}`);
    }
  }
});
