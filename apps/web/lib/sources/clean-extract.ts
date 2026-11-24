import * as cheerio from "cheerio";

/**
 * Extração LIMPA do corpo de um artigo a partir de HTML. Remove cromo da página
 * (cabeçalho, rodapé, menu, formulários) e filtra parágrafos de "lixo" (avisos legais,
 * apelos a sócios/bilhetes, cookies, redes sociais) que NÃO são a notícia. Evita que
 * boilerplate do site (ex.: "Admissão à Negociação de Valores Mobiliários", apelos de
 * apoio à equipa no slbenfica.pt) entre no corpo do artigo e vire "facto".
 */

// Cromo estrutural a remover. Só tags e classes seguras (nunca wildcards que possam
// apanhar o próprio contentor do corpo do artigo, o que apagaria a notícia).
const CHROME_SELECTORS = [
  "script", "style", "noscript", "header", "footer", "nav", "aside", "form",
  ".ads", ".advertisement", ".related", ".comments", ".social-share", ".share",
  // NB: NÃO remover ".paywall" — no Record o corpo do artigo vive em div.text_container.paywall
  // (o "paywall" é um overlay de JavaScript, não cromo). Os apelos a login são filtrados por JUNK_RE.
  ".newsletter", ".subscription", ".cookie", ".cookies", ".breadcrumb",
  ".sidebar", ".tags", ".author-box", ".related-news", ".also-read", ".mais-lidas",
  "[class*='related']", "[class*='newsletter']", "[class*='cookie']", "[class*='share']",
  "[class*='breadcrumb']",
];

/** Parágrafos que são boilerplate do site (byline, créditos, avisos, apelos), não a notícia. */
const JUNK_RE =
  /(iniciar sess[aã]o|inicie sess[aã]o|para poder usar esta funcionalidade|efectu(e|ar) (o )?(login|registo)|criar (uma )?conta|conta de s[oó]cio|torna-te s[oó]cio|seguir autor|ser assinante|vantagens de ser|adicione como|fonte preferencial|deixe o seu coment|valores mobili[aá]rios|admiss[aã]o [aà] negocia[çc][aã]o|prospeto|subscrev|newsletter|pol[ií]tica de (privacidade|cookies)|aceitar (os )?cookies|utilizamos cookies|todos os direitos reservados|©|descarreg(a|ar) a app|segue-nos|redes sociais|comprar bilhetes|bilhetes (j[aá]|para)|loja (oficial|do)|apoi(a|ar|o)( a)? (a )?equipa|apela.{0,30}apoio|^texto:\s|^fotos?:|^v[ií]deo:|^imagem:|^foto:|[uú]ltima atualiza[çc][aã]o|^partilhar\b)/i;

/** Item de "ticker"/lista de últimas: começa por uma hora (21:07) ou é um título repetido. */
function looksLikeTicker(text: string): boolean {
  if (/^\d{1,2}[:h]\d{2}\b/.test(text)) return true; // "21:07 Benfica ..."
  // Título de ticker vem duas vezes seguidas (o Record repete o título no widget).
  const half = Math.floor(text.length / 2);
  if (half > 20 && text.slice(0, half).trim() === text.slice(half).trim()) return true;
  return false;
}

function looksLikeJunk(text: string, minLen: number = 30): boolean {
  if (text.length < minLen) return true; // fragmentos curtos (botões, labels)
  if (JUNK_RE.test(text)) return true;
  if (looksLikeTicker(text)) return true;
  // Parágrafo só com maiúsculas / menu (poucas palavras, todas capitalizadas). Não conta se
  // for uma lista (começa por "-" ou "•"), onde nomes próprios curtos são o conteúdo.
  const words = text.split(/\s+/);
  if (!/^[-•·]/.test(text) && words.length <= 4 && words.every((w) => /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ]/.test(w))) return true;
  return false;
}

/**
 * Extrai o corpo do artigo já limpo. Tenta os `containerSelectors` (do mais específico ao
 * mais genérico); se nenhum servir, usa todos os parágrafos do documento. Devolve os
 * parágrafos válidos juntos por linha dupla.
 */
export function extractCleanText($: cheerio.CheerioAPI, containerSelectors: string[] = []): string {
  // Remover o cromo globalmente antes de extrair.
  CHROME_SELECTORS.forEach((s) => $(s).remove());

  // Recolhe parágrafos limpos de TODOS os elementos que casam com o selector (não só o
  // primeiro): o corpo real pode não ser o primeiro <article> (o Record põe um teaser antes).
  // `permissive` baixa o mínimo de caracteres (para apanhar itens de lista curtos, ex.: nomes
  // de adversários "- Pafos ou Hajduk Split") — só usado nos containers autoritários do domínio.
  const collect = (sel: string | null, permissive = false): string[] => {
    const paras: string[] = [];
    const minLen = permissive ? 3 : 30;
    const scopes = sel === null ? [$.root()] : $(sel).toArray().map((el) => $(el));
    for (const root of scopes) {
      root.find("p, h2, h3, blockquote, li").each((_, node) => {
        const t = $(node).text().trim().replace(/\s+/g, " ");
        if (t && !looksLikeJunk(t, minLen) && !paras.includes(t)) paras.push(t);
      });
    }
    return paras;
  };

  // 1. Selectores específicos do domínio são AUTORITÁRIOS: apontam o contentor exacto do
  // corpo. O primeiro que traga texto de jeito ganha (não deixamos o ticker de "últimas"
  // competir com o corpo do artigo). Recolha permissiva (apanha listas curtas do corpo).
  for (const sel of containerSelectors) {
    const paras = collect(sel, true);
    if (paras.join(" ").length > 200) return paras.slice(0, 60).join("\n\n");
  }

  // 2. Genéricos: escolhe o container com MAIS texto limpo (o ticker é filtrado como lixo).
  let best: string[] = [];
  for (const sel of ["article", "main", "[itemprop='articleBody']", ".content", "#content", ".post", ".entry"]) {
    const paras = collect(sel);
    if (paras.join(" ").length > best.join(" ").length) best = paras;
  }

  // 3. Fallback: todos os parágrafos do documento (já sem cromo) se nada de jeito foi encontrado.
  if (best.join(" ").length < 200) best = collect(null);

  return best.slice(0, 40).join("\n\n");
}
