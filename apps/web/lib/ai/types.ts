export interface GeneratedContent {
  tituloPrincipal: string;
  tituloSecundario: string;
  titulosChamativos: string[];
  titulosAlternativos: string[];
  tituloDiscover: string;
  tituloSEO: string;
  slug: string;
  metaDescricao: string;
  texto: string;
  excerpto: string;
  categoriasSugeridas: string[];
  tagsSugeridas: string[];
  copyFacebook: string;
  copyWhatsApp: string;
  pushTitle: string;
  pushBody: string;
  factosConfirmados: string[];
  pontosNaoConfirmados: string[];
  notaRiscoEditorial: string;
  fontesUsadas: string[];
  modelo: string;
}

export interface GenerateRequest {
  newsItemId?: string;
  urlExtra?: string;
  textoLivre?: string;
  provider?: "openai" | "claude";
  instrucoes?: string;
  formato?: "noticia" | "opiniao" | "analise" | "resumo";
  tom?: "informativo" | "forte" | "critico" | "neutro" | "desportivo";
  percentagemIA?: number;
}
