import type { SocialPlatform } from "@prisma/client";
import { FacebookProvider } from "./facebook";
import { InstagramProvider } from "./instagram";
import { XProvider } from "./x";
import { LinkedInProvider } from "./linkedin";
import { ThreadsProvider } from "./threads";
import type { SocialProvider } from "./base";

export function getProvider(platform: SocialPlatform): SocialProvider {
  switch (platform) {
    case "FACEBOOK":
      return new FacebookProvider();
    case "INSTAGRAM":
      return new InstagramProvider();
    case "X":
      return new XProvider();
    case "LINKEDIN":
      return new LinkedInProvider();
    case "THREADS":
      return new ThreadsProvider();
    default:
      throw new Error(`Provider ainda não implementado: ${platform}`);
  }
}

export type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";
