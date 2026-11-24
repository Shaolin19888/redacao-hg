import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const account = await prisma.socialAccount.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });

  // Remover targets antes de apagar a conta
  await prisma.socialPostTarget.deleteMany({ where: { accountId: id } });
  await prisma.socialPublishLog.deleteMany({ where: { accountId: id } });
  await prisma.socialAccount.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
