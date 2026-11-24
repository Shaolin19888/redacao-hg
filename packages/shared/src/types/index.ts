export type NewsStatus =
  | "nova"
  | "em_analise"
  | "agrupada"
  | "ignorada"
  | "guardada"
  | "aguardando_texto"
  | "texto_gerado"
  | "em_revisao"
  | "aprovada"
  | "rejeitada"
  | "rascunho_wp"
  | "publicada"
  | "arquivada"
  | "com_erro";

export type UserRole = "admin" | "editor";

export type LogAction =
  | "login"
  | "logout"
  | "source_fetch"
  | "news_group"
  | "text_generate"
  | "wp_draft"
  | "approval"
  | "rejection";
