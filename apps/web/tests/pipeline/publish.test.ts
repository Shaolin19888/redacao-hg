import { test } from "node:test";
import assert from "node:assert/strict";
import { resolvePublishAction } from "../../lib/pipeline/wordpress/publish-decide";
import { canTransition } from "../../lib/pipeline/orchestrator/state-machine";

test("publica a sério só com modo real e post existente", () => {
  assert.equal(resolvePublishAction({ wpMode: "real", wpPostId: 123 }), "real");
});

test("sem post real → simulado mesmo em modo real", () => {
  assert.equal(resolvePublishAction({ wpMode: "real", wpPostId: null }), "simulado");
});

test("modo simulado → simulado sempre", () => {
  assert.equal(resolvePublishAction({ wpMode: "simulado", wpPostId: 123 }), "simulado");
  assert.equal(resolvePublishAction({ wpMode: "simulado", wpPostId: null }), "simulado");
});

test("só se publica a partir de APPROVED_ALL", () => {
  // Garantia estrutural: PUBLISHED só é alcançável de APPROVED_ALL (gate humano a montante).
  assert.ok(canTransition("APPROVED_ALL", "PUBLISHED"));
  assert.ok(!canTransition("WP_DRAFTED", "PUBLISHED"));
  assert.ok(!canTransition("AWAITING_APPROVAL", "PUBLISHED"));
  assert.ok(!canTransition("SEO_QA_OK", "PUBLISHED"));
});
