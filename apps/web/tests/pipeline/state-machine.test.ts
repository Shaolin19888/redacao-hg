import { test } from "node:test";
import assert from "node:assert/strict";
import { PipelineState } from "@prisma/client";
import {
  TRANSITIONS,
  STATE_TO_NEXT_QUEUE,
  TERMINAL_STATES,
  canTransition,
  assertTransition,
  isTerminal,
  isHumanGate,
} from "../../lib/pipeline/orchestrator/state-machine";
import { QUEUE_NAMES } from "../../lib/pipeline/queues/definitions";

const ALL_STATES = Object.values(PipelineState) as PipelineState[];

test("todos os estados do enum têm transições declaradas", () => {
  for (const state of ALL_STATES) {
    assert.ok(state in TRANSITIONS, `Falta declarar transições para ${state}`);
  }
});

test("nenhuma transição aponta para um estado inexistente", () => {
  for (const [from, targets] of Object.entries(TRANSITIONS)) {
    for (const to of targets) {
      assert.ok(ALL_STATES.includes(to), `Transição ${from} → ${to} aponta para estado inválido`);
    }
  }
});

test("estados terminais não têm transições de saída", () => {
  for (const state of TERMINAL_STATES) {
    assert.equal(TRANSITIONS[state].length, 0, `${state} devia ser terminal mas tem saídas`);
    assert.ok(isTerminal(state));
  }
});

test("STATE_TO_NEXT_QUEUE só aponta para filas válidas", () => {
  for (const [state, queue] of Object.entries(STATE_TO_NEXT_QUEUE)) {
    assert.ok(QUEUE_NAMES.includes(queue as (typeof QUEUE_NAMES)[number]), `${state} → fila inválida ${queue}`);
  }
});

test("fluxo feliz principal é uma cadeia válida de transições", () => {
  const happyPath: PipelineState[] = [
    "COLLECTED", "DEDUP_OK", "RELEVANT", "FACTS_EXTRACTED", "FACTS_QA_OK",
    "WRITTEN", "EDITORIAL_QA_OK", "REVISED_OK", "SEO_QA_OK", "IMAGE_READY", "IMAGE_QA_OK",
    "WP_DRAFTED", "AWAITING_APPROVAL", "APPROVED_ALL", "PUBLISHED",
    "SOCIAL_DRAFTED", "SOCIAL_QA_OK", "DISTRIBUTED", "DONE",
  ];
  for (let i = 0; i < happyPath.length - 1; i++) {
    assert.ok(
      canTransition(happyPath[i], happyPath[i + 1]),
      `Transição em falta no fluxo feliz: ${happyPath[i]} → ${happyPath[i + 1]}`
    );
  }
});

test("re-entradas de rejeição estão ligadas", () => {
  assert.ok(canTransition("AWAITING_APPROVAL", "TEXT_REJECTED"));
  assert.ok(canTransition("TEXT_REJECTED", "WRITTEN"));
  assert.ok(canTransition("AWAITING_APPROVAL", "IMAGE_REJECTED"));
  assert.ok(canTransition("IMAGE_REJECTED", "IMAGE_READY"));
});

test("o gate humano é reconhecido", () => {
  assert.ok(isHumanGate("AWAITING_APPROVAL"));
  assert.ok(isHumanGate("PAUSED"));
  assert.ok(!isHumanGate("WRITTEN"));
});

test("estados que disparam trabalho automático podem falhar", () => {
  // Só os estados que enfileiram um job seguinte precisam de poder ir para FAILED;
  // estados de repouso humano (SAVED_DRAFT, PAUSED) aguardam decisão, não falham sozinhos.
  for (const state of Object.keys(STATE_TO_NEXT_QUEUE) as PipelineState[]) {
    assert.ok(canTransition(state, "FAILED"), `${state} dispara trabalho e devia poder ir para FAILED`);
  }
});

test("assertTransition lança em transições inválidas", () => {
  assert.throws(() => assertTransition("COLLECTED", "PUBLISHED"));
  assert.doesNotThrow(() => assertTransition("COLLECTED", "DEDUP_OK"));
});
