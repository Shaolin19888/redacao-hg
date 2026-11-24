import { test } from "node:test";
import assert from "node:assert/strict";
import { composeSocialText, stripCallToAction } from "../../lib/pipeline/social/compose-heuristic";
import { validateSocialPost } from "../../lib/pipeline/social/qa-heuristic";

// ── Composição ──

test("compõe texto com título e hashtags, SEM o link no corpo", () => {
  const text = composeSocialText({
    title: "Benfica vence o Porto no Estádio da Luz",
    lead: "Os encarnados triunfaram por dois a zero.",
    link: "https://hugogil.pt/artigo",
    tags: ["Benfica", "FC Porto"],
    charLimit: 63206,
  });
  assert.ok(text.includes("Benfica vence"));
  // O link NÃO entra no texto (Facebook recebe-o à parte; X/Threads anexam-no eles).
  assert.ok(!text.includes("https://hugogil.pt/artigo"));
  assert.ok(text.includes("#Benfica"));
});

test("limite do X (280): texto + link anexado ainda cabe", () => {
  const longTitle = "Benfica ".repeat(60); // muito longo
  const link = "https://hugogil.pt/a";
  const text = composeSocialText({
    title: longTitle,
    lead: null,
    link,
    tags: [],
    charLimit: 280,
  });
  assert.ok(!text.includes(link), "o link não entra no corpo");
  // O corpo deixa espaço para o link ser anexado pelas redes que precisam dele.
  assert.ok(text.length + link.length + 2 <= 280, `texto+link excede 280: ${text.length + link.length + 2}`);
});

test("hashtags sem acentos", () => {
  const text = composeSocialText({
    title: "Notícia",
    lead: null,
    link: "https://x.pt",
    tags: ["Seleção Nacional"],
    charLimit: 2200,
  });
  assert.ok(text.includes("#SelecaoNacional"));
});

test("copy curta: não despeja o lead no corpo", () => {
  const lead = "Os encarnados triunfaram por dois a zero num jogo dominado do início ao fim em Alvalade.";
  const text = composeSocialText({
    title: "Benfica vence o Porto na Luz",
    lead,
    link: "https://hugogil.pt/a",
    tags: ["Benfica"],
    charLimit: 280,
  });
  assert.ok(!text.includes("dominado do início ao fim"), "o lead não deve ser despejado na copy");
});

test("stripCallToAction remove apelos a clicar e URLs", () => {
  assert.equal(stripCallToAction("Benfica vence! Vê mais no site hugogil.pt").trim(), "Benfica vence!");
  assert.ok(!stripCallToAction("Grande jogo. Lê tudo em hugogil.pt agora").toLowerCase().includes("hugogil"));
  assert.ok(!stripCallToAction("Notícia forte https://hugogil.pt/x").includes("http"));
});

// ── Validação ──

test("valida post dentro do limite com link", () => {
  const r = validateSocialPost({ text: "Post normal", hasLink: true, charLimit: 280, platformLabel: "X" });
  assert.equal(r.passed, true);
  assert.equal(r.issues.length, 0);
});

test("rejeita post acima do limite (crítico)", () => {
  const r = validateSocialPost({ text: "x".repeat(300), hasLink: true, charLimit: 280, platformLabel: "X" });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.type === "limite" && i.severity === "critical"));
});

test("avisa sem link", () => {
  const r = validateSocialPost({ text: "Post", hasLink: false, charLimit: 280, platformLabel: "X" });
  assert.equal(r.passed, true); // aviso, não crítico
  assert.ok(r.issues.some((i) => i.type === "link"));
});

test("avisa clickbait", () => {
  const r = validateSocialPost({ text: "Não vais acreditar no que aconteceu", hasLink: true, charLimit: 280, platformLabel: "X" });
  assert.ok(r.issues.some((i) => i.type === "enganador"));
});
