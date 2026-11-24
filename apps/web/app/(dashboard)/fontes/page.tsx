import { prisma } from "@/lib/prisma";
import { FontesList } from "@/components/fontes/fontes-list";

export default async function FontesPage() {
  const sources = await prisma.source.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { newsItems: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Fontes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fontes editoriais activas para recolha de notícias
        </p>
      </div>
      <FontesList initialSources={sources} />
    </div>
  );
}
