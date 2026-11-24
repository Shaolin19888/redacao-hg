import type { SocialAccount, SocialPost } from "@prisma/client";
import { decrypt } from "../encryption";
import type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";

export class LinkedInProvider implements SocialProvider {
  async publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult> {
    try {
      const token = decrypt(account.accessToken);
      const author = `urn:li:person:${account.accountId}`;

      const body = {
        author,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text: post.text },
            shareMediaCategory: post.linkUrl ? "ARTICLE" : "NONE",
            ...(post.linkUrl
              ? { media: [{ status: "READY", originalUrl: post.linkUrl }] }
              : {}),
          },
        },
        visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
      };

      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        return { success: false, error: data.message ?? `Erro ${res.status}`, response: data };
      }
      return { success: true, externalId: data.id ?? res.headers.get("x-restli-id") ?? undefined, response: data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  }

  async getAccountInfo(account: SocialAccount): Promise<AccountInfo> {
    const token = decrypt(account.accessToken);
    const res = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return {
      accountId: data.sub ?? account.accountId,
      accountName: data.name ?? account.accountName,
      avatarUrl: data.picture,
    };
  }

  async refreshToken(account: SocialAccount): Promise<ConnectedAccount> {
    // Tokens LinkedIn duram ~60 dias; sem refresh programático no fluxo básico,
    // o utilizador volta a ligar a conta quando expirar.
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      avatarUrl: account.avatarUrl ?? undefined,
      accessToken: decrypt(account.accessToken),
      tokenExpiresAt: account.tokenExpiresAt ?? undefined,
    };
  }
}
