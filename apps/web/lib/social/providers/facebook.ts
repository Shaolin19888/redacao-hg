import type { SocialAccount, SocialPost } from "@prisma/client";
import { decrypt } from "../encryption";
import type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";

/**
 * Força o Facebook a (re)ler o link e actualizar a pré-visualização em cache. É exactamente
 * o que o Sharing Debugger faz à mão.
 *
 * Porque é preciso: publicamos nas redes logo a seguir a publicar no site. Na primeira vez
 * que o Facebook lê o URL, a página pode ainda não estar servida completa (cache do site a
 * gerar), e ele guarda uma pré-visualização SEM imagem nem título. Depois fica assim para
 * sempre, até alguém forçar nova leitura. Ao pedir o scrape ANTES de publicar, o cartão já
 * sai com a miniatura certa.
 *
 * Devolve o que o Facebook conseguiu ler, para se poder confirmar que apanhou a imagem.
 */
async function scrapeLink(url: string, token: string): Promise<{ ok: boolean; hasImage: boolean; title?: string }> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/?id=${encodeURIComponent(url)}&scrape=true&access_token=${encodeURIComponent(token)}`,
      { method: "POST" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) return { ok: false, hasImage: false };
    const og = data?.og_object as { title?: string; image?: unknown } | undefined;
    const imagens = data?.image as unknown[] | undefined;
    const hasImage = Boolean((Array.isArray(imagens) && imagens.length > 0) || og?.image);
    return { ok: true, hasImage, title: og?.title };
  } catch {
    return { ok: false, hasImage: false };
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FacebookProvider implements SocialProvider {
  async publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult> {
    try {
      const token = decrypt(account.accessToken);

      // Actualizar a pré-visualização ANTES de publicar, para o cartão sair com miniatura.
      // Se à primeira o Facebook não apanhar a imagem (página ainda a ser gerada), damos-lhe
      // uma segunda oportunidade — é mais barato do que um post sem miniatura.
      let preview: { ok: boolean; hasImage: boolean; title?: string } | null = null;
      if (post.linkUrl) {
        preview = await scrapeLink(post.linkUrl, token);
        if (!preview.hasImage) {
          await esperar(3000);
          preview = await scrapeLink(post.linkUrl, token);
        }
      }

      const body: Record<string, string> = { message: post.text, access_token: token };
      if (post.linkUrl) body.link = post.linkUrl;

      const res = await fetch(`https://graph.facebook.com/v21.0/${account.accountId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return { success: false, error: data.error?.message ?? `Erro ${res.status}`, response: data };
      }

      // Guardar como correu a pré-visualização: se o post sair sem miniatura, o log diz porquê.
      return {
        success: true,
        externalId: data.id,
        response: {
          ...data,
          preVisualizacao: preview
            ? preview.hasImage
              ? "miniatura confirmada"
              : preview.ok
                ? "o Facebook leu o link mas não encontrou imagem"
                : "não foi possível actualizar a pré-visualização (API do Facebook indisponível)"
            : "sem link",
        },
      };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  }

  async getAccountInfo(account: SocialAccount): Promise<AccountInfo> {
    const token = decrypt(account.accessToken);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${account.accountId}?fields=id,name,picture&access_token=${token}`
    );
    const data = await res.json();
    return {
      accountId: data.id,
      accountName: data.name,
      avatarUrl: data.picture?.data?.url,
    };
  }

  async refreshToken(account: SocialAccount): Promise<ConnectedAccount> {
    const token = decrypt(account.accessToken);
    const appId = process.env.FACEBOOK_APP_ID!;
    const appSecret = process.env.FACEBOOK_APP_SECRET!;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${token}`
    );
    const data = await res.json();

    return {
      accountId: account.accountId,
      accountName: account.accountName,
      avatarUrl: account.avatarUrl ?? undefined,
      accessToken: data.access_token,
      tokenExpiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    };
  }
}
