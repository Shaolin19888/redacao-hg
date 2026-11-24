"use client";

import { useEffect, useState } from "react";
import { Trash2, RefreshCw, AlertCircle, CheckCircle2, Zap, Plus, ExternalLink, Eye, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "./platform-meta";

interface MetaStatus {
  configured: boolean;
  hasAccount?: boolean;
  page?: { id: string; name: string; accessible: boolean; url: string };
  lastPost?: {
    text: string;
    publishedAt: string;
    check: { id: string; isPublished: boolean; privacy: string; url: string } | null;
  } | null;
}

function MetaDiagnostic() {
  const [status, setStatus] = useState<MetaStatus | null>(null);
  const [loading, setLoading] = useState(false);

  async function check() {
    setLoading(true);
    const res = await fetch("/api/social/meta-status");
    if (res.ok) setStatus(await res.json());
    setLoading(false);
  }

  if (!status) {
    return (
      <button
        onClick={check}
        disabled={loading}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        Verificar diagnóstico Facebook
      </button>
    );
  }

  if (!status.configured) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Credenciais Meta não configuradas no .env.
      </div>
    );
  }

  if (!status.hasAccount) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        Nenhuma conta Facebook activa ligada.
      </div>
    );
  }

  const post = status.lastPost;
  const postCheck = post?.check;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Diagnóstico Facebook</p>
        <button onClick={() => { setStatus(null); check(); }} disabled={loading} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Actualizar
        </button>
      </div>

      {status.page && (
        <div className="flex items-center gap-2">
          {status.page.accessible
            ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            : <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />}
          <span className="text-sm">
            Página <strong>{status.page.name}</strong>{" "}
            {status.page.accessible ? "acessível" : "inacessível"}
          </span>
          <a href={status.page.url} target="_blank" rel="noreferrer"
            className="ml-auto flex items-center gap-1 text-xs text-[#1877F2] hover:underline shrink-0">
            <ExternalLink className="h-3 w-3" /> Abrir página
          </a>
        </div>
      )}

      {post ? (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Último post publicado</p>
          <p className="text-xs leading-relaxed">{post.text}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {new Date(post.publishedAt).toLocaleString("pt-PT")}
            </span>
            {postCheck && (
              <>
                <span className={cn(
                  "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium",
                  postCheck.isPublished
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-red-50 border-red-200 text-red-700"
                )}>
                  {postCheck.isPublished ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertCircle className="h-2.5 w-2.5" />}
                  {postCheck.isPublished ? "Publicado" : "Não publicado"}
                </span>
                <span className="text-xs text-muted-foreground">Visibilidade: {postCheck.privacy}</span>
                <a href={postCheck.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-[#1877F2] hover:underline">
                  <ExternalLink className="h-3 w-3" /> Ver no Facebook
                </a>
              </>
            )}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Ainda não há posts publicados via Social Hub.</p>
      )}
    </div>
  );
}

interface SocialAccount {
  id: string;
  platform: Platform;
  accountId: string;
  accountName: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "EXPIRED" | "ERROR";
  tokenExpiresAt: string | null;
  createdAt: string;
}

const PLATFORM_ORDER: Platform[] = [
  "FACEBOOK", "INSTAGRAM", "X", "THREADS", "LINKEDIN", "PINTEREST", "TIKTOK", "YOUTUBE",
];

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: "Ligação cancelada.",
  no_pages: "Nenhuma Página de Facebook encontrada. Certifica-te que tens pelo menos uma Página activa.",
  no_instagram: "Nenhuma conta Instagram Business encontrada. O Instagram tem de estar ligado à tua Página de Facebook.",
  invalid_state: "Erro de segurança no OAuth. Tenta novamente.",
  token_exchange: "Erro ao obter token. Tenta novamente.",
  no_code: "Resposta OAuth incompleta. Tenta novamente.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  facebook: "Página de Facebook ligada com sucesso.",
  instagram: "Conta de Instagram ligada com sucesso.",
  x: "Conta de X ligada com sucesso.",
  linkedin: "Conta de LinkedIn ligada com sucesso.",
  threads: "Conta de Threads ligada com sucesso.",
};

export function SocialAccountsHub() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [configured, setConfigured] = useState<Partial<Record<Platform, boolean>>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [hintOpen, setHintOpen] = useState<Platform | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("success");
    const e = params.get("error");
    if (s && SUCCESS_MESSAGES[s]) setSuccess(SUCCESS_MESSAGES[s]);
    if (e && ERROR_MESSAGES[e]) setError(ERROR_MESSAGES[e]);
    if (s || e) window.history.replaceState({}, "", "/social/accounts");
    load();
  }, []);

  async function load() {
    setLoading(true);
    const [accRes, platRes] = await Promise.all([
      fetch("/api/social/accounts"),
      fetch("/api/social/platforms"),
    ]);
    if (accRes.ok) setAccounts((await accRes.json()).accounts);
    if (platRes.ok) setConfigured(await platRes.json());
    setLoading(false);
  }

  async function deleteAccount(id: string, name: string) {
    if (!confirm(`Desligar "${name}"? Os posts já publicados não serão afectados.`)) return;
    setDeleting(id);
    const res = await fetch(`/api/social/accounts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
    } else {
      setError("Erro ao desligar conta.");
    }
    setDeleting(null);
  }

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Alertas */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-red-700">{error}</div>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-emerald-700">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-emerald-600 text-xs">✕</button>
        </div>
      )}

      {/* Ligar novo canal */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Ligar canal</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PLATFORM_ORDER.map((platform) => {
            const p = PLATFORM_META[platform];
            const Icon = p.icon;
            const connected = accounts.filter((a) => a.platform === platform).length;
            const isConfigured = configured[platform] ?? false;
            const available = isConfigured && p.connectHref;

            const inner = (
              <>
                <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center text-white shrink-0", p.bg)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{p.label}</span>
                    {connected > 0 && (
                      <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">
                        {connected} ligada{connected > 1 ? "s" : ""}
                      </span>
                    )}
                    {!available && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">
                        {p.connectHref ? "por configurar" : "em breve"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                  {hintOpen === platform && p.setupHint && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2">
                      {p.setupHint}
                    </p>
                  )}
                </div>
                {available
                  ? <Plus className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0 mt-0.5" />
                  : <Lock className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />}
              </>
            );

            if (available) {
              return (
                <a key={platform} href={p.connectHref!}
                  className="group relative overflow-hidden rounded-xl border bg-card p-5 hover:shadow-md transition-all duration-200 hover:-translate-y-0.5 flex items-start gap-4">
                  {inner}
                </a>
              );
            }

            return (
              <button key={platform} type="button"
                onClick={() => setHintOpen(hintOpen === platform ? null : platform)}
                className="relative overflow-hidden rounded-xl border border-dashed bg-card/60 p-5 flex items-start gap-4 text-left opacity-80 hover:opacity-100 transition-opacity">
                {inner}
              </button>
            );
          })}
        </div>
      </div>

      {/* Diagnóstico Meta */}
      <MetaDiagnostic />

      {/* Canais ligados */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="h-4 w-4 animate-spin" /> A carregar contas...
        </div>
      ) : accounts.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Canais ligados</p>
          <div className="space-y-2">
            {PLATFORM_ORDER.flatMap((platform) =>
              accounts.filter((a) => a.platform === platform).map((account) => {
                const p = PLATFORM_META[platform];
                const Icon = p.icon;
                const isDeleting = deleting === account.id;
                return (
                  <div
                    key={account.id}
                    className="flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-foreground/10 transition-colors"
                  >
                    <div className={cn("w-1 self-stretch rounded-full shrink-0", p.bg)} />

                    {account.avatarUrl ? (
                      <img
                        src={account.avatarUrl}
                        alt={account.accountName}
                        className="h-10 w-10 rounded-full object-cover ring-2 ring-border shrink-0"
                      />
                    ) : (
                      <div className={cn("h-10 w-10 rounded-full flex items-center justify-center text-white shrink-0", p.bg)}>
                        <Icon className="h-4 w-4" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm truncate block">{account.accountName}</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Icon className="h-3 w-3 shrink-0" style={{ color: p.color }} />
                        <span className="text-xs text-muted-foreground">{p.label}</span>
                        {account.tokenExpiresAt && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground">
                              Expira {new Date(account.tokenExpiresAt).toLocaleDateString("pt-PT")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {account.status === "ACTIVE" ? (
                      <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shrink-0">
                        <Zap className="h-3 w-3" />
                        Activa
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full shrink-0">
                        <AlertCircle className="h-3 w-3" />
                        {account.status === "EXPIRED" ? "Expirada" : "Erro"}
                      </div>
                    )}

                    <button
                      onClick={() => deleteAccount(account.id, account.accountName)}
                      disabled={isDeleting}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors shrink-0"
                      title="Desligar conta"
                    >
                      {isDeleting
                        ? <RefreshCw className="h-4 w-4 animate-spin" />
                        : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
