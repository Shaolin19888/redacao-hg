"use client";

import { useState, useEffect } from "react";
import { Bell, Send, RefreshCw, CheckCircle, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Log {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
}

interface PushResult {
  ok: boolean;
  error?: string;
}

interface SendResults {
  onesignal?: PushResult;
  pushalert?: PushResult;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function parseDetails(details: string | null): { title?: string; body?: string; url?: string; results?: SendResults } | null {
  if (!details) return null;
  // Formato: 'Push enviado: "TÍTULO" — {"onesignal":...,"pushalert":...}'
  const match = details.match(/^Push enviado: "(.+?)" — (.+)$/);
  if (match) {
    try {
      const results = JSON.parse(match[2]) as SendResults;
      return { title: match[1], results };
    } catch { return { title: match[1] }; }
  }
  return null;
}

function ResultBadge({ label, result }: { label: string; result?: PushResult }) {
  if (!result) return null;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium",
      result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
    )}>
      {result.ok
        ? <CheckCircle className="h-3 w-3" />
        : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function HistoricoItem({ log }: { log: Log }) {
  const parsed = parseDetails(log.details);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-left"
      >
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground tabular-nums">{formatDate(log.createdAt)}</span>
            {parsed?.results && (
              <>
                <ResultBadge label="OneSignal" result={parsed.results.onesignal} />
                <ResultBadge label="PushAlert" result={parsed.results.pushalert} />
              </>
            )}
          </div>
          <p className="text-sm font-medium leading-snug truncate">
            {parsed?.title ?? log.details ?? "—"}
          </p>
        </div>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-1" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />}
      </button>
      {open && log.details && (
        <div className="px-4 py-3 border-t bg-muted/10">
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">{log.details}</p>
        </div>
      )}
    </div>
  );
}

export function PushClient() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // Formulário de envio manual
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [providers, setProviders] = useState<string[]>(["onesignal", "pushalert"]);
  const [sending, setSending] = useState(false);
  const [sendResults, setSendResults] = useState<SendResults | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  async function fetchLogs() {
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/logs?action=push_send&limit=30");
      const data = await res.json();
      setLogs(data.logs ?? []);
    } finally {
      setLoadingLogs(false);
    }
  }

  useEffect(() => { fetchLogs(); }, []);

  function toggleProvider(p: string) {
    setProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function sendPush() {
    if (!title.trim() || !body.trim() || !url.trim()) return;
    setSending(true);
    setSendResults(null);
    setSendError(null);

    try {
      const res = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, url, providers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSendError(data.error ?? "Erro desconhecido");
      } else {
        setSendResults(data.results);
        setTitle("");
        setBody("");
        setUrl("");
        await fetchLogs();
      }
    } catch (e) {
      setSendError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setSending(false);
    }
  }

  const canSend = title.trim() && body.trim() && url.trim() && providers.length > 0;

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Envio manual */}
      <div className="rounded-lg border bg-card p-5 space-y-5">
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Enviar push manual</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Última Hora Benfica"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Texto da notificação"
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL do artigo</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hugogil.pt/artigo"
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Providers</label>
          <div className="flex gap-3">
            {["onesignal", "pushalert"].map((p) => (
              <button
                key={p}
                onClick={() => toggleProvider(p)}
                className={cn(
                  "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors",
                  providers.includes(p)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-input bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                <Bell className="h-3.5 w-3.5" />
                {p === "onesignal" ? "OneSignal" : "PushAlert"}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={sendPush}
          disabled={!canSend || sending}
          className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Send className={cn("h-4 w-4", sending && "animate-pulse")} />
          {sending ? "A enviar..." : "Enviar push"}
        </button>

        {/* Resultados do envio */}
        {sendResults && (
          <div className="space-y-1.5">
            {Object.entries(sendResults).map(([provider, result]) => (
              <div
                key={provider}
                className={cn(
                  "flex items-center gap-2 text-sm rounded-md px-3 py-2",
                  result.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                )}
              >
                {result.ok
                  ? <CheckCircle className="h-4 w-4 shrink-0" />
                  : <XCircle className="h-4 w-4 shrink-0" />}
                <span className="font-medium capitalize">{provider}:</span>
                <span>{result.ok ? "enviado com sucesso" : result.error}</span>
              </div>
            ))}
          </div>
        )}

        {sendError && (
          <div className="flex items-center gap-2 text-sm rounded-md px-3 py-2 bg-red-50 text-red-700">
            <XCircle className="h-4 w-4 shrink-0" />
            {sendError}
          </div>
        )}
      </div>

      {/* Histórico */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Histórico de pushes enviados</h2>
          <button
            onClick={fetchLogs}
            disabled={loadingLogs}
            className="h-8 px-3 rounded-md border border-input bg-background text-sm flex items-center gap-2 hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loadingLogs && "animate-spin")} />
            Actualizar
          </button>
        </div>

        {loadingLogs ? (
          <p className="text-sm text-muted-foreground">A carregar...</p>
        ) : logs.length === 0 ? (
          <div className="rounded-lg border bg-card px-6 py-10 text-center">
            <p className="text-muted-foreground text-sm">Nenhum push enviado ainda.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <HistoricoItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
