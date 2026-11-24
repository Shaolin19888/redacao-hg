import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const env = process.env;
  return NextResponse.json({
    FACEBOOK: !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET && env.FACEBOOK_REDIRECT_URI),
    INSTAGRAM: !!(env.FACEBOOK_APP_ID && env.FACEBOOK_APP_SECRET && env.INSTAGRAM_REDIRECT_URI),
    X: !!(env.X_CLIENT_ID && env.X_CLIENT_SECRET && env.X_REDIRECT_URI),
    LINKEDIN: !!(env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET && env.LINKEDIN_REDIRECT_URI),
    THREADS: !!(env.THREADS_APP_ID && env.THREADS_APP_SECRET && env.THREADS_REDIRECT_URI),
    TIKTOK: false,
    YOUTUBE: false,
    PINTEREST: false,
  });
}
