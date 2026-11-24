import type { SocialAccount, SocialPost } from "@prisma/client";
import { decrypt } from "../encryption";
import type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";

const GRAPH = "https://graph.threads.net/v1.0";

export class ThreadsProvider implements SocialProvider {
  async publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult> {
    try {
      const token = decrypt(account.accessToken);

      // O Threads não tem campo de link separado: anexa o URL ao texto
      let text = post.text;
      if (post.linkUrl && !text.includes(post.linkUrl)) text = `${text}\n\n${post.linkUrl}`;

      // 1. Criar o contentor
      const createRes = await fetch(`${GRAPH}/${account.accountId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ media_type: "TEXT", text, access_token: token }),
      });
      const createData = await createRes.json();
      if (!createRes.ok || createData.error) {
        return { success: false, error: createData.error?.message ?? `Erro ${createRes.status}`, response: createData };
      }

      // 2. Publicar o contentor
      const pubRes = await fetch(`${GRAPH}/${account.accountId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: createData.id, access_token: token }),
      });
      const pubData = await pubRes.json();
      if (!pubRes.ok || pubData.error) {
        return { success: false, error: pubData.error?.message ?? `Erro ${pubRes.status}`, response: pubData };
      }

      return { success: true, externalId: pubData.id, response: pubData };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  }

  async getAccountInfo(account: SocialAccount): Promise<AccountInfo> {
    const token = decrypt(account.accessToken);
    const res = await fetch(
      `${GRAPH}/me?fields=id,username,threads_profile_picture_url&access_token=${token}`
    );
    const data = await res.json();
    return {
      accountId: data.id ?? account.accountId,
      accountName: data.username ? `@${data.username}` : account.accountName,
      avatarUrl: data.threads_profile_picture_url,
    };
  }

  async refreshToken(account: SocialAccount): Promise<ConnectedAccount> {
    const token = decrypt(account.accessToken);
    const res = await fetch(
      `${GRAPH.replace("/v1.0", "")}/refresh_access_token?grant_type=th_refresh_token&access_token=${token}`
    );
    const data = await res.json();
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      avatarUrl: account.avatarUrl ?? undefined,
      accessToken: data.access_token ?? token,
      tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  }
}
