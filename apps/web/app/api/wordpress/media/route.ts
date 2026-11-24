import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USER;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;

  if (!wpUrl || !wpUser || !wpPass) {
    return NextResponse.json({ error: "WordPress não configurado" }, { status: 500 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Ficheiro em falta" }, { status: 400 });

  const buffer = await file.arrayBuffer();
  const token = Buffer.from(`${wpUser}:${wpPass}`).toString("base64");

  const res = await fetch(`${wpUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Disposition": `attachment; filename="${file.name}"`,
      "Content-Type": file.type,
    },
    body: buffer,
  });

  const data = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: data.message ?? "Erro ao carregar imagem" }, { status: res.status });
  }

  return NextResponse.json({
    id: data.id,
    title: data.title?.rendered ?? file.name,
    alt_text: data.alt_text ?? "",
    source_url: data.source_url,
    media_details: data.media_details,
  });
}

export async function GET(req: NextRequest) {
  const wpUrl = process.env.WORDPRESS_URL;
  const wpUser = process.env.WORDPRESS_USER;
  const wpPass = process.env.WORDPRESS_APP_PASSWORD;

  if (!wpUrl || !wpUser || !wpPass) {
    return NextResponse.json({ error: "WordPress não configurado" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") ?? "";
  const page = searchParams.get("page") ?? "1";
  const perPage = "24";

  const params = new URLSearchParams({
    media_type: "image",
    per_page: perPage,
    page,
    orderby: "date",
    order: "desc",
    _fields: "id,title,alt_text,source_url,media_details",
  });
  if (search) params.set("search", search);

  const token = Buffer.from(`${wpUser}:${wpPass}`).toString("base64");
  const res = await fetch(`${wpUrl}/wp-json/wp/v2/media?${params}`, {
    headers: { Authorization: `Basic ${token}` },
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Erro ao carregar media do WordPress" }, { status: res.status });
  }

  const total = parseInt(res.headers.get("X-WP-Total") ?? "0");
  const totalPages = parseInt(res.headers.get("X-WP-TotalPages") ?? "1");
  const items = await res.json();

  return NextResponse.json({ items, total, totalPages, page: parseInt(page) });
}
