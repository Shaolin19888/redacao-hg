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

  const appId = process.env.THREADS_APP_ID!;
  const appSecret = process.env.THREADS_APP_SECRET!;
  const redirectUri = process.env.THREADS_REDIRECT_URI!;

  // Trocar code por token de curta duração
  const tokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  // Trocar por token de longa duração (~60 dias)
  const longRes = await fetch(
    `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`
  );
  const longData = await longRes.json();
  const token = longData.access_token ?? tokenData.access_token;
  const expiresIn = longData.expires_in ?? null;

  // Dados do perfil
  const meRes = await fetch(
    `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${token}`
  );
  const me = await meRes.json();

  if (!me?.id) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  await prisma.socialAccount.upsert({
    where: { platform_accountId: { platform: "THREADS", accountId: me.id } },
    update: {
      accountName: me.username ? `@${me.username}` : "Threads",
      accessToken: encrypt(token),
      avatarUrl: me.threads_profile_picture_url ?? null,
      status: "ACTIVE",
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    },
    create: {
      platform: "THREADS",
      accountId: me.id,
      accountName: me.username ? `@${me.username}` : "Threads",
      accessToken: encrypt(token),
      avatarUrl: me.threads_profile_picture_url ?? null,
      status: "ACTIVE",
      tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    },
  });

  const res = NextResponse.redirect(new URL("/social/accounts?success=threads", req.url));
  res.cookies.delete("social_oauth_state");
  return res;
}
