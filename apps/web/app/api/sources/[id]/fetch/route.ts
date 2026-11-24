import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchSource } from "@/lib/sources/fetcher";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const result = await fetchSource(id);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ count: result.items.length });
}
