/**
 * Vigia da recolha: decide quando o worker deve desistir e sair, para que o launchd o
 * levante de novo com a ligação à rede limpa.
 *
 * Porquê: a 4 de agosto de 2026 o Mac adormeceu e, ao acordar, o processo do worker ficou
 * com a resolução de nomes encravada (`getaddrinfo ENOTFOUND www.record.pt`). Continuou
 * vivo dez horas a tentar de 30 em 30 minutos e a falhar em todas as fontes, sem recolher
 * uma única notícia. Como nunca acabou, o launchd (que tem KeepAlive) nunca o substituiu, e
 * do lado do editor isto é indistinguível de "não há notícias". Reiniciar à mão resolveu na
 * hora — logo o processo novo é a cura, só faltava alguém dar a ordem.
 *
 * A condição é deliberadamente exigente: TODAS as fontes tentadas falham, várias vezes
 * seguidas. Uma fonte em baixo é normal e não conta; o que conta é a assinatura de "o
 * problema sou eu". Sensível a menos é preferível: um vigia nervoso põe o worker a fechar e
 * abrir sem parar, que é pior do que a avaria que tenta curar.
 *
 * Lógica pura, sem I/O, para poder ser testada sem processos nem rede.
 */

/** Ciclos consecutivos de falha total antes de desistir. */
export const CICLOS_ATE_DESISTIR = 3;

export interface CicloRecolha {
  /** Fontes efectivamente tentadas neste ciclo (as que estão dentro da cadência não contam). */
  tentadas: number;
  /** Quantas dessas falharam. */
  falhadas: number;
}

export interface Veredicto {
  /** Ciclos de falha total acumulados até agora. */
  seguidas: number;
  /** Chegou ao limite: o worker deve sair para ser relançado. */
  desistir: boolean;
  /** Explicação legível para o registo, quando há algo a dizer. */
  motivo?: string;
}

export class VigiaRecolha {
  private seguidas = 0;

  constructor(private readonly limite: number = CICLOS_ATE_DESISTIR) {}

  /**
   * Regista o resultado de um ciclo e diz se está na hora de desistir.
   * Qualquer sucesso, mesmo parcial, limpa a contagem: o processo está são.
   */
  registar(ciclo: CicloRecolha): Veredicto {
    // Ciclo sem tentativas nenhumas (todas as fontes dentro da cadência, ou recolha
    // desligada) não é prova de nada: não conta nem a favor nem contra.
    if (ciclo.tentadas === 0) return { seguidas: this.seguidas, desistir: false };

    if (ciclo.falhadas < ciclo.tentadas) {
      this.seguidas = 0;
      return { seguidas: 0, desistir: false };
    }

    this.seguidas += 1;
    const desistir = this.seguidas >= this.limite;
    return {
      seguidas: this.seguidas,
      desistir,
      motivo:
        `Falha total na recolha ${this.seguidas} ciclo(s) seguido(s) ` +
        `(${ciclo.falhadas}/${ciclo.tentadas} fontes).` +
        (desistir ? " O worker vai sair para ser relançado com a rede limpa." : ""),
    };
  }

  /** Uma excepção a meio da recolha conta como falha total do ciclo. */
  registarExcepcao(): Veredicto {
    return this.registar({ tentadas: 1, falhadas: 1 });
  }
}
