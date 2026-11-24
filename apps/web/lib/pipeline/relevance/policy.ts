/**
 * Política editorial de relevância (pura e testável). Regras do editor:
 *  - Benfica: qualquer notícia substancial → aceite e escrita automaticamente.
 *  - FC Porto / Sporting: SÓ polémicas e lances de arbitragem → aceite, vai a gate.
 *  - Federação (FPF) / Liga / Conselho de Arbitragem: SÓ medidas, nomeações, casos e
 *    polémicas → aceite, vai a gate.
 *  - Tudo o resto (jogos normais desses clubes, outros clubes, internacional, ...) → recusa.
 */

const BENFICA_TERMS = ["benfica", "encarnados", "encarnado", "aguias", "benfiquista"];
const PORTO_SPORTING = ["fc porto", "porto", "dragoes", "dragao", "portista", "sporting", "leoes", "leao", "alvalade", "leonino"];
const FED_LIGA_CA = ["federacao", "fpf", "liga portugal", "liga de clubes", "conselho de arbitragem", "conselho de disciplina", "conselho de justica"];

// Polémica / arbitragem.
const ARB_POLEMICA =
  /(pol[eé]mic|arbitr|\bvar\b|pen[aá]lti|grande penalidade|expuls|cart[aã]o|vermelho|\blance|castig|suspens|fora de jogo|golo anulad|queixa|protesto|revolt|esc[aâ]ndal|\bacus|\batac|critic|guerra|processo disciplinar|falta grave)/i;

// Medidas / nomeações / casos (para Federação/Liga/Conselho de Arbitragem).
const MEDIDA_NOMEACAO_CASO =
  /(medida|nomea|design|\bcaso\b|processo|decis[aã]o|comunicad|san[çc]|multa|castig|suspens|investiga|regulament|altera|delibera|elei[çc])/i;

export function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function hasAny(hay: string, terms: string[]): boolean {
  return terms.some((t) => hay.includes(norm(t)));
}

/** Benfica é central se surgir no título ou for mencionado várias vezes no corpo. */
export function isBenficaCentral(title: string, body: string): boolean {
  const t = norm(title);
  if (BENFICA_TERMS.some((term) => t.includes(term))) return true;
  const b = norm(body);
  const count = BENFICA_TERMS.reduce((acc, term) => acc + (b.split(term).length - 1), 0);
  return count >= 3;
}

export interface PolicyResult {
  relevant: boolean;
  benficaCentral: boolean;
  category: string | null;
  reason: string;
}

export function applyRelevancePolicy(title: string, summary: string | null, contentText: string | null): PolicyResult {
  const hay = norm(`${title} ${summary ?? ""} ${contentText ?? ""}`);

  // 1. Benfica — sempre aceite.
  if (isBenficaCentral(title, `${summary ?? ""} ${contentText ?? ""}`)) {
    return { relevant: true, benficaCentral: true, category: "Benfica", reason: "Notícia central sobre o Benfica." };
  }

  const arbPolemica = ARB_POLEMICA.test(hay);

  // 2. FC Porto / Sporting — só polémica ou arbitragem.
  if (hasAny(hay, PORTO_SPORTING)) {
    if (arbPolemica) {
      const cat = hay.includes("sporting") || hay.includes("alvalade") || hay.includes("leo") ? "Sporting" : "FC Porto";
      return { relevant: true, benficaCentral: false, category: cat, reason: "Polémica/arbitragem de rival." };
    }
    return { relevant: false, benficaCentral: false, category: null, reason: "Porto/Sporting sem polémica nem arbitragem — não interessa." };
  }

  // 3. Federação / Liga / Conselho de Arbitragem — medidas, nomeações, casos, polémicas.
  if (hasAny(hay, FED_LIGA_CA)) {
    if (MEDIDA_NOMEACAO_CASO.test(hay) || arbPolemica) {
      return { relevant: true, benficaCentral: false, category: "Federação/Liga/Arbitragem", reason: "Medida/nomeação/caso/polémica institucional." };
    }
    return { relevant: false, benficaCentral: false, category: null, reason: "Instituição sem medida/caso/polémica — não interessa." };
  }

  // 4. Tudo o resto — não interessa.
  return { relevant: false, benficaCentral: false, category: null, reason: "Fora do âmbito editorial (não é Benfica, nem polémica/arbitragem de rival, nem caso institucional)." };
}
