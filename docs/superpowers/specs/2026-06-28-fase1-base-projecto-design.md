# Fase 1 — Base do Projecto: Design Spec

**Data:** 2026-06-28  
**Projecto:** Redação HG  
**Estado:** Aprovado

---

## Objectivo

Criar a base do monorepo com Next.js 15, shadcn/ui, Tailwind, Prisma, PostgreSQL, Redis e Docker Compose. Incluir login com NextAuth e painel inicial com sidebar. Nenhuma funcionalidade editorial nesta fase.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend + Backend | Next.js 15 (App Router + API routes) |
| UI | shadcn/ui + Tailwind CSS |
| ORM | Prisma |
| Base de dados | PostgreSQL 16 |
| Filas | Redis 7 (preparado para BullMQ) |
| Auth | NextAuth.js v5 com credenciais |
| Runtime | Node.js v25 |
| Infra local | Docker Compose |
| Linguagem | TypeScript |

---

## Estrutura de pastas

```
redacao-hg/
  apps/
    web/
      app/
        (auth)/
          login/
            page.tsx
        (dashboard)/
          layout.tsx
          page.tsx
        api/
          auth/
            [...nextauth]/
              route.ts
      components/
        ui/                  ← shadcn components
        layout/
          sidebar.tsx
          header.tsx
          dashboard-layout.tsx
      lib/
        prisma.ts
        auth.ts
      prisma/
        schema.prisma
        migrations/
      package.json
      next.config.ts
      tsconfig.json
      tailwind.config.ts
      components.json
  packages/
    shared/
      src/
        types/
          index.ts
      package.json
      tsconfig.json
    editorial/              ← scaffold vazio
    wordpress/              ← scaffold vazio
    sources/                ← scaffold vazio
    ai/                     ← scaffold vazio
  infra/
    docker/
      postgres/
        init.sql
  docs/
    superpowers/specs/
  .env.example
  .gitignore
  docker-compose.yml
  package.json              ← workspaces npm
  tsconfig.base.json
  CLAUDE.md
```

---

## Base de dados — Schema Prisma inicial

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String
  role      String   @default("editor")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Source {
  id          String     @id @default(cuid())
  name        String
  url         String     @unique
  rssUrl      String?
  active      Boolean    @default(true)
  lastFetched DateTime?
  createdAt   DateTime   @default(now())
  newsItems   NewsItem[]
}

model NewsItem {
  id          String      @id @default(cuid())
  title       String
  url         String      @unique
  sourceId    String
  source      Source      @relation(fields: [sourceId], references: [id])
  publishedAt DateTime?
  fetchedAt   DateTime    @default(now())
  status      String      @default("nova")
  summary     String?
  groupId     String?
  group       NewsGroup?  @relation(fields: [groupId], references: [id])
  createdAt   DateTime    @default(now())
}

model NewsGroup {
  id        String     @id @default(cuid())
  topic     String
  status    String     @default("aberta")
  items     NewsItem[]
  createdAt DateTime   @default(now())
}

model Log {
  id        String   @id @default(cuid())
  action    String
  details   String?
  userId    String?
  createdAt DateTime @default(now())
}
```

---

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: redacao_hg
      POSTGRES_USER: redacao
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Autenticação

NextAuth.js v5 com `CredentialsProvider`. Credenciais de um utilizador inicial definidas em `.env`. O utilizador é criado via script de seed ao iniciar.

---

## Painel inicial

- Sidebar com links: Radar, Fontes, Grupos, Editor, Logs, Configurações
- Dashboard home: cards com estado vazio para cada módulo
- Header com nome do utilizador e botão de logout
- Design com shadcn/ui, tema neutral, sem cores forçadas

---

## Variáveis de ambiente (.env.example)

```env
# Base de dados
DATABASE_URL=postgresql://redacao:password@localhost:5432/redacao_hg
POSTGRES_PASSWORD=

# Redis
REDIS_URL=redis://localhost:6379

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Utilizador inicial do painel
ADMIN_EMAIL=
ADMIN_PASSWORD=
ADMIN_NAME=

# OpenAI (preparado para Fase 5)
OPENAI_API_KEY=
OPENAI_MODEL_TEXT=gpt-4o
OPENAI_MODEL_FAST=gpt-4o-mini

# Anthropic (preparado para Fase 5)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_TEXT=claude-sonnet-4-6

# WordPress (preparado para Fase 6)
WORDPRESS_URL=
WORDPRESS_USER=
WORDPRESS_APP_PASSWORD=
WORDPRESS_DEFAULT_STATUS=draft

# Google Drive (futuro)
GOOGLE_DRIVE_CLIENT_ID=
GOOGLE_DRIVE_CLIENT_SECRET=
GOOGLE_DRIVE_REFRESH_TOKEN=

# Push (futuro)
ONESIGNAL_APP_ID=
ONESIGNAL_API_KEY=
```

---

## O que esta fase NÃO inclui

- Recolha de fontes
- Geração de texto com IA
- Integração WordPress
- Redes sociais
- Push notifications
- Qualquer automação editorial

---

## Critérios de aceitação

- [ ] `docker compose up` arranca PostgreSQL e Redis sem erros
- [ ] `npm run dev` arranca o painel em localhost:3000
- [ ] Login com credenciais do `.env` funciona
- [ ] Sidebar e dashboard home renderizam correctamente
- [ ] Prisma migrate cria as tabelas na base de dados
- [ ] Seed cria o utilizador admin
- [ ] `.env` está no `.gitignore`
- [ ] Nenhuma credencial no código
