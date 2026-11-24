import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseGscPagesCsv, normalizeUrl } from "../../lib/pipeline/audit/gsc-csv";
import { scoreArticle, detectCannibalization } from "../../lib/pipeline/audit/score-data";
import { buildAuditCsv } from "../../lib/pipeline/audit/report";
import type { AuditArticleInput } from "../../lib/pipeline/audit/types";

const NOW = new Date(2026, 6, 1); // 1 de julho de 2026
const OLD = new Date(2023, 0, 1); // > 16 meses
const RECENT = new Date(2026, 5, 1); // 1 mês

function art(over: Partial<AuditArticleInput>): AuditArticleInput {
  return {
    wpPostId: 1,
    url: "https://hugogil.pt/a",
    title: "Título",
    publishedAt: OLD,
    clicks: null,
    impressions: null,
    contentChars: 2000,
    ...over,
  };
}

// --- CSV do GSC ---

test("parseCsv respeita vírgulas dentro de aspas", () => {
  const rows = parseCsv(`a,b\n"x, y",z`);
  assert.deepEqual(rows, [["a", "b"], ["x, y", "z"]]);
});

test("parseGscPagesCsv lê cabeçalhos PT e soma cliques/impressões", () => {
  const csv = `Página principal,Cliques,Impressões,CTR,Posição\nhttps://hugogil.pt/artigo-1,10,1.234,"1,2%",5\nhttps://hugogil.pt/artigo-2,0,0,0%,0`;
  const map = parseGscPagesCsv(csv);
  assert.equal(map.get("https://hugogil.pt/artigo-1")?.clicks, 10);
  assert.equal(map.get("https://hugogil.pt/artigo-1")?.impressions, 1234);
  assert.equal(map.get("https://hugogil.pt/artigo-2")?.impressions, 0);
});

test("parseGscPagesCsv lê cabeçalhos EN", () => {
  const csv = `Top pages,Clicks,Impressions\nhttps://hugogil.pt/x,3,50`;
  const map = parseGscPagesCsv(csv);
  assert.equal(map.get("https://hugogil.pt/x")?.clicks, 3);
  assert.equal(map.get("https://hugogil.pt/x")?.impressions, 50);
});

test("parseGscPagesCsv rejeita um CSV sem as colunas essenciais", () => {
  assert.throws(() => parseGscPagesCsv(`foo,bar\n1,2`), /não reconhecido/);
});

test("normalizeUrl ignora barra final, maiúsculas e query", () => {
  assert.equal(normalizeUrl("https://HugoGil.pt/Artigo/?x=1"), "https://hugogil.pt/artigo");
});

// --- Camada 1: pontuação por dados ---

test("zero impressões em 16 meses e antigo → DELETE, sem IA", () => {
  const s = scoreArticle(art({ clicks: 0, impressions: 0, publishedAt: OLD }), NOW);
  assert.equal(s.suggestedDecision, "DELETE");
  assert.equal(s.needsAI, false);
  assert.equal(s.indexedGuess, false);
});

test("tem cliques → KEEP", () => {
  const s = scoreArticle(art({ clicks: 40, impressions: 500 }), NOW);
  assert.equal(s.suggestedDecision, "KEEP");
  assert.equal(s.needsAI, false);
  assert.ok(s.score < 0);
});

test("impressões sem cliques → zona cinzenta (IMPROVE, needsAI)", () => {
  const s = scoreArticle(art({ clicks: 0, impressions: 300 }), NOW);
  assert.equal(s.suggestedDecision, "IMPROVE");
  assert.equal(s.needsAI, true);
});

test("zero impressões mas recente → KEEP (cedo demais)", () => {
  const s = scoreArticle(art({ clicks: 0, impressions: 0, publishedAt: RECENT }), NOW);
  assert.equal(s.suggestedDecision, "KEEP");
});

test("sem dados de tráfego nunca marca DELETE; curto+antigo vai à IA", () => {
  const thinOld = scoreArticle(art({ clicks: null, impressions: null, contentChars: 400, publishedAt: OLD }), NOW);
  assert.equal(thinOld.suggestedDecision, "IMPROVE");
  assert.equal(thinOld.needsAI, true);
  const longNoData = scoreArticle(art({ clicks: null, impressions: null, contentChars: 4000, publishedAt: OLD }), NOW);
  assert.equal(longNoData.suggestedDecision, "KEEP");
  assert.notEqual(thinOld.suggestedDecision, "DELETE");
});

test("detectCannibalization agrupa títulos quase iguais e ignora distintos", () => {
  const g = detectCannibalization([
    { wpPostId: 1, title: "Benfica vence o FC Porto por dois a zero no clássico" },
    { wpPostId: 2, title: "Benfica vence o FC Porto por 2-0 no clássico da jornada" },
    { wpPostId: 3, title: "Sporting anuncia novo treinador para a próxima época" },
  ]);
  assert.ok(g.has(1) && g.has(2), "os dois clássicos deviam agrupar");
  assert.equal(g.get(1), g.get(2));
  assert.ok(!g.has(3), "o tema distinto não agrupa");
});

// --- CSV do relatório ---

test("buildAuditCsv escreve o cabeçalho e traduz decisão/indexada", () => {
  const csv = buildAuditCsv([
    {
      url: "https://hugogil.pt/x",
      title: 'Título com "aspas", e vírgula',
      publishedAt: new Date(Date.UTC(2022, 2, 5)),
      clicks16m: 0,
      impressions16m: 0,
      indexedGuess: false,
      suggestedDecision: "DELETE",
      reason: "Zero impressões",
    },
  ]);
  const lines = csv.split("\n");
  assert.match(lines[0], /^URL,Título,Data,Cliques 16m,Impressões 16m,Indexada,Decisão sugerida,Motivo$/);
  assert.match(lines[1], /2022-03-05/);
  assert.match(lines[1], /Apagar/);
  assert.match(lines[1], /não/);
  assert.match(lines[1], /"Título com ""aspas"", e vírgula"/);
});

test("redirectTargetSlug aponta cada tema à categoria certa (evita soft-404)", () => {
  const { redirectTargetSlug, redirectTargetUrl } = require("../../lib/pipeline/audit/redirect-map");
  assert.equal(redirectTargetSlug("Futsal: Benfica vence a fase regular"), "futsal-modalidades");
  assert.equal(redirectTargetSlug("Hóquei de patins: arrancado a ferros"), "hoquei-modalidades");
  assert.equal(redirectTargetSlug("Voleibol: Nós somos Bicampeões"), "modalidades");
  assert.equal(redirectTargetSlug("SL Benfica domina a convocatória dos Sub-16"), "formacao-2");
  assert.equal(redirectTargetSlug("Mark Clattenburg é o árbitro Juventus-Benfica"), "arbitragem");
  assert.equal(redirectTargetSlug("David Luiz quer regressar ao SL Benfica"), "mercado");
  assert.equal(redirectTargetSlug("SC Braga 0-1 SL Benfica – Golos"), "futebol"); // relato → Futebol
  assert.equal(redirectTargetSlug("Awesome fashion promo video"), ""); // lixo do tema → homepage
  assert.equal(redirectTargetUrl("Studio photography secrets"), "https://hugogil.pt/");
});
