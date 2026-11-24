import type { SocialAccount, SocialPost } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "../encryption";
import type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";

function basicAuth() {
  return "Basic " + Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString("base64");
}

/** Tokens do X expiram em ~2h; renova e persiste se estiver perto de expirar. */
async function ensureFreshToken(account: SocialAccount): Promise<string> {
  const expiresSoon = account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now() + 5 * 60_000;
  if (!expiresSoon || !account.refreshToken) return decrypt(account.accessToken);

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basicAuth() },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(account.refreshToken),
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description ?? "Falha ao renovar token do X");

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: data.refresh_token ? encrypt(data.refresh_token) : account.refreshToken,
      tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    },
  });
  return data.access_token;
}

export class XProvider implements SocialProvider {
  async publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult> {
    try {
      const token = await ensureFreshToken(account);

      // O X não tem campo de link separado: anexa o URL ao texto
      let text = post.text;
      if (post.linkUrl && !text.includes(post.linkUrl)) text = `${text}\n\n${post.linkUrl}`;

      const res = await fetch("https://api.x.com/2/tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();

      if (!res.ok || data.errors) {
        return { success: false, error: data.errors?.[0]?.message ?? data.detail ?? `Erro ${res.status}`, response: data };
      }
      return { success: true, externalId: data.data?.id, response: data };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  }

  async getAccountInfo(account: SocialAccount): Promise<AccountInfo> {
    const token = await ensureFreshToken(account);
    const res = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return {
      accountId: data.data?.id ?? account.accountId,
      accountName: data.data?.username ? `@${data.data.username}` : account.accountName,
      avatarUrl: data.data?.profile_image_url,
    };
  }

  async refreshToken(account: SocialAccount): Promise<ConnectedAccount> {
    const token = await ensureFreshToken(account);
    const fresh = await prisma.socialAccount.findUnique({ where: { id: account.id } });
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      avatarUrl: account.avatarUrl ?? undefined,
      accessToken: token,
      tokenExpiresAt: fresh?.tokenExpiresAt ?? undefined,
    };
  }
}
