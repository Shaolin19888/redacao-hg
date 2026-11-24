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

  const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI!,
      client_id: process.env.LINKEDIN_CLIENT_ID!,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
    }),
  });
  const tokenData = await tokenRes.json();

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  const meRes = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const me = await meRes.json();

  if (!me?.sub) {
    return NextResponse.redirect(new URL("/social/accounts?error=token_exchange", req.url));
  }

  await prisma.socialAccount.upsert({
    where: { platform_accountId: { platform: "LINKEDIN", accountId: me.sub } },
    update: {
      accountName: me.name ?? "LinkedIn",
      accessToken: encrypt(tokenData.access_token),
      avatarUrl: me.picture ?? null,
      status: "ACTIVE",
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    },
    create: {
      platform: "LINKEDIN",
      accountId: me.sub,
      accountName: me.name ?? "LinkedIn",
      accessToken: encrypt(tokenData.access_token),
      avatarUrl: me.picture ?? null,
      status: "ACTIVE",
      tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
    },
  });

  const res = NextResponse.redirect(new URL("/social/accounts?success=linkedin", req.url));
  res.cookies.delete("social_oauth_state");
  return res;
}
