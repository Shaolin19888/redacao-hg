# Social Hub — Especificação de Design

**Data:** 2026-06-30  
**Estado:** Aprovado  
**Localização:** Integrado em `apps/web` (Redação HG)

---

## 1. Visão geral

O Social Hub é um módulo integrado na Redação HG que permite ligar contas de redes sociais via OAuth e publicar conteúdos directamente a partir da aplicação.

O utilizador liga as suas contas de Facebook e Instagram, compõe um post com texto, URL, imagem e/ou vídeo, escolhe as contas onde publicar e decide entre publicação imediata (Automático) ou guardado sem publicar (Manual). O agendamento usa BullMQ para disparar a publicação à hora definida.

Não existe fluxo de aprovação no MVP. A responsabilidade de publicar é do utilizador.

---

## 2. Integração na app existente

O Social Hub é adicionado a `apps/web` como um conjunto de novas páginas e tabelas. Não é uma aplicação separada.

Reutiliza:
- Autenticação (Auth.js já existente)
- Prisma client (`lib/prisma.ts`)
- Redis (`lib/queue.ts`)
- Layout e navegação lateral

Acrescenta:
- Novas tabelas no schema Prisma
- Novas páginas em `app/(dashboard)/social-hub/`
- Novos providers em `lib/social/`
- Worker actualizado para processar jobs de publicação social

---

## 3. Navegação

```
Dashboard
Radar
Editor
Social Hub
  └ Contas ligadas    /social-hub/accounts
  └ Compositor        /social-hub/compose
  └ Agendados         /social-hub/scheduled
  └ Histórico         /social-hub/logs
Fontes
Logs
Definições
```

---

## 4. Schema da base de dados

### SocialAccount
Conta de rede social ligada via OAuth.

| Campo | Tipo | Notas |
|---|---|---|
| id | String (cuid) | PK |
| platform | Enum | FACEBOOK, INSTAGRAM |
| accountId | String | ID da conta na plataforma |
| accountName | String | Nome visível |
| avatarUrl | String? | Foto de perfil |
| accessToken | String | Encriptado AES-256 |
| refreshToken | String? | Encriptado AES-256 |
| tokenExpiresAt | DateTime? | Para refresh automático |
| status | Enum | ACTIVE, EXPIRED, ERROR |
| createdAt | DateTime | |
| updatedAt | DateTime | |

### Post
Conteúdo base criado no compositor.

| Campo | Tipo | Notas |
|---|---|---|
| id | String (cuid) | PK |
| text | String | Texto do post |
| linkUrl | String? | URL opcional |
| imageUrl | String? | Imagem carregada |
| videoUrl | String? | Vídeo carregado |
| mode | Enum | AUTO, MANUAL |
| scheduledAt | DateTime? | Só em AUTO com data |
| status | Enum | DRAFT, SCHEDULED, PUBLISHED, FAILED |
| createdAt | DateTime | |
| updatedAt | DateTime | |
| targets | PostTarget[] | |
| logs | PublishLog[] | |

### PostTarget
Relação entre um Post e uma SocialAccount (uma linha por conta seleccionada).

| Campo | Tipo | Notas |
|---|---|---|
| id | String (cuid) | PK |
| postId | String | FK Post |
| accountId | String | FK SocialAccount |
| status | Enum | PENDING, PUBLISHED, FAILED |
| externalId | String? | ID do post na plataforma |
| publishedAt | DateTime? | |

### PublishLog
Registo de cada tentativa de publicação.

| Campo | Tipo | Notas |
|---|---|---|
| id | String (cuid) | PK |
| postId | String | FK Post |
| accountId | String | FK SocialAccount |
| platform | Enum | |
| status | Enum | SUCCESS, FAILURE |
| response | Json? | Resposta da API |
| error | String? | Mensagem de erro |
| createdAt | DateTime | |

---

## 5. Interface do compositor

```
┌─────────────────────────────────────────────┐
│  Contas                                      │
│  ☑ Facebook — Página HugoGil               │
│  ☑ Instagram — @hugogil                    │
├─────────────────────────────────────────────┤
│  Texto                                       │
│  ┌───────────────────────────────────────┐  │
│  │                                       │  │
│  └───────────────────────────────────────┘  │
│  Link URL  [_________________________________]│
│  Imagem    [Carregar] ou arrastar            │
│  Vídeo     [Carregar] ou arrastar            │
├─────────────────────────────────────────────┤
│  Publicação                                  │
│  ○ Automático   ○ Manual                    │
│  Data/hora  [____/____/____ __:__]  (opt.)  │
├─────────────────────────────────────────────┤
│  [Guardar rascunho]    [Publicar / Agendar] │
└─────────────────────────────────────────────┘
```

Comportamento do botão principal:
- Automático sem data → "Publicar agora"
- Automático com data → "Agendar"
- Manual → "Guardar"

---

## 6. Fluxo OAuth Meta

```
1. Utilizador clica "Ligar Facebook"
2. GET /api/social/oauth/facebook/start
   → gera state aleatório
   → guarda state em Redis (TTL 10 min, anti-CSRF)
   → redireciona para Meta OAuth com scopes necessários
3. Meta redireciona para /api/social/oauth/facebook/callback
   → valida state contra Redis
   → troca code por access_token via Meta API
   → encripta token com AES-256
   → guarda SocialAccount na BD
   → redireciona para /social-hub/accounts com sucesso
```

Instagram usa o mesmo fluxo Meta. As permissões necessárias são:
- Facebook: `pages_manage_posts`, `pages_read_engagement`
- Instagram: `instagram_basic`, `instagram_content_publish`

---

## 7. Fluxo de publicação

### Imediato (Automático sem data)
```
Utilizador clica "Publicar agora"
→ POST /api/social/posts com mode: AUTO
→ API chama provider.publishPost() para cada conta seleccionada
→ Guarda PublishLog por conta
→ Actualiza PostTarget.status
→ Responde com resultado
```

### Agendado (Automático com data)
```
Utilizador clica "Agendar"
→ POST /api/social/posts com mode: AUTO + scheduledAt
→ Job entra na fila BullMQ com delay calculado
→ Worker dispara na hora certa
→ Chama provider.publishPost()
→ Guarda PublishLog
→ Actualiza status
```

### Manual
```
Utilizador clica "Guardar"
→ POST /api/social/posts com mode: MANUAL
→ Post fica em status DRAFT
→ Não entra na fila
→ Utilizador publica manualmente quando quiser
```

---

## 8. Providers

Interface base que todos os providers implementam:

```typescript
interface SocialProvider {
  publishPost(post: Post, account: SocialAccount): Promise<PublishResult>
  getAccountInfo(account: SocialAccount): Promise<AccountInfo>
  refreshToken(account: SocialAccount): Promise<SocialAccount>
}
```

Providers MVP:
- `lib/social/providers/facebook.ts`
- `lib/social/providers/instagram.ts`

---

## 9. Estrutura de ficheiros acrescentados

```
apps/web/
  app/(dashboard)/social-hub/
    accounts/page.tsx       ← listar e ligar contas
    compose/page.tsx        ← compositor de posts
    scheduled/page.tsx      ← posts agendados
    logs/page.tsx           ← histórico
  app/api/social/
    oauth/facebook/
      start/route.ts
      callback/route.ts
    oauth/instagram/
      start/route.ts
      callback/route.ts
    posts/route.ts          ← criar post
    posts/[id]/route.ts     ← publicar, apagar
  components/social/
    account-card.tsx
    composer.tsx
    scheduled-list.tsx
    log-list.tsx
  lib/social/
    providers/
      base.ts
      facebook.ts
      instagram.ts
    encryption.ts           ← AES-256 para tokens
    queue.ts                ← jobs de publicação
```

---

## 10. Segurança

- Tokens nunca guardados em texto claro. Encriptados com AES-256-GCM.
- Chave de encriptação apenas em `.env` (`SOCIAL_ENCRYPTION_KEY`).
- State OAuth guardado em Redis com TTL para prevenir CSRF.
- Nunca usar passwords de redes sociais, scraping ou bots de browser.
- Upload de media guardado localmente em `/public/uploads/social/` no MVP.

---

## 11. Variáveis de ambiente a acrescentar

```env
SOCIAL_ENCRYPTION_KEY=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_REDIRECT_URI=http://localhost:3000/api/social/oauth/facebook/callback
INSTAGRAM_APP_ID=
INSTAGRAM_APP_SECRET=
INSTAGRAM_REDIRECT_URI=http://localhost:3000/api/social/oauth/instagram/callback
```

---

## 12. Fora do MVP

- X, LinkedIn, TikTok, YouTube
- Relatórios e métricas
- Biblioteca de media avançada
- Múltiplas marcas/páginas
- Fluxo de aprovação
