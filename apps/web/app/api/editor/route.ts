import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { generate } from "@/lib/ai/generate";
import type { GenerateRequest } from "@/lib/ai/types";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = (await req.json()) as GenerateRequest;

  if (!body.newsItemId && !body.urlExtra && !body.textoLivre) {
    return NextResponse.json({ error: "É necessário seleccionar uma notícia, colar um URL ou escrever texto" }, { status: 400 });
  }

  try {
    const content = await generate(body);
    return NextResponse.json(content);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
