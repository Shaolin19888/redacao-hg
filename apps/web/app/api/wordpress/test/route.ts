import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { testConnection } from "@/lib/wordpress/posts";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const result = await testConnection();
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
