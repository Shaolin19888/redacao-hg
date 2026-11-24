import type { SocialAccount, SocialPost } from "@prisma/client";

export interface PublishResult {
  success: boolean;
  externalId?: string;
  error?: string;
  response?: unknown;
}

export interface AccountInfo {
  accountId: string;
  accountName: string;
  avatarUrl?: string;
}

export interface ConnectedAccount {
  accountId: string;
  accountName: string;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
}

export interface SocialProvider {
  publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult>;
  getAccountInfo(account: SocialAccount): Promise<AccountInfo>;
  refreshToken(account: SocialAccount): Promise<ConnectedAccount>;
}
