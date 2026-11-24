import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;

  if (!email || !password || !name) {
    console.error("ADMIN_EMAIL, ADMIN_PASSWORD e ADMIN_NAME são obrigatórios no .env");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Utilizador ${email} já existe.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, name, password: hashed, role: "admin" },
  });

  console.log(`Utilizador admin criado: ${user.email}`);

  // Fontes iniciais
  const sources = [
    { name: "Record", url: "https://www.record.pt", rssUrl: "https://www.record.pt/rss" },
    { name: "A Bola", url: "https://www.abola.pt", rssUrl: null },
    { name: "O Jogo", url: "https://www.ojogo.pt", rssUrl: null },
    { name: "Mais Futebol", url: "https://maisfutebol.iol.pt", rssUrl: null },
    { name: "Bola na Rede", url: "https://bolanarede.pt", rssUrl: null },
    { name: "Glorioso 1904", url: "https://glorioso1904.pt", rssUrl: null },
  ];

  for (const s of sources) {
    await prisma.source.upsert({
      where: { url: s.url },
      update: {},
      create: s,
    });
  }

  console.log(`${sources.length} fontes criadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
