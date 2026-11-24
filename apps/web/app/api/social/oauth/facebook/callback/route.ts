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

  // Utilizador cancelou o OAuth
  if (error) {
    return NextResponse.redirect(new URL("/social/accounts?error=cancelled", req.url));
  }

  // Validar state anti-CSRF
  const cookieState = req.cookies.get("social_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/social/accounts?error=invalid_state", req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/social/accounts?error=no_code", req.url));
  }

  const appId = process.env.FACEBOOK_APP_ID!;
  const appSecret = process.env.FACEBOOK_APP_SECRET!;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI!;

  // Trocar code por token de curta duração
  const tokenRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
  );
  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  // Trocar por token de longa duração
  const longRes = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
  );
  const longData = await longRes.json();
  const longToken = longData.access_token ?? tokenData.access_token;

  // Obter páginas ligadas à conta
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${longToken}`
  );
  const pagesData = await pagesRes.json();
  const pages: Array<{ id: string; name: string; access_token: string; picture?: { data?: { url?: string } } }> =
    pagesData.data ?? [];

  if (pages.length === 0) {
    return NextResponse.redirect(new URL("/social/accounts?error=no_pages", req.url));
  }

  // Guardar cada página como uma SocialAccount separada
  for (const page of pages) {
    // Obter foto da página
    const picRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}/picture?type=square&redirect=false&access_token=${page.access_token}`
    );
    const picData = await picRes.json().catch(() => ({}));
    const avatarUrl = picData.data?.url ?? null;

    await prisma.socialAccount.upsert({
      where: { platform_accountId: { platform: "FACEBOOK", accountId: page.id } },
      update: {
        accountName: page.name,
        accessToken: encrypt(page.access_token),
        avatarUrl,
        status: "ACTIVE",
        tokenExpiresAt: longData.expires_in
          ? new Date(Date.now() + longData.expires_in * 1000)
          : null,
      },
      create: {
        platform: "FACEBOOK",
        accountId: page.id,
        accountName: page.name,
        accessToken: encrypt(page.access_token),
        avatarUrl,
        status: "ACTIVE",
        tokenExpiresAt: longData.expires_in
          ? new Date(Date.now() + longData.expires_in * 1000)
          : null,
      },
    });
  }

  const res = NextResponse.redirect(new URL("/social/accounts?success=facebook", req.url));
  res.cookies.delete("social_oauth_state");
  return res;
}
