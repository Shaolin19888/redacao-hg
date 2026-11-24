import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { wpFetch } from "@/lib/wordpress/client";

interface WpPost {
  id: number;
  date: string;
  modified: string;
  slug: string;
  status: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
  categories: number[];
  tags: number[];
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") ?? "any";
  const page = searchParams.get("page") ?? "1";
  const perPage = "20";

  try {
    const posts = await wpFetch<WpPost[]>(
      `/posts?status=${status}&page=${page}&per_page=${perPage}&orderby=modified&order=desc&_fields=id,date,modified,slug,status,title,excerpt,link,categories,tags`
    );

    return NextResponse.json({ posts });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
