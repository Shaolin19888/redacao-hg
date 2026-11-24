import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractArticleContent } from "@/lib/sources/article-extractor";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL em falta" }, { status: 400 });

  try {
    const content = await extractArticleContent(url);
    const preview = content?.slice(0, 300) ?? "";
    return NextResponse.json({ ok: true, preview, length: content?.length ?? 0 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
