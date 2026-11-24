import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const appId = process.env.THREADS_APP_ID;
  const redirectUri = process.env.THREADS_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return NextResponse.json({ error: "THREADS_APP_ID ou THREADS_REDIRECT_URI não configurados." }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "threads_basic,threads_content_publish",
    response_type: "code",
    state,
  });

  const res = NextResponse.redirect(`https://threads.net/oauth/authorize?${params}`);
  res.cookies.set("social_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
