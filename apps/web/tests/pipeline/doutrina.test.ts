import { test } from "node:test";
import assert from "node:assert/strict";
import { citesMediaOutlet, titleAttributesToOutlet, stripMediaAttribution } from "../../lib/pipeline/editorial/media-outlets";

// --- Regra 3: o título nunca atribui a notícia a um órgão ---

test("atribuição antes do órgão reprova (segundo a Record)", () => {
  const r = citesMediaOutlet("Benfica prepara proposta pelo médio, segundo a Record");
  assert.equal(r.kind, "atribuicao");
  assert.equal(r.outlet, "Record");
  assert.equal(titleAttributesToOutlet("Benfica prepara proposta, segundo a Record"), true);
});

test("atribuição depois do órgão reprova (Record avança / A Bola garante)", () => {
  assert.equal(titleAttributesToOutlet("Record avança acordo fechado com o médio"), true);
  assert.equal(titleAttributesToOutlet("A Bola garante que o negócio está fechado"), true);
  assert.equal(titleAttributesToOutlet("O Jogo escreve que há acordo"), true);
});

// --- Falsos positivos que NÃO podem acontecer ---

test("«a bola» minúscula não é o jornal A Bola", () => {
  const r = citesMediaOutlet("Benfica joga a bola para a frente e decide o jogo");
  assert.equal(r.cites, false, "«a bola» e «o jogo» minúsculos não são órgãos");
});

test("«recorde» não é o jornal Record", () => {
  assert.equal(citesMediaOutlet("Pedro Buaró bate recorde nacional e ibérico").cites, false);
});

test("«segundo a bola» não casa com o jornal (sensível a maiúsculas)", () => {
  assert.equal(citesMediaOutlet("Segundo a bola parada, o Benfica melhorou").cites, false);
});

// --- Menção legítima (crítica de imprensa, §6.5) é aviso, não reprovação ---

test("mencionar um órgão sem lhe atribuir a notícia é menção, não atribuição", () => {
  const r = citesMediaOutlet("A CMTV apagou o vídeo da entrevista");
  assert.equal(r.kind, "mencao");
  assert.equal(titleAttributesToOutlet("A CMTV apagou o vídeo da entrevista"), false);
});

// --- Limpeza para títulos SEO/Discover ---

test("stripMediaAttribution remove a atribuição no fim e no início", () => {
  assert.equal(stripMediaAttribution("Benfica prepara proposta pelo médio, segundo a Record"), "Benfica prepara proposta pelo médio");
  assert.equal(stripMediaAttribution("Segundo a Record, Benfica prepara proposta"), "Benfica prepara proposta");
});

test("stripMediaAttribution não estraga um título limpo", () => {
  const t = "Os três momentos que decidiram o jogo no Estádio da Luz";
  assert.equal(stripMediaAttribution(t), t);
});

// --- Requisito 1: doutrina é fonte única VIVA, relida quando o ficheiro muda ---

test("alterar o ficheiro da doutrina vale na geração seguinte, sem reiniciar", async () => {
  const { writeFileSync, mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  const { getDoctrine, __resetDoctrineCache } = require("../../lib/pipeline/editorial/doctrine");

  const dir = mkdtempSync(join(tmpdir(), "doutrina-"));
  const file = join(dir, "ESTILO-EDITORIAL-HG.md");
  const prev = process.env.EDITORIAL_DOCTRINE_PATH;
  process.env.EDITORIAL_DOCTRINE_PATH = file;
  __resetDoctrineCache();

  const base = "# Doutrina de teste\n".padEnd(400, "x");
  writeFileSync(file, base + "\nREGRA-ORIGINAL");
  assert.match(getDoctrine(), /REGRA-ORIGINAL/, "primeira leitura");

  // Reescreve com data de modificação garantidamente diferente.
  await new Promise((r) => setTimeout(r, 12));
  writeFileSync(file, base + "\nREGRA-NOVA-SEM-REINICIAR");
  const depois = getDoctrine();
  assert.match(depois, /REGRA-NOVA-SEM-REINICIAR/, "devia reler o ficheiro alterado");
  assert.doesNotMatch(depois, /REGRA-ORIGINAL/);

  if (prev === undefined) delete process.env.EDITORIAL_DOCTRINE_PATH;
  else process.env.EDITORIAL_DOCTRINE_PATH = prev;
  __resetDoctrineCache();
});

test("os prompts de escrita, revisão, SEO e redes carregam a doutrina do ficheiro", () => {
  const { __resetDoctrineCache } = require("../../lib/pipeline/editorial/doctrine");
  const { buildWriterSystem, buildReviserSystem, buildSeoSystem, buildSocialSystem } = require("../../lib/pipeline/llm/prompts");
  __resetDoctrineCache();
  for (const [nome, build] of [["writer", buildWriterSystem], ["reviser", buildReviserSystem], ["seo", buildSeoSystem], ["social", buildSocialSystem]] as const) {
    const s = build();
    assert.match(s, /estrela polar/, `${nome} devia incluir a doutrina integral`);
    assert.match(s, /órgão de comunicação/i, `${nome} devia trazer a regra do título sem órgãos`);
  }
});

test("o writer manda marcar a origem uma só vez e não repetir que o clube não confirmou", () => {
  const { buildWriterSystem } = require("../../lib/pipeline/llm/prompts");
  const s = buildWriterSystem();
  assert.match(s, /UMA ÚNICA VEZ/);
  assert.match(s, /perto do FIM|perto do fim/);
  assert.match(s, /NÃO repitas|nunca mais se repete/i);
});

test("o reviser deixa de exigir ressalvas e aceita ironia com argumento", () => {
  const { buildReviserSystem } = require("../../lib/pipeline/llm/prompts");
  const s = buildReviserSystem();
  assert.match(s, /NÃO É DEFEITO/);
  assert.match(s, /[Ii]ronia/);
  assert.match(s, /secção 8/i, "a checklist vem da doutrina, não do código");
});

// --- Pilar 5-A: a voz humana ---

test("apanha as expressões de consultoria que a doutrina proíbe pelo nome", () => {
  const { analyzeVoice, hasBannedVoicePhrase } = require("../../lib/pipeline/editorial/voice");
  // Trecho real da peça que motivou o pilar 5-A.
  const morto = "A leitura interessante está na estrutura da operação. Um clube que arredonda para dólares está a vender uma narrativa. Do ponto de vista de gestão é um resultado a favor.";
  const v = analyzeVoice(morto);
  assert.equal(hasBannedVoicePhrase(morto), true);
  assert.ok(v.banned.length >= 2, "devia apanhar as duas expressões proibidas");
  assert.ok(v.consultancy.length > 0);
});

test("texto com voz e ritmo não é assinalado como proibido", () => {
  const { analyzeVoice, hasBannedVoicePhrase } = require("../../lib/pipeline/editorial/voice");
  const vivo = "Reparem bem nisto. O Sporting vendeu e fez questão de contar as contas em dólares, para o número parecer maior. É marketing, e do bom. Já o Benfica encaixou por um avançado que nunca jogou. Isso não é sorte, é ter conseguido vender um problema.";
  const v = analyzeVoice(vivo);
  assert.equal(hasBannedVoicePhrase(vivo), false);
  assert.equal(v.banned.length, 0);
  assert.ok(v.shortSentences > 0, "devia ter frases curtas a cortar");
  assert.equal(v.monotoneRhythm, false);
});

test("ritmo monocórdico é detectado (frases todas longas, nenhuma curta)", () => {
  const { analyzeVoice } = require("../../lib/pipeline/editorial/voice");
  const frase = "O clube apresentou os números da operação de forma detalhada e explicou a estrutura financeira aos adeptos presentes na sala";
  const v = analyzeVoice(Array.from({ length: 6 }, () => frase).join(". ") + ".");
  assert.equal(v.monotoneRhythm, true);
  assert.equal(v.shortSentences, 0);
});

test("sem-voz-humana é falha dura no Revisor", () => {
  const { isReviserApproved, HARD_FAIL_LABELS } = require("../../lib/pipeline/editorial/reviser-decision");
  assert.ok((HARD_FAIL_LABELS as readonly string[]).includes("sem-voz-humana"));
  assert.equal(isReviserApproved("APROVADO", ["sem-voz-humana"]), false);
});

test("o writer e o reviser exigem voz, ritmo e o teste de ler em voz alta", () => {
  const { buildWriterSystem, buildReviserSystem } = require("../../lib/pipeline/llm/prompts");
  const w = buildWriterSystem();
  assert.match(w, /VOZ HUMANA/);
  assert.match(w, /RITMO/);
  assert.match(w, /consultoria/i);
  assert.match(w, /voz alta/i);
  const r = buildReviserSystem();
  assert.match(r, /voz alta/i, "o reviser aplica o teste de ler em voz alta");
  assert.match(r, /sem-voz-humana/);
  assert.match(r, /relat[óo]rio de banco/i);
});

// --- Bastidores no corpo (determinista) ---

test("apanha instruções internas e expressões de bastidores no corpo", () => {
  const { detectInternalLeaks, hasInternalLeak } = require("../../lib/pipeline/editorial/body-rules");
  const casos = [
    "O Benfica venceu. Por indicação do editor, damos destaque à formação.",
    "O clube confirmou o negócio, conforme as regras, e avançou para a apresentação.",
    "De acordo com a doutrina, este tema merece análise técnica.",
    "O editor pediu que se explicasse o lance à luz do protocolo.",
    "Conforme solicitado, o texto foca-se no mercado.",
  ];
  for (const c of casos) {
    assert.equal(hasInternalLeak(c), true, `devia apanhar: ${c.slice(0, 45)}`);
    assert.ok(detectInternalLeaks(c).length > 0);
  }
});

test("não confunde regras do jogo com instruções internas (falso positivo)", () => {
  const { hasInternalLeak } = require("../../lib/pipeline/editorial/body-rules");
  const legitimos = [
    "O golo foi validado conforme as regras da competição.",
    "De acordo com as regras da UEFA, o clube pode inscrever o jogador.",
    "A decisão respeitou as regras do jogo e o protocolo do VAR.",
    "Segundo as regras do campeonato, o desempate faz-se pelo confronto directo.",
  ];
  for (const t of legitimos) assert.equal(hasInternalLeak(t), false, `não devia apanhar: ${t}`);
});

// --- Contagem da marca de não oficial (máximo uma) ---

test("uma marca de não oficial é aceite", () => {
  const { countUnofficialMarkers, repeatsUnofficialMarker } = require("../../lib/pipeline/editorial/body-rules");
  const t = "O Benfica avança para a contratação. O negócio ronda os 20 milhões, de acordo com a imprensa desportiva.";
  assert.equal(countUnofficialMarkers(t).total, 1);
  assert.equal(repeatsUnofficialMarker(t), false);
});

test("duas ou mais marcas reprovam (é a repetição que a doutrina proíbe)", () => {
  const { countUnofficialMarkers, repeatsUnofficialMarker } = require("../../lib/pipeline/editorial/body-rules");
  const t = "Segundo a Record, o negócio está fechado. O clube não confirmou o valor. Ainda não é oficial, e o desfecho está por confirmar.";
  const c = countUnofficialMarkers(t);
  assert.ok(c.total >= 3, `esperava 3+ marcas, obteve ${c.total}: ${c.matches.join(" | ")}`);
  assert.equal(repeatsUnofficialMarker(t), true);
});

test("peça oficial sem marcas nenhumas passa", () => {
  const { repeatsUnofficialMarker, countUnofficialMarkers } = require("../../lib/pipeline/editorial/body-rules");
  const t = "O Benfica anunciou a contratação do avançado, que assina até 2030. Chega proveniente do Sporting de Braga.";
  assert.equal(countUnofficialMarkers(t).total, 0);
  assert.equal(repeatsUnofficialMarker(t), false);
});

test("bastidores e marca repetida são falhas duras", () => {
  const { isReviserApproved, HARD_FAIL_LABELS } = require("../../lib/pipeline/editorial/reviser-decision");
  assert.ok((HARD_FAIL_LABELS as readonly string[]).includes("bastidores-no-corpo"));
  assert.ok((HARD_FAIL_LABELS as readonly string[]).includes("marca-nao-oficial-repetida"));
  assert.equal(isReviserApproved("APROVADO", ["bastidores-no-corpo"]), false);
  assert.equal(isReviserApproved("APROVADO", ["marca-nao-oficial-repetida"]), false);
});

// --- Aberturas formulaicas (todos os textos a começar igual) ---

test("apanha as aberturas batidas reais que se repetiam", () => {
  const { detectFormulaicOpening } = require("../../lib/pipeline/editorial/body-rules");
  const batidas = [
    "Reparem no percurso deste jovem. Aos 19 anos já soma títulos.",
    "Reparem bem neste nome: Thulin. O sueco chega ao andebol.",
    "Começou. O Benfica arrancou a caminho da Liga Europa.",
    "Vamos ao que interessa. O Benfica venceu por 2-0.",
    "Vamos ao facto curto e direto: Barreiro fica em casa.",
    "Imaginem um guarda-redes de dois metros. É o novo reforço.",
    "Deixem-me contar-vos uma história de superação.",
  ];
  for (const b of batidas) assert.ok(detectFormulaicOpening(b) !== null, `devia apanhar: ${b.slice(0, 30)}`);
});

test("não apanha aberturas legítimas pelo facto", () => {
  const { detectFormulaicOpening } = require("../../lib/pipeline/editorial/body-rules");
  const boas = [
    "O Benfica venceu o Sporting por 2-0 no Estádio da Luz.",
    "Thulin, guarda-redes sueco de 2,01 metros, é reforço do andebol do Benfica.",
    "Dois golos em três minutos decidiram o dérbi na segunda parte.",
    "Barreiro fica em casa por doença e não viaja para a Suíça.",
  ];
  for (const g of boas) assert.equal(detectFormulaicOpening(g), null, `não devia apanhar: ${g.slice(0, 30)}`);
});

test("abertura-formulaica é falha dura no Revisor", () => {
  const { isReviserApproved, HARD_FAIL_LABELS } = require("../../lib/pipeline/editorial/reviser-decision");
  assert.ok((HARD_FAIL_LABELS as readonly string[]).includes("abertura-formulaica"));
  assert.equal(isReviserApproved("APROVADO", ["abertura-formulaica"]), false);
});

test("o writer e o reviser proíbem as aberturas batidas", () => {
  const { buildWriterSystem, buildReviserSystem } = require("../../lib/pipeline/llm/prompts");
  assert.match(buildWriterSystem(), /ABERTURA/);
  assert.match(buildWriterSystem(), /varia|variar|diferente/i);
  assert.match(buildReviserSystem(), /F[ÓO]RMULA BATIDA|abertura-formulaica/i);
});

test("apanha o MOLDE, não só a palavra: «Há X que…» com qualquer substantivo", () => {
  const { detectFormulaicOpening } = require("../../lib/pipeline/editorial/body-rules");
  const variantes = [
    "Há reforços que valem mais do que o nome na ficha.",
    "Há despedidas que se fazem com discurso.",
    "Há parcerias que se renovam por hábito.",
    "Há notícias que passam ao lado do grande público.",
  ];
  for (const v of variantes) assert.ok(detectFormulaicOpening(v) !== null, `devia apanhar o molde: ${v.slice(0, 32)}`);
});

test("apanha as outras muletas encontradas nos artigos reais", () => {
  const { detectFormulaicOpening } = require("../../lib/pipeline/editorial/body-rules");
  const muletas = [
    "Comecemos pelo que salta à vista.",
    "Comecemos pelo essencial.",
    "O nome de António Silva voltou ao radar.",
    "O nome que mais saltou à vista foi Prestianni.",
    "Já se sabe.",
    "Já está.",
    "Já há lista.",
  ];
  for (const m of muletas) assert.ok(detectFormulaicOpening(m) !== null, `devia apanhar: ${m}`);
});

test("aberturas factuais continuam livres, mesmo repetindo a primeira palavra", () => {
  const { detectFormulaicOpening, openingMould } = require("../../lib/pipeline/editorial/body-rules");
  const factuais = [
    "O Benfica venceu o Belenenses por 5-1 na Luz.",
    "Zach Solomon, 22 anos, norte-americano, distribuidor.",
    "2-1 para o St. Gallen na primeira mão.",
    "Campo n.º 7 do Benfica Campus, 24 de julho de 2026.",
  ];
  for (const f of factuais) assert.equal(detectFormulaicOpening(f), null, `não devia apanhar: ${f.slice(0, 34)}`);
  // Arranque por número é factual, não conta como molde retórico.
  assert.equal(openingMould("2-1 para o St. Gallen na primeira mão."), null);
});
