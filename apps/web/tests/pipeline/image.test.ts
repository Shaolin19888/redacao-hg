import { test } from "node:test";
import assert from "node:assert/strict";
import { buildImageQuery, simulatedImage, officialImage, isOwnedImageDomain } from "../../lib/pipeline/image/search";
import { validateImage, type ImageQaInput } from "../../lib/pipeline/image/qa-heuristic";

// ── Pesquisa ──

test("buildImageQuery usa categoria e tags", () => {
  const q = buildImageQuery("Benfica", ["Liga Portugal"], "Título qualquer");
  assert.ok(q.includes("Benfica"));
  assert.ok(q.includes("Liga Portugal"));
  assert.ok(q.includes("futebol"));
});

test("buildImageQuery cai para palavras do título sem categoria/tags", () => {
  const q = buildImageQuery(null, [], "Sporting empata frente ao Braga");
  assert.ok(q.includes("futebol"));
  assert.ok(q.length > "futebol".length);
});

test("simulatedImage passa os requisitos técnicos", () => {
  const img = simulatedImage("Benfica futebol");
  const r = validateImage({ ...img, alt: "Imagem sobre o Benfica no jogo", isSynthetic: false });
  assert.equal(r.passed, true);
});

// ── QA ──

const ok: ImageQaInput = {
  url: "https://x.pt/a.jpg", alt: "Descrição adequada da imagem", width: 1200, height: 630,
  bytes: 200_000, format: "jpg", license: "cc-by 4.0", isSynthetic: false,
};

test("imagem válida passa", () => {
  const r = validateImage(ok);
  assert.equal(r.passed, true);
  assert.equal(r.issues.length, 0);
});

test("imagem sintética é rejeitada (crítico)", () => {
  const r = validateImage({ ...ok, isSynthetic: true });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.type === "sintetica" && i.severity === "critical"));
});

test("formato inválido é rejeitado", () => {
  const r = validateImage({ ...ok, format: "gif" });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.type === "formato"));
});

test("sem url é rejeitado", () => {
  const r = validateImage({ ...ok, url: "" });
  assert.equal(r.passed, false);
});

test("dimensões pequenas avisam mas não rejeitam", () => {
  const r = validateImage({ ...ok, width: 600, height: 400 });
  assert.equal(r.passed, true);
  assert.ok(r.issues.some((i) => i.type === "dimensoes" && i.severity === "warning"));
});

test("licença em falta avisa", () => {
  const r = validateImage({ ...ok, license: null });
  assert.ok(r.issues.some((i) => i.type === "licenca"));
});

test("alt curto avisa", () => {
  const r = validateImage({ ...ok, alt: "x" });
  assert.ok(r.issues.some((i) => i.type === "alt"));
});

// ── Imagem oficial autorizada (site do Benfica) ──

test("isOwnedImageDomain reconhece o site oficial do Benfica", () => {
  assert.ok(isOwnedImageDomain("https://www.slbenfica.pt"));
  assert.ok(!isOwnedImageDomain("https://www.record.pt"));
  assert.ok(!isOwnedImageDomain(null));
});

test("officialImage marca licença autorizada e infere formato", () => {
  const img = officialImage("https://www.slbenfica.pt/media/foto.jpg", "SL Benfica");
  assert.equal(img.source, "oficial");
  assert.equal(img.format, "jpg");
  assert.ok(img.license?.includes("Autorizado"));
});

test("officialImage assume jpg quando a URL não tem extensão", () => {
  const img = officialImage("https://www.slbenfica.pt/-/media/imagem.ashx", "SL Benfica");
  assert.equal(img.format, "jpg");
});

test("imagem oficial do Benfica passa a QA (não sintética, licenciada)", () => {
  const img = officialImage("https://www.slbenfica.pt/media/foto.jpg", "SL Benfica");
  const r = validateImage({
    url: img.url, alt: "Foto oficial do SL Benfica sobre o tema",
    width: img.width, height: img.height, bytes: img.bytes,
    format: img.format, license: img.license, isSynthetic: false,
  });
  assert.equal(r.passed, true);
  assert.ok(!r.issues.some((i) => i.type === "licenca"));
});
