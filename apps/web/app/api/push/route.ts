import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sendOneSignal } from "@/lib/push/onesignal";
import { sendPushAlert } from "@/lib/push/pushalert";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { title, body, url, providers = ["onesignal", "pushalert"] } =
    await req.json();

  if (!title || !body || !url) {
    return NextResponse.json(
      { error: "title, body e url são obrigatórios" },
      { status: 400 }
    );
  }

  const results: Record<string, { ok: boolean; error?: string }> = {};

  if (providers.includes("onesignal")) {
    try {
      await sendOneSignal({ title, body, url });
      results.onesignal = { ok: true };
    } catch (err) {
      results.onesignal = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (providers.includes("pushalert")) {
    try {
      await sendPushAlert({ title, message: body, url });
      results.pushalert = { ok: true };
    } catch (err) {
      results.pushalert = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  await prisma.log.create({
    data: {
      action: "push_send",
      details: `Push enviado: "${title}" — ${JSON.stringify(results)}`,
      userId: session.user?.id,
    },
  });

  return NextResponse.json({ results });
}
