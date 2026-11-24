import { test } from "node:test";
import assert from "node:assert/strict";
import { runEditorialQa, longestVerbatimRun, findCopiedPhrases, extractNumbers } from "../../lib/pipeline/editorial/qa-heuristic";

test("findCopiedPhrases devolve a frase copiada (texto original) para o Writer evitar", () => {
  const source = "O Benfica prepara uma proposta pelo médio argentino Nicolás Ramírez do River Plate nas próximas semanas.";
  const article = "Fontes indicam que o Benfica prepara uma proposta pelo médio argentino Nicolás Ramírez do River Plate. O clube avança.";
  const phrases = findCopiedPhrases(article, [source]);
  assert.ok(phrases.length >= 1);
  assert.ok(phrases[0].toLowerCase().includes("prepara uma proposta"));
});

test("findCopiedPhrases vazio quando não há cópia", () => {
  assert.equal(findCopiedPhrases("Texto totalmente distinto e original aqui escrito.", ["Fonte sem nada em comum de todo."]).length, 0);
});

test("runEditorialQa expõe copiedPhrases quando há cópia", () => {
  const source = "O treinador do Benfica renovou o contrato até 2028 e prolongou o vínculo por mais duas épocas completas.";
  const r = runEditorialQa({
    body: "O treinador do Benfica renovou o contrato até 2028 e prolongou o vínculo por mais duas épocas completas hoje.",
    wordCount: 220,
    confirmedFactTexts: [],
    sourceTexts: [source],
    hasSensitiveFacts: false,
  });
  assert.ok(r.copiedPhrases.length >= 1);
});
import { generateSeo, toSlug, extractTags } from "../../lib/pipeline/seo/generate-heuristic";

// ── Editorial QA: cópia ──

test("longestVerbatimRun detecta sequência copiada", () => {
  const source = "O Benfica prepara uma proposta pelo médio argentino do River Plate nas próximas semanas";
  const article = "Segundo apurámos, o Benfica prepara uma proposta pelo médio argentino do River Plate para reforçar";
  assert.ok(longestVerbatimRun(article, [source]) >= 8);
});

test("longestVerbatimRun baixo para texto reescrito", () => {
  const source = "O Benfica prepara uma proposta pelo médio argentino do River Plate";
  const article = "Os encarnados avançam para contratar o meio-campista sul-americano";
  assert.ok(longestVerbatimRun(article, [source]) < 8);
});

test("Editorial QA rejeita cópia (crítico)", () => {
  const source = "O Sporting empatou a uma bola frente ao Braga em Alvalade na nona jornada da Liga";
  const r = runEditorialQa({
    body: "Notícia: o Sporting empatou a uma bola frente ao Braga em Alvalade na nona jornada da Liga, disseram.",
    wordCount: 250,
    confirmedFactTexts: [source],
    sourceTexts: [source],
    hasSensitiveFacts: false,
  });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.type === "copia" && i.severity === "critical"));
});

test("Editorial QA NÃO acusa cópia numa declaração entre aspas reproduzida da fonte", () => {
  const decl = "Estamos muito felizes por representar este clube e vamos dar tudo em cada jogo desta temporada";
  const source = `O presidente afirmou: «${decl}», disse aos jornalistas na conferência de imprensa de ontem.`;
  const r = runEditorialQa({
    body: `O líder do clube foi claro nas suas palavras. «${decl}», declarou o dirigente. A mensagem foi bem recebida pelos adeptos presentes no estádio.`,
    wordCount: 220,
    confirmedFactTexts: [decl],
    sourceTexts: [source],
    hasSensitiveFacts: false,
  });
  assert.equal(r.issues.some((i) => i.type === "copia"), false);
});

test("Editorial QA NÃO acusa cópia num alinhamento de nomes/resultados coincidente", () => {
  const source = "Benfica FC Porto Sporting Sp Braga Vitória Guimarães Boavista Rio Ave Casa Pia Estoril";
  const r = runEditorialQa({
    body: "Benfica FC Porto Sporting Sp Braga Vitória Guimarães Boavista Rio Ave Casa Pia Estoril entram todos.",
    wordCount: 220,
    confirmedFactTexts: [],
    sourceTexts: [source],
    hasSensitiveFacts: false,
  });
  assert.equal(r.issues.some((i) => i.type === "copia"), false);
});

// ── Editorial QA: invenção ──

test("extractNumbers apanha os números", () => {
  assert.deepEqual(extractNumbers("venceu por 2-0 com 3 golos em 90 minutos"), ["2", "0", "3", "90"]);
});

test("Editorial QA rejeita número inventado (crítico)", () => {
  const r = runEditorialQa({
    body: "O jogador tem 22 anos e custou 15 milhões de euros ao clube, um valor recorde para a formação.",
    wordCount: 220,
    confirmedFactTexts: ["O jogador tem 22 anos"], // 15 não está nos factos
    sourceTexts: ["contexto"],
    hasSensitiveFacts: false,
  });
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.type === "invencao"));
});

test("Editorial QA passa quando os números têm suporte", () => {
  const r = runEditorialQa({
    body: "Texto original e reescrito sobre o tema com contexto suficiente para leitura fluida no site do clube da capital sem qualquer número fora dos factos confirmados pela redação e pelas fontes citadas ao longo da peça jornalística aqui apresentada com todo o cuidado editorial necessário para garantir rigor absoluto e zero invenções de qualquer espécie durante a redação final.",
    wordCount: 220,
    confirmedFactTexts: ["contexto do tema"],
    sourceTexts: ["fonte distinta"],
    hasSensitiveFacts: false,
  });
  assert.equal(r.passed, true);
});

test("Editorial QA avisa comprimento abaixo do mínimo", () => {
  const r = runEditorialQa({
    body: "Texto curto sobre o tema.",
    wordCount: 50,
    confirmedFactTexts: ["facto"],
    sourceTexts: ["outra coisa completamente diferente"],
    hasSensitiveFacts: false,
  });
  assert.ok(r.issues.some((i) => i.type === "comprimento" && i.severity === "warning"));
  assert.equal(r.passed, true); // aviso, não crítico
});

test("Editorial QA sinaliza factos sensíveis", () => {
  const r = runEditorialQa({
    body: "Texto sobre o tema sem cópia nem números.",
    wordCount: 250,
    confirmedFactTexts: ["facto"],
    sourceTexts: ["outra coisa"],
    hasSensitiveFacts: true,
  });
  assert.ok(r.issues.some((i) => i.type === "sensivel"));
});

// ── SEO QA ──

test("toSlug produz slug limpo sem acentos", () => {
  assert.equal(toSlug("Benfica prepara proposta pelo médio!"), "benfica-prepara-proposta-pelo-medio");
});

test("extractTags reconhece clubes e competições", () => {
  const tags = extractTags("Benfica na Liga Portugal", ["jogo do Sporting"]);
  assert.ok(tags.includes("Benfica"));
  assert.ok(tags.includes("Liga Portugal"));
  assert.ok(tags.includes("Sporting"));
});

test("extractTags extrai nomes próprios (jogadores) além dos clubes", () => {
  const tags = extractTags("Estrasburgo pode desviar Ibrahima Ba do Benfica", [
    "O Benfica segue Ibrahima Ba, jogado do Estrasburgo",
  ]);
  assert.ok(tags.includes("Benfica"));
  assert.ok(tags.some((t) => t.includes("Ibrahima Ba")));
  // Não deve apanhar inícios de frase / preposições capitalizadas como tags.
  assert.ok(!tags.includes("Segundo"));
});

test("generateSeo gera todos os campos e limita comprimentos", () => {
  const seo = generateSeo({
    title: "Benfica prepara proposta pelo médio argentino Nicolás Ramírez do River Plate",
    lead: "O Benfica segue de perto o médio de 22 anos e prepara uma proposta nas próximas semanas segundo a imprensa.",
    factTexts: ["O clube quer reforçar o meio-campo"],
    category: "Benfica",
  });
  assert.ok(seo.fields.slug.length > 0);
  assert.ok(seo.fields.seoTitle.length <= 60);
  assert.ok(seo.fields.discoverTitle.length <= 70);
  assert.equal(seo.fields.category, "Benfica");
  assert.ok(seo.fields.tags.includes("Benfica"));
});

test("slug nunca corta a última palavra a meio nem acaba em conector", () => {
  const { generateSeo } = require("../../lib/pipeline/seo/generate-heuristic");
  const casos = [
    "Barreiro fica em casa por doença e Benfica viaja com menos uma peça para o play-off",
    "O Benfica arranca a caminho da Liga Europa e a estreia é já na Suíça frente ao St. Gallen",
    "Um sueco gigante para a baliza das águias: Thulin chega ao andebol do Benfica",
  ];
  const CONECTORES = new Set(["de","do","da","dos","das","e","a","o","para","com","em","no","na","ao","por","que"]);
  for (const t of casos) {
    const slug: string = generateSeo({ title: t, lead: null, factTexts: [], category: null }).fields.slug;
    assert.ok(slug.length <= 70, `slug ${slug.length} chars`);
    const ultima = slug.split("-").pop() as string;
    // A última palavra tem de existir no título original (não é um fragmento cortado).
    const palavrasTitulo = t.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").split(/[^a-z0-9]+/);
    assert.ok(palavrasTitulo.includes(ultima), `"${ultima}" foi cortada a meio em: ${slug}`);
    assert.ok(!CONECTORES.has(ultima), `slug acaba em conector "${ultima}": ${slug}`);
  }
});

test("slug curto não é alterado", () => {
  const { generateSeo } = require("../../lib/pipeline/seo/generate-heuristic");
  const slug: string = generateSeo({ title: "Benfica vence o Sporting", lead: null, factTexts: [], category: null }).fields.slug;
  assert.equal(slug, "benfica-vence-o-sporting");
});
