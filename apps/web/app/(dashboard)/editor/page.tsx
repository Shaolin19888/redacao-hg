import { prisma } from "@/lib/prisma";
import { EditorPanel } from "@/components/editor/editor-panel";

export default async function EditorPage() {
  const newsItems = await prisma.newsItem.findMany({
    where: { status: { in: ["aprovada", "texto_gerado"] } },
    orderBy: { fetchedAt: "desc" },
    take: 100,
    include: {
      source: { select: { name: true } },
      generatedTexts: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Selecciona uma notícia, gera conteúdo e envia para WordPress.
        </p>
      </div>
      <EditorPanel newsItems={newsItems} />
    </div>
  );
}
