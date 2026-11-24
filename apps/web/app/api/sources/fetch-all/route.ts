import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchAllSources } from "@/lib/sources/fetcher";

export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const results = await fetchAllSources();
  const total = results.reduce((acc, r) => acc + r.items.length, 0);
  const errors = results.filter((r) => r.error).map((r) => r.error);

  return NextResponse.json({ total, errors });
}
