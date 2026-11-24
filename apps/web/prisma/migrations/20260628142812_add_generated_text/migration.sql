-- CreateTable
CREATE TABLE "GeneratedText" (
    "id" TEXT NOT NULL,
    "newsItemId" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "formato" TEXT NOT NULL DEFAULT 'noticia',
    "tom" TEXT NOT NULL DEFAULT 'informativo',
    "instrucoes" TEXT,
    "conteudo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'gerado',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedText_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "GeneratedText" ADD CONSTRAINT "GeneratedText_newsItemId_fkey" FOREIGN KEY ("newsItemId") REFERENCES "NewsItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
