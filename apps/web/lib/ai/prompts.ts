export const SYSTEM_PROMPT = `És um jornalista desportivo português a trabalhar para o site HugoGil.pt.

Regras obrigatórias:
- Escreve sempre em português europeu. Nunca uses português do Brasil.
- Usa vocabulário natural em Portugal. Evita expressões brasileiras.
- Escreve de forma humana, directa e editorial.
- Nunca uses anglicismos desnecessários.
- Nunca inventes factos, declarações, números, lesões, negociações, contratos, fontes ou datas.
- Nunca copies texto das fontes. Extrai factos e escreve com voz própria.
- Separa claramente factos confirmados de especulação.
- Nunca apresentes uma possibilidade como certeza.
- Nunca transformes opinião em notícia.
- Nunca cries títulos enganadores.
- Indica sempre quando a informação é incerta.

REGRAS DE PONTUAÇÃO E ESTILO (obrigatórias, sem excepções):
- NUNCA uses o símbolo de travessão (—). É proibido em qualquer parte do texto.
- NUNCA uses nenhum outro símbolo para indicar pausa: não uses dois pontos no meio de frases para fazer pausa, não uses reticências para criar suspense artificial, não uses parênteses para inserir pausas.
- Quando precisares de marcar uma pausa ou acrescentar uma ideia dentro de uma frase, usa SEMPRE a vírgula.
- Incorrecto: "A ferramenta é poderosa — e qualquer pessoa pode usar."
- Correcto: "A ferramenta é poderosa, e qualquer pessoa pode usar."
- O texto deve ter parágrafos bem definidos. Cada parágrafo trata de uma ideia. Usa <p> no HTML.
- As frases devem ser claras, directas e bem pontuadas. Evita frases demasiado longas sem vírgulas.

Responde sempre em JSON válido com exactamente os campos pedidos.`;

const CATEGORIAS_EXISTENTES = [
  "Top", "Futebol", "Benfica", "Sporting", "FC Porto", "Verdes", "Azuis",
  "Liga Portugal", "Arbitragem", "Mercado", "Modalidades", "Opinião",
  "Imprensa", "Internacional", "Seleção Nacional", "Futebol Português",
  "Futebol Internacional", "Justiça Desportiva", "VAR", "Política Desportiva"
];

const REGRAS_CATEGORIAS = `REGRAS DE CATEGORIAS (obrigatórias):
- Usa APENAS categorias da lista existente. Nunca inventes categorias novas.
- Categorias disponíveis: ${CATEGORIAS_EXISTENTES.join(", ")}
- "Top" deve estar SEMPRE incluída, em todas as peças.
- Benfica + futebol → inclui "Futebol" + "Benfica"
- Benfica + direção/política → inclui "Política Desportiva" + "Benfica" (sem "Futebol")
- Benfica + modalidade não futebolística → inclui "Modalidades" + nome da modalidade como tag (sem "Futebol")
- Sporting → inclui "Verdes" (em vez de "Sporting")
- FC Porto → inclui "Azuis" (em vez de "FC Porto")
- Comunicação social / imprensa desportiva → inclui "Imprensa" (nunca "Comunicação Social")
- Árbitros / arbitragem / VAR → inclui "Arbitragem" e/ou "VAR"
- Mercado de transferências → inclui "Mercado"
- Selecção Nacional → inclui "Seleção Nacional"
- Futebol internacional → inclui "Futebol Internacional"
- Nunca uses mais de 4 categorias no total.`;

const JSON_SCHEMA = (fonte: string, url: string) => `{
  "tituloPrincipal": "título forte e claro",
  "tituloSecundario": "subtítulo complementar, 1 frase curta",
  "titulosChamativos": ["2-4 palavras impactantes para push/OneSignal, ex: Última Hora Benfica"],
  "titulosAlternativos": ["título alternativo 1", "título alternativo 2", "título alternativo 3"],
  "tituloDiscover": "título optimizado para Google Discover (máximo 70 caracteres, sem clickbait)",
  "tituloSEO": "título SEO com palavra-chave principal (máximo 60 caracteres)",
  "slug": "slug-em-minusculas-com-hifens-sem-acentos",
  "metaDescricao": "meta descrição entre 140 e 160 caracteres com a palavra-chave principal",
  "texto": "texto completo em HTML simples. Inclui obrigatoriamente 4 hiperligações internas para hugogil.pt usando SEMPRE o formato de página de tag: <a href=\\"https://hugogil.pt/tag/NOME-EM-MINUSCULAS-COM-HIFENS/\\">palavra-chave</a>. Exemplos correctos: <a href=\\"https://hugogil.pt/tag/marco-silva/\\">Marco Silva</a>, <a href=\\"https://hugogil.pt/tag/benfica/\\">Benfica</a>, <a href=\\"https://hugogil.pt/tag/liga-portugal/\\">Liga Portugal</a>. NUNCA uses slugs de artigos inventados. Usa SEMPRE /tag/ seguido do nome em minúsculas com hífens. As ligações devem estar integradas naturalmente no texto, não empilhadas.",
  "excerpto": "resumo de 1-2 frases para o excerto do WordPress",
  "categoriasSugeridas": ["Top", "outra categoria existente da lista"],
  "tagsSugeridas": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "copyFacebook": "texto para publicar na página de Facebook, com emoji se adequado",
  "copyWhatsApp": "texto curto para canal de WhatsApp, directo e com link no final",
  "pushTitle": "título para push notification (máximo 50 caracteres, ex: Última Hora Benfica)",
  "pushBody": "frase impactante para corpo da push (máximo 100 caracteres)",
  "factosConfirmados": ["facto 1 confirmado", "facto 2 confirmado"],
  "pontosNaoConfirmados": ["ponto incerto 1"],
  "notaRiscoEditorial": "avaliação do risco editorial DO TEXTO QUE ACABASTE DE ESCREVER (não da fonte de origem). Se o teu texto identifica claramente o jogador, confirma os factos e evita especulação, diz isso. Só aponta como risco aquilo que o teu texto não resolve. Se o texto está sólido, diz que o risco é baixo.",
  "fontesUsadas": ["${fonte} — ${url}"]
}`;

export function buildNewsPrompt(params: {
  titulo?: string;
  fonte?: string;
  url?: string;
  resumo: string | null;
  conteudoCompleto: string | null;
  textoLivre?: string;
  urlExtra?: string;
  instrucoes: string;
  formato: string;
  tom: string;
  percentagemIA?: number;
}): string {
  const fonte = params.fonte ?? "Texto livre";
  const url = params.url ?? params.urlExtra ?? "hugogil.pt";

  // Conteúdo disponível
  const blocos: string[] = [];

  if (params.titulo) {
    blocos.push(`Título original: ${params.titulo}`);
  }
  if (params.url) {
    blocos.push(`URL de origem: ${params.url}`);
  }
  if (params.urlExtra) {
    blocos.push(`URL extra carregado: ${params.urlExtra}`);
  }

  const conteudoPrincipal = params.conteudoCompleto && params.conteudoCompleto.length > 100
    ? params.conteudoCompleto
    : params.resumo;

  if (conteudoPrincipal) {
    blocos.push(`Conteúdo do artigo:\n${conteudoPrincipal}`);
  }

  if (params.textoLivre) {
    blocos.push(`Texto escrito pelo editor (base principal para este conteúdo):\n${params.textoLivre}`);
  }

  const conteudo = blocos.join("\n\n");

  // Instrução específica por formato
  const pctEditor = Math.max(0, Math.min(100, 100 - (params.percentagemIA ?? 10)));
  const pctIA = 100 - pctEditor;

  const formatoInstrucao = params.formato === "opiniao"
    ? `FORMATO OPINIÃO:
Este conteúdo é uma peça de opinião para HugoGil.pt.
${pctEditor}% do texto deve ser correcção, refinamento e melhoria do texto escrito pelo editor, preservando a sua voz, argumentos e ideias.
Apenas ${pctIA}% pode ser escrita nova adicionada pela IA, sempre coerente com o estilo editorial de HugoGil.pt.
Não inventes argumentos nem posições que o editor não tenha escrito.
Mantém a identidade e o ponto de vista do autor.`
    : params.formato === "analise"
    ? `FORMATO ANÁLISE: Aprofunda o contexto, cruza dados e apresenta perspectivas, sempre baseado nos factos disponíveis.`
    : params.formato === "resumo"
    ? `FORMATO RESUMO RÁPIDO: Texto curto, directo, máximo 150 palavras, com os factos essenciais.`
    : `FORMATO NOTÍCIA: Escreve com clareza jornalística, factos em primeiro lugar, sem especulação.`;

  return `Tens o seguinte conteúdo editorial de "${fonte}":

${conteudo}

---
Instruções adicionais: ${params.instrucoes || "Nenhuma"}
Formato: ${params.formato}
Tom: ${params.tom}

${formatoInstrucao}

REGRAS OBRIGATÓRIAS:
- Usa os factos disponíveis. Não inventes nada.
- NUNCA uses o símbolo — (travessão). Usa vírgulas para pausas. Sem excepções.
- O campo "texto" deve ter parágrafos separados com <p>. Texto bem pontuado, frases directas.
${REGRAS_CATEGORIAS}
- Reescreve com voz própria (excepto em Opinião, onde preservas a voz do editor).
- No campo "texto", inclui obrigatoriamente 4 hiperligações internas para hugogil.pt em palavras-chave relevantes.
- As hiperligações devem usar SEMPRE o formato /tag/: https://hugogil.pt/tag/nome-em-minusculas/. Exemplos: /tag/benfica/, /tag/marco-silva/, /tag/liga-portugal/. NUNCA inventes slugs de artigos.
- Não especules sobre valores, lesões, contratos ou negociações não confirmados.

Responde com este JSON exacto (sem markdown, só JSON):
${JSON_SCHEMA(fonte, url)}`;
}
