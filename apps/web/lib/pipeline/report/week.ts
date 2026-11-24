/**
 * Cálculo da semana anterior (segunda a domingo) e do rótulo em português.
 * Puro e testável. Hora local (o worker corre no Mac, em Lisboa); em VPS de Lisboa é igual.
 * Ver docs/RELATORIO-SEMANAL.md.
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export interface WeekRange {
  /** Segunda-feira 00:00:00.000 da semana anterior. */
  start: Date;
  /** Domingo 23:59:59.999 da semana anterior. */
  end: Date;
  /** Rótulo humano, ex.: "7 a 13 de julho" ou "28 de julho a 3 de agosto". */
  label: string;
  /** Chave estável da semana (data da segunda, "YYYY-MM-DD"), para idempotência. */
  key: string;
}

function atMidnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Rótulo PT da semana. Omite o mês do início quando início e fim são no mesmo mês. */
export function formatWeekLabel(start: Date, end: Date): string {
  const d1 = start.getDate();
  const d2 = end.getDate();
  const m1 = MESES[start.getMonth()];
  const m2 = MESES[end.getMonth()];
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${d1} a ${d2} de ${m2}`;
  }
  return `${d1} de ${m1} a ${d2} de ${m2}`;
}

/**
 * Intervalo da semana ANTERIOR (segunda 00:00 a domingo 23:59:59.999) relativo a `now`.
 * getDay(): 0=domingo..6=sábado; dias desde segunda = (getDay()+6)%7.
 */
export function previousWeekRange(now: Date): WeekRange {
  const daysSinceMonday = (now.getDay() + 6) % 7;
  const thisMonday = atMidnight(now);
  thisMonday.setDate(thisMonday.getDate() - daysSinceMonday);

  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7); // segunda da semana anterior

  const end = new Date(start);
  end.setDate(end.getDate() + 6); // domingo
  end.setHours(23, 59, 59, 999);

  return { start, end, label: formatWeekLabel(start, end), key: isoDate(start) };
}
