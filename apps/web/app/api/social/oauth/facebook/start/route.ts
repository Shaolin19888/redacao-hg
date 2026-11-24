import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json({ error: "FACEBOOK_APP_ID ou FACEBOOK_REDIRECT_URI não configurados." }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "pages_manage_posts,pages_read_engagement,pages_show_list",
    response_type: "code",
    state,
  });

  const url = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;

  const res = NextResponse.redirect(url);
  res.cookies.set("social_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutos
    path: "/",
  });

  return res;
}
