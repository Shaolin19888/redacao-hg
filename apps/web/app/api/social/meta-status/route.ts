import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/social/encryption";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId || !appSecret) {
    return NextResponse.json({ configured: false, error: "FACEBOOK_APP_ID ou FACEBOOK_APP_SECRET não configurados." });
  }

  // Buscar a conta Facebook activa
  const account = await prisma.socialAccount.findFirst({
    where: { platform: "FACEBOOK", status: "ACTIVE" },
  });

  if (!account) {
    return NextResponse.json({ configured: true, hasAccount: false });
  }

  const token = decrypt(account.accessToken);

  // Buscar último post publicado
  const lastLog = await prisma.socialPublishLog.findFirst({
    where: { platform: "FACEBOOK", status: "SUCCESS" },
    orderBy: { createdAt: "desc" },
    include: { post: { select: { text: true } } },
  });

  // Verificar visibilidade do último post (se existir)
  let lastPostCheck: { id: string; isPublished: boolean; privacy: string; url: string } | null = null;

  if (lastLog) {
    const target = await prisma.socialPostTarget.findFirst({
      where: { postId: lastLog.postId, accountId: account.id, status: "PUBLISHED" },
    });
    if (target?.externalId) {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${target.externalId}?fields=id,is_published,privacy&access_token=${token}`
      );
      const data = await res.json();
      if (!data.error) {
        lastPostCheck = {
          id: target.externalId,
          isPublished: data.is_published,
          privacy: data.privacy?.description ?? data.privacy?.value ?? "Desconhecido",
          url: `https://www.facebook.com/${target.externalId.replace("_", "/posts/")}`,
        };
      }
    }
  }

  // Verificar permissões da app na página
  const permRes = await fetch(
    `https://graph.facebook.com/v21.0/${account.accountId}?fields=id,name&access_token=${token}`
  );
  const permData = await permRes.json();

  return NextResponse.json({
    configured: true,
    hasAccount: true,
    page: {
      id: account.accountId,
      name: account.accountName,
      accessible: !permData.error,
      url: `https://www.facebook.com/${account.accountId}`,
    },
    lastPost: lastLog ? {
      text: lastLog.post.text.slice(0, 80) + (lastLog.post.text.length > 80 ? "…" : ""),
      publishedAt: lastLog.createdAt,
      check: lastPostCheck,
    } : null,
  });
}
