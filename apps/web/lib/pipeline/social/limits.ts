import type { SocialPlatform } from "@prisma/client";

/**
 * Limites de caracteres por plataforma (dados puros, sem React — usável no worker).
 * Espelha components/social/platform-meta.tsx.
 */
export const CHAR_LIMITS: Record<SocialPlatform, number | null> = {
  FACEBOOK: 63206,
  INSTAGRAM: 2200,
  X: 280,
  LINKEDIN: 3000,
  THREADS: 500,
  TIKTOK: 2200,
  YOUTUBE: null,
  PINTEREST: 500,
};

export const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  X: "X",
  LINKEDIN: "LinkedIn",
  THREADS: "Threads",
  TIKTOK: "TikTok",
  YOUTUBE: "YouTube",
  PINTEREST: "Pinterest",
};
