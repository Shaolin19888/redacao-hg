import { Facebook, Instagram, Linkedin, Youtube, Twitter, AtSign, Music2, Pin } from "lucide-react";

export type Platform =
  | "FACEBOOK" | "INSTAGRAM" | "X" | "LINKEDIN"
  | "THREADS" | "TIKTOK" | "YOUTUBE" | "PINTEREST";

export interface PlatformMeta {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  charLimit: number | null;
  connectHref: string | null;
  connectLabel: string;
  description: string;
  setupHint?: string;
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  FACEBOOK: {
    label: "Facebook",
    icon: Facebook,
    color: "#1877F2",
    bg: "bg-[#1877F2]",
    charLimit: 63206,
    connectHref: "/api/social/oauth/facebook/start",
    connectLabel: "Ligar Página Facebook",
    description: "Publica nas tuas Páginas de Facebook. Podes ligar várias.",
  },
  INSTAGRAM: {
    label: "Instagram",
    icon: Instagram,
    color: "#E4405F",
    bg: "bg-gradient-to-br from-[#833AB4] via-[#E4405F] to-[#FCAF45]",
    charLimit: 2200,
    connectHref: "/api/social/oauth/instagram/start",
    connectLabel: "Ligar Instagram Business",
    description: "Contas profissionais ligadas às tuas Páginas de Facebook.",
  },
  X: {
    label: "X",
    icon: Twitter,
    color: "#000000",
    bg: "bg-black",
    charLimit: 280,
    connectHref: "/api/social/oauth/x/start",
    connectLabel: "Ligar conta X",
    description: "Publica no teu perfil de X (Twitter).",
    setupHint: "Cria uma app em developer.x.com e define X_CLIENT_ID, X_CLIENT_SECRET e X_REDIRECT_URI no .env.",
  },
  LINKEDIN: {
    label: "LinkedIn",
    icon: Linkedin,
    color: "#0A66C2",
    bg: "bg-[#0A66C2]",
    charLimit: 3000,
    connectHref: "/api/social/oauth/linkedin/start",
    connectLabel: "Ligar LinkedIn",
    description: "Publica no teu perfil de LinkedIn.",
    setupHint: "Cria uma app em linkedin.com/developers e define LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET e LINKEDIN_REDIRECT_URI no .env.",
  },
  THREADS: {
    label: "Threads",
    icon: AtSign,
    color: "#101010",
    bg: "bg-zinc-900",
    charLimit: 500,
    connectHref: "/api/social/oauth/threads/start",
    connectLabel: "Ligar Threads",
    description: "Publica no teu perfil de Threads.",
    setupHint: "Adiciona o produto Threads à tua app Meta e define THREADS_APP_ID, THREADS_APP_SECRET e THREADS_REDIRECT_URI no .env.",
  },
  TIKTOK: {
    label: "TikTok",
    icon: Music2,
    color: "#010101",
    bg: "bg-black",
    charLimit: 2200,
    connectHref: null,
    connectLabel: "Em breve",
    description: "Publicação de vídeo. Requer app review da TikTok.",
    setupHint: "A Content Posting API da TikTok exige registo e aprovação da app (demora semanas).",
  },
  YOUTUBE: {
    label: "YouTube",
    icon: Youtube,
    color: "#FF0000",
    bg: "bg-[#FF0000]",
    charLimit: null,
    connectHref: null,
    connectLabel: "Em breve",
    description: "Upload de vídeos e Shorts.",
    setupHint: "Requer projecto Google Cloud com a YouTube Data API activada. Só faz sentido quando houver vídeo.",
  },
  PINTEREST: {
    label: "Pinterest",
    icon: Pin,
    color: "#E60023",
    bg: "bg-[#E60023]",
    charLimit: 500,
    connectHref: null,
    connectLabel: "Em breve",
    description: "Criação de pins com imagem e link.",
    setupHint: "Requer app em developers.pinterest.com com acesso standard aprovado.",
  },
};
