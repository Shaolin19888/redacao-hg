import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Tabela de preços por modelo, em configuração (não no código), para converter tokens em
 * euros. Ver docs/RELATORIO-SEMANAL.md. Os preços vêm em DÓLARES por milhão de tokens
 * (entrada/saída) e a conversão para euro aplica usdToEur.
 *
 * Fórmula por geração:
 *   custo = (tokensIn / 1_000_000) * precoEntrada + (tokensOut / 1_000_000) * precoSaida
 *
 * O ficheiro model-prices.json pode ser editado sem tocar no código. Se não for encontrado,
 * usa-se um default embutido (rede de segurança) para o relatório nunca falhar por falta de
 * config. A taxa USD→EUR pode ainda ser afinada em runtime pela Setting report_usd_eur_rate.
 */

export interface ModelPrice {
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface PriceTable {
  usdToEur: number;
  modelos: Record<string, ModelPrice>;
}

// Default embutido, alinhado com model-prices.json. Só entra se o ficheiro não for legível.
const DEFAULT_TABLE: PriceTable = {
  usdToEur: 0.92,
  modelos: {
    "claude-opus-4-8": { inputUsdPerMillion: 5.0, outputUsdPerMillion: 25.0 },
    "claude-sonnet-4-5": { inputUsdPerMillion: 3.0, outputUsdPerMillion: 15.0 },
    "claude-sonnet": { inputUsdPerMillion: 3.0, outputUsdPerMillion: 15.0 },
    "claude-haiku-4-5": { inputUsdPerMillion: 1.0, outputUsdPerMillion: 5.0 },
    "gpt-4o": { inputUsdPerMillion: 2.5, outputUsdPerMillion: 10.0 },
    "gpt-4o-mini": { inputUsdPerMillion: 0.15, outputUsdPerMillion: 0.6 },
  },
};

function candidatePaths(): string[] {
  const cwd = process.cwd();
  const fromEnv = process.env.REPORT_PRICES_PATH;
  return [
    ...(fromEnv ? [fromEnv] : []),
    resolve(cwd, "../../config/model-prices.json"), // override na raiz do repo
    resolve(cwd, "lib/pipeline/report/model-prices.json"), // ficheiro versionado (cwd = apps/web)
    resolve(__dirname, "model-prices.json"), // junto ao módulo
  ];
}

let cached: PriceTable | null = null;

/** Carrega a tabela de preços (com cache). Fonte: ficheiro de config; fallback embutido. */
export function loadPriceTable(): PriceTable {
  if (cached) return cached;
  for (const p of candidatePaths()) {
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<PriceTable>;
      if (raw && raw.modelos && typeof raw.usdToEur === "number") {
        cached = { usdToEur: raw.usdToEur, modelos: raw.modelos };
        return cached;
      }
    } catch {
      /* tenta o próximo caminho */
    }
  }
  cached = DEFAULT_TABLE;
  return cached;
}

/** Só para testes: limpa a cache. */
export function __resetPriceCache(): void {
  cached = null;
}

/** True se o modelo tem preço na tabela (para sinalizar modelos por preçar no relatório). */
export function hasPrice(model: string, table: PriceTable = loadPriceTable()): boolean {
  return Boolean(table.modelos[model]);
}

/**
 * Custo em euros de uma geração (ou de um agregado de tokens do mesmo modelo).
 * Modelo sem preço → 0 (o relatório sinaliza à parte que há modelos por preçar).
 */
export function costEur(
  model: string,
  tokensIn: number,
  tokensOut: number,
  opts: { table?: PriceTable; usdToEur?: number } = {},
): number {
  const table = opts.table ?? loadPriceTable();
  const price = table.modelos[model];
  if (!price) return 0;
  const usd =
    (tokensIn / 1_000_000) * price.inputUsdPerMillion +
    (tokensOut / 1_000_000) * price.outputUsdPerMillion;
  const rate = opts.usdToEur ?? table.usdToEur;
  return usd * rate;
}
