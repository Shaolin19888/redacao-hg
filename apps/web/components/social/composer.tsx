"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Send, Clock, Save, AlertCircle, CheckCircle2, Link, ImageIcon, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLATFORM_META, type Platform } from "./platform-meta";

interface SocialAccount {
  id: string;
  platform: Platform;
  accountName: string;
  avatarUrl: string | null;
  status: "ACTIVE" | "EXPIRED" | "ERROR";
}

type Mode = "AUTO" | "MANUAL";

export function SocialComposer({ onDone }: { onDone?: () => void }) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const [text, setText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [mode, setMode] = useState<Mode>("AUTO");
  const [scheduledAt, setScheduledAt] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [draftBanner, setDraftBanner] = useState(false);

  useEffect(() => {
    // Pré-carregar rascunho do editor (após publicar no WordPress)
    const LS_KEY = "redacao_hg_social_draft";
    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved) as { text?: string; linkUrl?: string };
        if (draft.text) setText(draft.text);
        if (draft.linkUrl) setLinkUrl(draft.linkUrl);
        setDraftBanner(true);
        localStorage.removeItem(LS_KEY);
      } catch { /* ignore */ }
    }

    fetch("/api/social/accounts")
      .then((r) => r.json())
      .then((d) => {
        const active = (d.accounts as SocialAccount[]).filter((a) => a.status === "ACTIVE");
        setAccounts(active);
        setSelectedAccounts(active.map((a) => a.id));
      })
      .finally(() => setLoadingAccounts(false));
  }, []);

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  function clearForm() {
    setText(""); setLinkUrl(""); setImageUrl(""); setVideoUrl("");
    setScheduledAt(""); setError(null); setSuccessMsg(null);
  }

  async function handleSubmit() {
    setError(null); setSuccessMsg(null);
    if (!text.trim()) { setError("O texto é obrigatório."); return; }
    if (selectedAccounts.length === 0) { setError("Selecciona pelo menos uma conta."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text, linkUrl: linkUrl || null, imageUrl: imageUrl || null,
          videoUrl: videoUrl || null, mode,
          scheduledAt: scheduledAt || null, accountIds: selectedAccounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? `Erro ${res.status}`); return; }

      if (mode === "MANUAL") setSuccessMsg("Post guardado como rascunho.");
      else if (scheduledAt) setSuccessMsg(`Agendado para ${new Date(scheduledAt).toLocaleString("pt-PT")}.`);
      else setSuccessMsg("Publicado com sucesso.");
      clearForm();
      onDone?.();
    } catch { setError("Erro de ligação. Tenta novamente."); }
    finally { setSubmitting(false); }
  }

  const hasInstagram = selectedAccounts.some(
    (id) => accounts.find((a) => a.id === id)?.platform === "INSTAGRAM"
  );

  // Avisos de limite de caracteres para as plataformas seleccionadas
  const selectedPlatforms = Array.from(new Set(
    selectedAccounts
      .map((id) => accounts.find((a) => a.id === id)?.platform)
      .filter((p): p is Platform => !!p)
  ));
  const charWarnings = selectedPlatforms
    .map((p) => ({ label: PLATFORM_META[p].label, limit: PLATFORM_META[p].charLimit }))
    .filter((w): w is { label: string; limit: number } => w.limit !== null && text.length > w.limit);

  const buttonLabel = mode === "MANUAL" ? "Guardar rascunho" : scheduledAt ? "Agendar publicação" : "Publicar agora";
  const ButtonIcon = mode === "MANUAL" ? Save : scheduledAt ? Clock : Send;

  return (
    <div className="max-w-2xl">
      {/* Banner pré-carregado do editor */}
      {draftBanner && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
          <p className="flex-1 text-sm text-blue-800">Conteúdo pré-carregado a partir do artigo publicado.</p>
          <button onClick={() => setDraftBanner(false)} className="text-blue-400 hover:text-blue-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Alertas */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 mb-5">
          <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
          <span className="text-sm text-red-700 flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 mb-5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
          <span className="text-sm text-emerald-700 flex-1">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-600">✕</button>
        </div>
      )}

      <div className="space-y-4">
        {/* Contas */}
        <div className="rounded-xl border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Publicar em</p>
          {loadingAccounts ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> A carregar...
            </div>
          ) : accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma conta activa.{" "}
              <a href="/social/accounts" className="text-primary underline">Ligar conta</a>
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {accounts.map((account) => {
                const p = PLATFORM_META[account.platform];
                const Icon = p.icon;
                const selected = selectedAccounts.includes(account.id);
                return (
                  <button
                    key={account.id}
                    onClick={() => toggleAccount(account.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-all duration-150",
                      selected
                        ? "border-transparent text-white shadow-sm"
                        : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                    )}
                    style={selected ? { backgroundColor: p.color } : {}}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {account.accountName}
                    {selected && <X className="h-3 w-3 opacity-70" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Texto */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="p-5 pb-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">Texto</p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreve o texto do post..."
              rows={6}
              className="w-full bg-transparent text-sm resize-none focus:outline-none placeholder:text-muted-foreground/50 leading-relaxed"
            />
          </div>
          <div className="px-5 py-2.5 border-t bg-muted/30 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{text.length} caracteres</span>
            {charWarnings.map((w) => (
              <span key={w.label} className="text-xs text-amber-600 font-medium">Limite {w.label}: {w.limit}</span>
            ))}
          </div>
        </div>

        {/* Conteúdo adicional */}
        <div className="rounded-xl border bg-card p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1">Conteúdo adicional</p>
          {[
            { icon: Link, label: "Link URL", value: linkUrl, setter: setLinkUrl, placeholder: "https://hugogil.pt/...", note: null },
            { icon: ImageIcon, label: "Imagem (URL público)", value: imageUrl, setter: setImageUrl, placeholder: "https://...", note: hasInstagram ? "Obrigatório para publicar no Instagram" : null },
            { icon: Video, label: "Vídeo (URL público)", value: videoUrl, setter: setVideoUrl, placeholder: "https://...", note: null },
          ].map(({ icon: Icon, label, value, setter, placeholder, note }) => (
            <div key={label}>
              <div className="flex items-center gap-2.5 rounded-lg border border-input bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring transition-shadow">
                <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  type="url"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  placeholder={placeholder}
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground/50"
                />
                {value && (
                  <button onClick={() => setter("")} className="text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between px-1 mt-1">
                <p className="text-xs text-muted-foreground">{label}</p>
                {note && <p className="text-xs text-amber-600">{note}</p>}
              </div>
            </div>
          ))}
        </div>

        {/* Publicação */}
        <div className="rounded-xl border bg-card p-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Publicação</p>
          <div className="grid grid-cols-2 gap-2">
            {(["AUTO", "MANUAL"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded-lg border py-2.5 text-sm font-medium transition-all duration-150",
                  mode === m
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground"
                )}
              >
                {m === "AUTO" ? "Automático" : "Manual"}
              </button>
            ))}
          </div>

          {mode === "AUTO" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Data e hora <span className="opacity-60">(deixa em branco para publicar agora)</span>
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {mode === "MANUAL" && (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
              O post é guardado mas não publicado. Podes publicá-lo manualmente em Agendados.
            </p>
          )}
        </div>

        {/* Acções */}
        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSubmit}
            disabled={submitting || !text.trim() || selectedAccounts.length === 0}
            className="flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:bg-primary/90 disabled:opacity-40 transition-all duration-150 shadow-sm"
          >
            {submitting
              ? <RefreshCw className="h-4 w-4 animate-spin" />
              : <ButtonIcon className="h-4 w-4" />}
            {buttonLabel}
          </button>
          <button
            onClick={clearForm}
            className="rounded-lg border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
}
