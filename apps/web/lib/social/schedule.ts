import { prisma } from "@/lib/prisma";
import { decrypt } from "./encryption";

/**
 * Agenda a publicação de um post social. O Facebook suporta agendamento nativo
 * (published=false + scheduled_publish_time), por isso não é preciso um cron local: o
 * próprio Facebook publica à hora marcada. O tempo tem de ser 10 min a 75 dias no futuro.
 */
export async function scheduleSocialPost(
  postId: string,
  whenUnixSeconds: number
): Promise<{ scheduled: number; failed: number }> {
  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    include: { targets: { include: { account: true } } },
  });
  if (!post) return { scheduled: 0, failed: 0 };

  let scheduled = 0;
  let failed = 0;

  for (const target of post.targets) {
    if (target.account.platform !== "FACEBOOK") continue; // agendamento nativo só no Facebook
    try {
      const token = decrypt(target.account.accessToken);
      const body: Record<string, string> = {
        message: post.text,
        published: "false",
        scheduled_publish_time: String(whenUnixSeconds),
        access_token: token,
      };
      if (post.linkUrl) body.link = post.linkUrl;

      const res = await fetch(`https://graph.facebook.com/v21.0/${target.account.accountId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const ok = res.ok && !data.error;

      await prisma.socialPostTarget.update({
        where: { id: target.id },
        data: { status: ok ? "SCHEDULED" : "FAILED", externalId: data.id ?? null },
      });
      await prisma.socialPublishLog.create({
        data: {
          postId: post.id,
          accountId: target.accountId,
          platform: target.account.platform,
          status: ok ? "SUCCESS" : "FAILURE",
          response: data as object,
          error: ok ? null : data.error?.message ?? `Erro ${res.status}`,
        },
      });
      if (ok) scheduled++;
      else failed++;
    } catch {
      failed++;
    }
  }

  if (scheduled > 0) {
    await prisma.socialPost.update({
      where: { id: post.id },
      data: { status: "SCHEDULED", scheduledAt: new Date(whenUnixSeconds * 1000) },
    });
  }

  return { scheduled, failed };
}
