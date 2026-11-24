import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json({ error: "FACEBOOK_APP_ID ou INSTAGRAM_REDIRECT_URI não configurados." }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  // Instagram Business usa o mesmo OAuth da Meta, com scopes diferentes
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement",
    response_type: "code",
    state,
  });

  const url = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  const res = NextResponse.redirect(url);
  res.cookies.set("social_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return res;
}
