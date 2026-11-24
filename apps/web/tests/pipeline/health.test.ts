import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateHealth, type HealthMetrics } from "../../lib/pipeline/health/evaluate";

const base: HealthMetrics = {
  wpConfigured: true,
  wpReachable: true,
  failedRuns: 0,
  stuckRuns: 0,
  sourcesWithError: 0,
  queueWaiting: 0,
  queueFailed: 0,
  publishedLast7d: 3,
  gscConfigured: false,
};

test("tudo bem → estado geral ok", () => {
  const r = evaluateHealth(base);
  assert.equal(r.status, "ok");
  assert.ok(r.checks.find((c) => c.name === "WordPress")?.status === "ok");
});

test("WordPress inacessível → critical", () => {
  const r = evaluateHealth({ ...base, wpReachable: false });
  assert.equal(r.status, "critical");
});

test("WordPress não configurado → info, não derruba o geral", () => {
  const r = evaluateHealth({ ...base, wpConfigured: false, wpReachable: null });
  assert.equal(r.status, "ok");
  assert.equal(r.checks.find((c) => c.name === "WordPress")?.status, "info");
});

test("poucos runs falhados → warning", () => {
  const r = evaluateHealth({ ...base, failedRuns: 2 });
  assert.equal(r.status, "warning");
});

test("muitos runs falhados → critical", () => {
  const r = evaluateHealth({ ...base, failedRuns: 15 });
  assert.equal(r.status, "critical");
});

test("jobs na dead-letter → warning", () => {
  const r = evaluateHealth({ ...base, queueFailed: 3 });
  assert.equal(r.status, "warning");
});

test("backlog elevado de filas → warning", () => {
  const r = evaluateHealth({ ...base, queueWaiting: 100 });
  assert.equal(r.status, "warning");
});

test("fontes com erro → warning", () => {
  const r = evaluateHealth({ ...base, sourcesWithError: 1 });
  assert.equal(r.status, "warning");
});

test("GSC configurado → check ok", () => {
  const r = evaluateHealth({ ...base, gscConfigured: true });
  assert.equal(r.checks.find((c) => c.name === "Indexação Google")?.status, "ok");
});

test("relatório inclui publicados como info", () => {
  const r = evaluateHealth({ ...base, publishedLast7d: 5 });
  const c = r.checks.find((x) => x.name === "Publicados (7 dias)");
  assert.equal(c?.status, "info");
  assert.equal(c?.value, 5);
});
