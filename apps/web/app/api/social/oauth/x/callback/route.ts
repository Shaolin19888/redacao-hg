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
  const codeVerifier = req.cookies.get("social_oauth_verifier")?.value;
  if (!state || !cookieState || state !== cookieState || !codeVerifier) {
    return NextResponse.redirect(new URL("/social/accounts?error=invalid_state", req.url));
  }
  if (!code) {
    return NextResponse.redirect(new URL("/social/accounts?error=no_code", req.url));
  }

  const clientId = process.env.X_CLIENT_ID!;
  const clientSecret = process.env.X_CLIENT_SECRET!;
  const redirectUri = process.env.X_REDIRECT_URI!;

  const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  // Dados do utilizador
  const meRes = await fetch("https://api.x.com/2/users/me?user.fields=profile_image_url", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const meData = await meRes.json();
  const user = meData.data;

  if (!user?.id) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  await prisma.socialAccount.upsert({
    where: { platform_accountId: { platform: "X", accountId: user.id } },
    update: {
      accountName: `@${user.username}`,
      accessToken: encrypt(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      avatarUrl: user.profile_image_url ?? null,
      status: "ACTIVE",
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    },
    create: {
      platform: "X",
      accountId: user.id,
      accountName: `@${user.username}`,
      accessToken: encrypt(tokenData.access_token),
      refreshToken: tokenData.refresh_token ? encrypt(tokenData.refresh_token) : null,
      avatarUrl: user.profile_image_url ?? null,
      status: "ACTIVE",
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    },
  });

  const res = NextResponse.redirect(new URL("/social/accounts?success=x", req.url));
  res.cookies.delete("social_oauth_state");
  res.cookies.delete("social_oauth_verifier");
  return res;
}
