import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "LINKEDIN_CLIENT_ID ou LINKEDIN_REDIRECT_URI não configurados." }, { status: 500 });
  }

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile w_member_social",
    state,
  });

  const res = NextResponse.redirect(`https://www.linkedin.com/oauth/v2/authorization?${params}`);
  res.cookies.set("social_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
