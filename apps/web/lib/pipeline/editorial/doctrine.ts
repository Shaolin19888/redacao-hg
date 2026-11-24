import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Doutrina editorial (ESTILO-EDITORIAL-HG.md) como FONTE ÚNICA da parte de escrita.
 * Vive na raiz do projecto e está acima de qualquer prompt (ver CLAUDE.md §0 e §33).
 * Aqui é carregada em runtime e injectada como bloco de sistema {DOUTRINA} nos prompts
 * de escrita e de revisão. Não se duplica o texto: o .md continua a ser a fonte.
 *
 * Se o ficheiro não for encontrado (deploy/bundling), usa-se um resumo mínimo embutido
 * para o sistema nunca ficar sem a estrela polar — mas o objectivo é ler sempre o .md.
 */

// Resumo mínimo de recurso. NÃO substitui o .md, é só rede de segurança.
const FALLBACK_DOCTRINE = `# Estilo Editorial HG (resumo de recurso)

Estrela polar: da indignação para a autoridade. Deixamos de gritar o que o adepto sente,
passamos a explicar, melhor do que ninguém, aquilo que o adepto quer perceber.

Sete regras de ouro: 1) ângulo próprio obrigatório, nada de resumos sem valor;
2) arbitragem com autoridade de ex-árbitro, com as leis do jogo e o protocolo do VAR;
3) título honesto, apelativo mas nunca enganador; 4) facto verificado, nenhuma afirmação
forte sem fonte sólida; 5) imagem própria 1200px 16:9; 6) publicidade equilibrada;
7) assinatura e data visíveis.

Método dos três níveis, obrigatório em cada peça: Facto (o que aconteceu), Análise (o que
só nós explicamos), Autoridade (quem o diz e porque é credível). Peça só com facto é resumo,
e resumos não trazem tráfego.

Lista negra: indignação sem análise, título que promete mais do que entrega, vitimização
sem prova, afirmações fortes sem fonte, resumos sem ângulo próprio.

Português europeu, sem símbolo de travessão. Voz de adepto mantém-se, mas sempre fundamentada.`;

// Caminhos candidatos, do mais provável (cwd = apps/web em runtime) ao menos.
function candidatePaths(): string[] {
  const cwd = process.cwd();
  const fromEnv = process.env.EDITORIAL_DOCTRINE_PATH;
  return [
    ...(fromEnv ? [fromEnv] : []),
    resolve(cwd, "../../ESTILO-EDITORIAL-HG.md"), // apps/web → raiz
    resolve(cwd, "../ESTILO-EDITORIAL-HG.md"),
    resolve(cwd, "ESTILO-EDITORIAL-HG.md"),
  ];
}

let cached: string | null = null;
let cachedPath: string | null = null;
let cachedMtimeMs = 0;

/**
 * Devolve o texto integral da doutrina. FONTE ÚNICA, lida do ficheiro em cada geração:
 * a cache é invalidada pela data de modificação, por isso editar o ESTILO-EDITORIAL-HG.md
 * passa a valer na geração seguinte, sem reiniciar o worker e sem tocar em código.
 * O custo é um stat por chamada (desprezável) em vez de reler o ficheiro todo.
 */
export function getDoctrine(): string {
  for (const p of candidatePaths()) {
    try {
      const { mtimeMs } = statSync(p);
      // Mesmo ficheiro e mesma data → serve a cache.
      if (cached && cachedPath === p && mtimeMs === cachedMtimeMs) return cached;
      const text = readFileSync(p, "utf8").trim();
      if (text.length > 200) {
        cached = text;
        cachedPath = p;
        cachedMtimeMs = mtimeMs;
        return cached;
      }
    } catch {
      /* tenta o próximo caminho */
    }
  }
  // Sem ficheiro legível: rede de segurança, para nunca gerar sem doutrina.
  cached = null;
  cachedPath = null;
  cachedMtimeMs = 0;
  return FALLBACK_DOCTRINE;
}

/** True quando a doutrina foi lida do ficheiro (não do fallback). Útil para diagnóstico. */
export function doctrineLoadedFromFile(): boolean {
  return getDoctrine() !== FALLBACK_DOCTRINE;
}

/** Só para testes: limpa a cache para reavaliar os caminhos/env. */
export function __resetDoctrineCache(): void {
  cached = null;
  cachedPath = null;
  cachedMtimeMs = 0;
}
