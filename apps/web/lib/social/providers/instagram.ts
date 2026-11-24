import type { SocialAccount, SocialPost } from "@prisma/client";
import { decrypt } from "../encryption";
import type { SocialProvider, PublishResult, AccountInfo, ConnectedAccount } from "./base";

export class InstagramProvider implements SocialProvider {
  async publishPost(post: SocialPost, account: SocialAccount): Promise<PublishResult> {
    try {
      const token = decrypt(account.accessToken);

      // Passo 1: criar container de media
      const containerBody: Record<string, string> = {
        caption: post.text,
        access_token: token,
      };

      if (post.imageUrl) {
        containerBody.image_url = post.imageUrl;
        containerBody.media_type = "IMAGE";
      } else if (post.videoUrl) {
        containerBody.video_url = post.videoUrl;
        containerBody.media_type = "REELS";
      } else {
        // post sem media não é suportado no Instagram
        return { success: false, error: "Instagram requer imagem ou vídeo." };
      }

      const containerRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.accountId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        }
      );
      const containerData = await containerRes.json();

      if (!containerRes.ok || containerData.error) {
        return { success: false, error: containerData.error?.message ?? `Erro ${containerRes.status}`, response: containerData };
      }

      // Passo 2: publicar container
      const publishRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.accountId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creation_id: containerData.id, access_token: token }),
        }
      );
      const publishData = await publishRes.json();

      if (!publishRes.ok || publishData.error) {
        return { success: false, error: publishData.error?.message ?? `Erro ${publishRes.status}`, response: publishData };
      }

      return { success: true, externalId: publishData.id, response: publishData };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Erro desconhecido" };
    }
  }

  async getAccountInfo(account: SocialAccount): Promise<AccountInfo> {
    const token = decrypt(account.accessToken);
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${account.accountId}?fields=id,username,profile_picture_url&access_token=${token}`
    );
    const data = await res.json();
    return {
      accountId: data.id,
      accountName: data.username,
      avatarUrl: data.profile_picture_url,
    };
  }

  async refreshToken(account: SocialAccount): Promise<ConnectedAccount> {
    // Instagram usa o mesmo token do Facebook ligado à página
    return {
      accountId: account.accountId,
      accountName: account.accountName,
      avatarUrl: account.avatarUrl ?? undefined,
      accessToken: decrypt(account.accessToken),
    };
  }
}
