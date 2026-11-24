import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/social/encryption";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.redirect(new URL("/login", req.url));

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL("/social/accounts?error=cancelled", req.url));
  }

  const cookieState = req.cookies.get("social_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/social/accounts?error=invalid_state", req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/social/accounts?error=no_code", req.url));
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI!;

  // Trocar code por token
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  // Token longa duração
  const longRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  );
  const longData = await longRes.json();
  const longToken = longData.access_token ?? tokenData.access_token;

  // Obter páginas Facebook ligadas
  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${longToken}`);
  const pagesData = await pagesRes.json();
  const pages: Array<{ id: string; name: string; access_token: string }> = pagesData.data ?? [];

  let found = 0;

  for (const page of pages) {
    // Obter conta Instagram Business ligada à página
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    const igData = await igRes.json();
    const igId = igData.instagram_business_account?.id;
    if (!igId) continue;

    // Detalhes da conta Instagram
    const igInfoRes = await fetch(
      `https://graph.facebook.com/v21.0/${igId}?fields=id,username,profile_picture_url&access_token=${page.access_token}`
    );
    const igInfo = await igInfoRes.json();

    await prisma.socialAccount.upsert({
      where: { platform_accountId: { platform: "INSTAGRAM", accountId: igId } },
      update: {
        accountName: igInfo.username ?? igId,
        accessToken: encrypt(page.access_token),
        avatarUrl: igInfo.profile_picture_url ?? null,
        status: "ACTIVE",
        tokenExpiresAt: longData.expires_in
          ? new Date(Date.now() + longData.expires_in * 1000)
          : null,
      },
      create: {
        platform: "INSTAGRAM",
        accountId: igId,
        accountName: igInfo.username ?? igId,
        accessToken: encrypt(page.access_token),
        avatarUrl: igInfo.profile_picture_url ?? null,
        status: "ACTIVE",
        tokenExpiresAt: longData.expires_in
          ? new Date(Date.now() + longData.expires_in * 1000)
          : null,
      },
    });

    found++;
  }

  const res = NextResponse.redirect(
    new URL(found > 0 ? "/social/accounts?success=instagram" : "/social/accounts?error=no_instagram", req.url)
  );
  res.cookies.delete("social_oauth_state");
  return res;
}
