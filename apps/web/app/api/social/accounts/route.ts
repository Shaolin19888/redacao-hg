import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const accounts = await prisma.socialAccount.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      platform: true,
      accountId: true,
      accountName: true,
      avatarUrl: true,
      status: true,
      tokenExpiresAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ accounts });
}
