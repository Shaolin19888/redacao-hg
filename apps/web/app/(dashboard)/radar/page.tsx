import { prisma } from "@/lib/prisma";
import { RadarList } from "@/components/radar/radar-list";

export default async function RadarPage() {
  const [newsItems, sources] = await Promise.all([
    prisma.newsItem.findMany({
      where: { status: "nova" },
      orderBy: { fetchedAt: "desc" },
      take: 100,
      include: { source: { select: { name: true } } },
    }),
    prisma.source.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const total = await prisma.newsItem.count();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Radar de Notícias</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {total} notícias recolhidas no total
        </p>
      </div>
      <RadarList initialItems={newsItems} sources={sources} />
    </div>
  );
}
