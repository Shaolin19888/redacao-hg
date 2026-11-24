/**
 * SimHash de 64 bits para detecção de quase-duplicados entre notícias.
 * Puro (sem I/O): tokeniza o texto, calcula um hash 64-bit por token, agrega num
 * vector de pesos e reduz a uma assinatura. Notícias sobre o mesmo tema, mesmo com
 * palavras diferentes, ficam com distância de Hamming pequena.
 * Ver docs/pipeline/arquitetura.md §6 (Candidate.simhash).
 */

const MASK64 = (1n << 64n) - 1n;

/** Remove acentos, pontuação e normaliza para tokens comparáveis. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // diacríticos combinados
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3);
}

/** FNV-1a 64-bit de uma string, em BigInt. */
export function fnv1a64(str: string): bigint {
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < str.length; i++) {
    hash ^= BigInt(str.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & MASK64;
  }
  return hash;
}

/** Calcula a assinatura SimHash de 64 bits de um texto, devolvida em hex (16 chars). */
export function simhash(text: string): string {
  const tokens = tokenize(text);
  if (tokens.length === 0) return "0".padStart(16, "0");

  // Peso por token = frequência (tokens repetidos contam mais).
  const freq = new Map<string, number>();
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  const bits = new Array<number>(64).fill(0);
  for (const [token, weight] of freq) {
    const h = fnv1a64(token);
    for (let b = 0; b < 64; b++) {
      const bit = (h >> BigInt(b)) & 1n;
      bits[b] += bit === 1n ? weight : -weight;
    }
  }

  let sig = 0n;
  for (let b = 0; b < 64; b++) {
    if (bits[b] > 0) sig |= 1n << BigInt(b);
  }
  return sig.toString(16).padStart(16, "0");
}

/** Distância de Hamming entre duas assinaturas hex de 64 bits (0–64). */
export function hammingDistance(a: string, b: string): number {
  let x = (BigInt("0x" + a) ^ BigInt("0x" + b)) & MASK64;
  let count = 0;
  while (x > 0n) {
    count += Number(x & 1n);
    x >>= 1n;
  }
  return count;
}
