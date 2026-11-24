import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/social/providers";

export async function publishPostNow(postId: string, accountIds?: string[]) {
  const post = await prisma.socialPost.findUnique({
    where: { id: postId },
    include: { targets: { include: { account: true } } },
  });
  if (!post) return;

  const targets = accountIds
    ? post.targets.filter((t) => accountIds.includes(t.accountId))
    : post.targets;

  for (const target of targets) {
    let success = false;
    let externalId: string | null = null;
    let response: object | undefined;
    let error: string | null = null;

    try {
      const provider = getProvider(target.account.platform);
      const result = await provider.publishPost(post, target.account);
      success = result.success;
      externalId = result.externalId ?? null;
      response = result.response ? (result.response as object) : undefined;
      error = result.error ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Erro desconhecido";
    }

    await prisma.socialPostTarget.update({
      where: { id: target.id },
      data: {
        status: success ? "PUBLISHED" : "FAILED",
        externalId,
        publishedAt: success ? new Date() : null,
      },
    });

    await prisma.socialPublishLog.create({
      data: {
        postId: post.id,
        accountId: target.accountId,
        platform: target.account.platform,
        status: success ? "SUCCESS" : "FAILURE",
        response,
        error,
      },
    });
  }

  const allTargets = await prisma.socialPostTarget.findMany({ where: { postId } });
  const published = allTargets.filter((t) => t.status === "PUBLISHED").length;
  const failed = allTargets.filter((t) => t.status === "FAILED").length;

  await prisma.socialPost.update({
    where: { id: postId },
    data: {
      status:
        published === allTargets.length ? "PUBLISHED"
        : failed === allTargets.length ? "FAILED"
        : published > 0 ? "PARTIAL"
        : "FAILED",
    },
  });
}

/**
 * Publica posts agendados cuja hora já passou.
 * Chamado de forma oportunista quando o painel consulta os posts.
 */
export async function processDueScheduledPosts() {
  const due = await prisma.socialPost.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: new Date() } },
    select: { id: true },
  });
  for (const post of due) {
    await publishPostNow(post.id);
  }
  return due.length;
}
