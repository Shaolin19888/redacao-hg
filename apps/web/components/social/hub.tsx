"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Send, Plus, X, Trash2,
  CheckCircle2, AlertCircle, Clock, RotateCcw, Settings2, Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SocialComposer } from "./composer";
import { PLATFORM_META, type Platform } from "./platform-meta";

interface Account {
  id: string;
  platform: Platform;
  accountName: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "EXPIRED" | "ERROR";
}

interface Target {
  id: string;
  accountId: string;
  status: "PENDING" | "PUBLISHED" | "FAILED";
  account: Account;
}

interface Log {
  id: string;
  status: "SUCCESS" | "FAILURE";
  error: string | null;
  createdAt: string;
  account: Account;
}

interface Post {
  id: string;
  text: string;
  linkUrl: string | null;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "PARTIAL" | "FAILED";
  scheduledAt: string | null;
  createdAt: string;
  targets: Target[];
  logs: Log[];
}

type Tab = "fila" | "rascunhos" | "enviados" | "falhados";

const TABS: { key: Tab; label: string }[] = [
  { key: "fila", label: "Fila" },
  { key: "rascunhos", label: "Rascunhos" },
  { key: "enviados", label: "Enviados" },
  { key: "falhados", label: "Falhados" },
];

function Avatar({ account, size = "h-8 w-8" }: { account: Account; size?: string }) {
  const meta = PLATFORM_META[account.platform];
  const Icon = meta.icon;
  if (account.avatarUrl) {
    return <img src={account.avatarUrl} alt={account.accountName} className={cn(size, "rounded-full object-cover ring-2 ring-border shrink-0")} />;
  }
  return (
    <span className={cn(size, "rounded-full flex items-center justify-center text-white shrink-0", meta.bg)}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
}

function tabOf(post: Post): Tab {
  switch (post.status) {
    case "SCHEDULED": return "fila";
    case "DRAFT": return "rascunhos";
    case "PUBLISHED": return "enviados";
    default: return "falhados"; // FAILED + PARTIAL
  }
}

function groupByDay(posts: Post[], dateOf: (p: Post) => string) {
  const groups = new Map<string, Post[]>();
  for (const post of posts) {
    const key = new Date(dateOf(post)).toLocaleDateString("pt-PT", {
      weekday: "long", day: "numeric", month: "long",
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(post);
  }
  return Array.from(groups.entries());
}

export function SocialHub({ initialCompose = false }: { initialCompose?: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("fila");
  const [channel, setChannel] = useState<string | null>(null); // null = todos
  const [composeOpen, setComposeOpen] = useState(initialCompose);
  const [acting, setActing] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, postsRes] = await Promise.all([
        fetch("/api/social/accounts"),
        fetch("/api/social/posts"),
      ]);
      if (accRes.ok) setAccounts((await accRes.json()).accounts ?? []);
      if (postsRes.ok) setPosts((await postsRes.json()).posts ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Rascunho pré-carregado do editor abre o compositor automaticamente
  useEffect(() => {
    if (localStorage.getItem("redacao_hg_social_draft")) setComposeOpen(true);
  }, []);

  const filtered = useMemo(() => {
    let list = posts;
    if (channel) list = list.filter((p) => p.targets.some((t) => t.accountId === channel));
    return list;
  }, [posts, channel]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { fila: 0, rascunhos: 0, enviados: 0, falhados: 0 };
    for (const p of filtered) c[tabOf(p)]++;
    return c;
  }, [filtered]);

  const visible = filtered.filter((p) => tabOf(p) === tab);

  async function act(postId: string, body: object, okMsg: string) {
    setActing(postId); setActionMsg(null);
    try {
      const res = await fetch(`/api/social/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setActionMsg(res.ok ? { ok: true, msg: okMsg } : { ok: false, msg: data.error ?? "Erro." });
      if (res.ok) await load();
    } catch {
      setActionMsg({ ok: false, msg: "Erro de ligação." });
    }
    setActing(null);
  }

  async function remove(postId: string) {
    if (!confirm("Apagar este post?")) return;
    setActing(postId);
    const res = await fetch(`/api/social/posts/${postId}`, { method: "DELETE" });
    if (res.ok) await load();
    setActing(null);
  }

  return (
    <div className="flex gap-6 h-full min-h-[70vh]">
      {/* ── Rail de canais ── */}
      <aside className="w-56 shrink-0 space-y-1">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Canais</p>

        <button
          onClick={() => setChannel(null)}
          className={cn(
            "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
            channel === null ? "bg-zinc-900 text-white font-medium" : "text-muted-foreground hover:bg-muted"
          )}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-foreground shrink-0">
            <Inbox className="h-3.5 w-3.5" />
          </span>
          Todos os canais
        </button>

        {accounts.map((a) => (
          <button
            key={a.id}
            onClick={() => setChannel(channel === a.id ? null : a.id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
              channel === a.id ? "bg-zinc-900 text-white font-medium" : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Avatar account={a} size="h-7 w-7" />
            <span className="flex-1 truncate">{a.accountName}</span>
            <span className={cn(
              "h-1.5 w-1.5 rounded-full shrink-0",
              a.status === "ACTIVE" ? "bg-emerald-500" : "bg-amber-500"
            )} />
          </button>
        ))}

        <div className="pt-3 space-y-1 border-t mt-3">
          <a href="/social/accounts" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">
            <Settings2 className="h-4 w-4" /> Gerir canais
          </a>
        </div>
      </aside>

      {/* ── Vista principal ── */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Cabeçalho: separadores + novo post */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  tab === t.key ? "bg-zinc-900 text-white" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {counts[t.key] > 0 && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-px rounded-full font-semibold",
                    tab === t.key ? "bg-white/20" : "bg-muted",
                    t.key === "falhados" && tab !== t.key && "bg-red-100 text-red-700"
                  )}>
                    {counts[t.key]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={load} disabled={loading} title="Actualizar"
              className="p-2 rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40">
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <button onClick={() => setComposeOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3.5 py-2 text-sm font-medium hover:bg-red-700 transition-colors shadow-sm">
              <Plus className="h-4 w-4" /> Novo post
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className={cn(
            "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm",
            actionMsg.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"
          )}>
            {actionMsg.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span className="flex-1">{actionMsg.msg}</span>
            <button onClick={() => setActionMsg(null)} className="opacity-50 hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Lista */}
        {loading && posts.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" /> A carregar...
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              {tab === "fila" && "Nada na fila. Agenda um post para o veres aqui."}
              {tab === "rascunhos" && "Sem rascunhos guardados."}
              {tab === "enviados" && "Ainda não publicaste nada."}
              {tab === "falhados" && "Nenhuma publicação falhada. Bom sinal."}
            </p>
            {(tab === "fila" || tab === "rascunhos") && (
              <button onClick={() => setComposeOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700">
                <Plus className="h-4 w-4" /> Criar post
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-5">
            {groupByDay(visible, (p) => p.scheduledAt ?? p.createdAt).map(([day, dayPosts]) => (
              <div key={day} className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground capitalize px-1">{day}</p>
                {dayPosts.map((post) => {
                  const time = new Date(post.scheduledAt ?? post.createdAt).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
                  const failedTargets = post.targets.filter((t) => t.status === "FAILED");
                  const lastError = post.logs.find((l) => l.status === "FAILURE")?.error;
                  const busy = acting === post.id;

                  return (
                    <div key={post.id} className="flex items-start gap-3.5 rounded-xl border bg-card p-4 hover:border-foreground/10 transition-colors">
                      {/* Hora */}
                      <div className="flex flex-col items-center shrink-0 pt-0.5 w-11">
                        <span className="text-sm font-semibold tabular-nums">{time}</span>
                        {post.status === "SCHEDULED" && <Clock className="h-3 w-3 text-muted-foreground mt-1" />}
                      </div>

                      {/* Conteúdo */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm leading-snug whitespace-pre-wrap line-clamp-3">{post.text}</p>
                        {post.linkUrl && (
                          <a href={post.linkUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline truncate block">
                            {post.linkUrl}
                          </a>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Avatares dos canais */}
                          <div className="flex -space-x-1.5">
                            {post.targets.map((t) => (
                              <span key={t.id} title={`${t.account.accountName} — ${t.status === "PUBLISHED" ? "publicado" : t.status === "FAILED" ? "falhado" : "pendente"}`}>
                                <Avatar account={t.account} size="h-6 w-6" />
                              </span>
                            ))}
                          </div>
                          {tab === "falhados" && failedTargets.length > 0 && (
                            <span className="text-xs text-red-600 font-medium">
                              {post.status === "PARTIAL" ? "Parcial: " : ""}
                              {failedTargets.map((t) => t.account.accountName).join(", ")} falhou
                            </span>
                          )}
                        </div>
                        {tab === "falhados" && lastError && (
                          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5">{lastError}</p>
                        )}
                      </div>

                      {/* Acções */}
                      <div className="flex items-center gap-1 shrink-0">
                        {(post.status === "DRAFT" || post.status === "SCHEDULED") && (
                          <button
                            onClick={() => act(post.id, { action: "publish" }, "Publicado.")}
                            disabled={busy}
                            title="Publicar agora"
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 disabled:opacity-40 transition-colors"
                          >
                            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            Publicar
                          </button>
                        )}
                        {(post.status === "PUBLISHED" || post.status === "PARTIAL" || post.status === "FAILED") && (
                          <button
                            onClick={() => act(post.id, { action: "republish" }, "Republicado.")}
                            disabled={busy}
                            title="Republicar"
                            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                          >
                            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                            Republicar
                          </button>
                        )}
                        {post.status !== "PUBLISHED" && (
                          <button
                            onClick={() => remove(post.id)}
                            disabled={busy}
                            title="Apagar"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal do compositor ── */}
      {composeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={(e) => { if (e.target === e.currentTarget) setComposeOpen(false); }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-background shadow-2xl mt-8 mb-8">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-sm font-semibold">Novo post</h2>
              <button onClick={() => setComposeOpen(false)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-6">
              <SocialComposer onDone={() => { load(); }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
