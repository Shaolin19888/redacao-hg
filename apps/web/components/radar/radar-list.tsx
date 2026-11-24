"use client";

import { useState } from "react";
import { ExternalLink, RefreshCw, Check, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewsItem {
  id: string;
  title: string;
  url: string;
  status: string;
  fetchedAt: Date;
  publishedAt: Date | null;
  summary: string | null;
  source: { name: string };
}

interface Source {
  id: string;
  name: string;
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

interface RadarListProps {
  initialItems: NewsItem[];
  sources: Source[];
}

export function RadarList({ initialItems, sources }: RadarListProps) {
  const [items, setItems] = useState(initialItems);
  const [filterSource, setFilterSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState<"approve" | "reject" | null>(null);

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams({ status: "nova" });
    if (filterSource) params.set("sourceId", filterSource);
    const res = await fetch(`/api/news?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setSelected(new Set());
    }
    setLoading(false);
  }

  async function approve(id: string) {
    setActionLoading(id + "-approve");
    setActionError(null);
    try {
      const res = await fetch(`/api/news/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "aprovada" }),
      });
      if (res.ok) {
        removeItems([id]);
      } else {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? `Erro ${res.status}`);
      }
    } catch {
      setActionError("Erro de ligação");
    }
    setActionLoading(null);
  }

  async function reject(id: string) {
    setActionLoading(id + "-reject");
    setActionError(null);
    try {
      const res = await fetch(`/api/news/${id}`, { method: "DELETE" });
      if (res.ok) {
        removeItems([id]);
      } else {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? `Erro ${res.status}`);
      }
    } catch {
      setActionError("Erro de ligação");
    }
    setActionLoading(null);
  }

  function removeItems(ids: string[]) {
    const idSet = new Set(ids);
    setItems((prev) => prev.filter((item) => !idSet.has(item.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  const filtered = items.filter((item) => {
    if (filterSource && item.source.name !== sources.find((s) => s.id === filterSource)?.name) return false;
    return true;
  });

  const allSelected = filtered.length > 0 && filtered.every((item) => selected.has(item.id));
  const someSelected = selected.size > 0;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (filtered.every((item) => prev.has(item.id))) {
        // desmarcar apenas os visíveis
        const next = new Set(prev);
        filtered.forEach((item) => next.delete(item.id));
        return next;
      }
      const next = new Set(prev);
      filtered.forEach((item) => next.add(item.id));
      return next;
    });
  }

  async function bulk(action: "approve" | "reject") {
    const ids = filtered.filter((item) => selected.has(item.id)).map((item) => item.id);
    if (ids.length === 0) return;
    if (action === "reject" && !confirm(`Rejeitar ${ids.length} ${ids.length === 1 ? "notícia" : "notícias"}? Esta acção não pode ser anulada.`)) return;

    setBulkLoading(action);
    setActionError(null);
    try {
      const res = await fetch("/api/news/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action }),
      });
      if (res.ok) {
        removeItems(ids);
      } else {
        const d = await res.json().catch(() => ({}));
        setActionError(d.error ?? `Erro ${res.status}`);
      }
    } catch {
      setActionError("Erro de ligação");
    }
    setBulkLoading(null);
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="ml-2 text-red-500 hover:text-red-700">✕</button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">Todas as fontes</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Actualizar
        </button>
        <span className="text-sm text-muted-foreground ml-auto">
          {filtered.length} {filtered.length === 1 ? "notícia" : "notícias"}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground text-sm">
            Nenhuma notícia encontrada. Vai a{" "}
            <a href="/fontes" className="underline">Fontes</a>{" "}
            e clica em "Recolher" para começar.
          </p>
        </div>
      ) : (
        <>
          {/* Barra de selecção */}
          <div className={cn(
            "sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border bg-card/95 backdrop-blur px-4 py-2.5 transition-shadow",
            someSelected && "shadow-sm border-foreground/20"
          )}>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                onChange={toggleAll}
                className="h-4 w-4 rounded border-input accent-zinc-900 cursor-pointer"
              />
              <span className="font-medium">
                {someSelected ? `${selected.size} seleccionada${selected.size === 1 ? "" : "s"}` : "Seleccionar todas"}
              </span>
            </label>

            {someSelected && (
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => bulk("approve")}
                  disabled={bulkLoading !== null}
                  className="flex items-center gap-1.5 rounded-md bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {bulkLoading === "approve"
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <Check className="h-3.5 w-3.5" />}
                  Aprovar {selected.size}
                </button>
                <button
                  onClick={() => bulk("reject")}
                  disabled={bulkLoading !== null}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {bulkLoading === "reject"
                    ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    : <X className="h-3.5 w-3.5" />}
                  Rejeitar {selected.size}
                </button>
                <button
                  onClick={() => setSelected(new Set())}
                  disabled={bulkLoading !== null}
                  className="text-xs text-muted-foreground hover:text-foreground underline disabled:opacity-50"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            {filtered.map((item) => {
              const approvingThis = actionLoading === item.id + "-approve";
              const rejectingThis = actionLoading === item.id + "-reject";
              const isSelected = selected.has(item.id);
              const busy = approvingThis || rejectingThis || bulkLoading !== null;
              return (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-lg border bg-card p-4 transition-colors",
                    busy ? "opacity-60" : "hover:border-foreground/20",
                    isSelected && "border-foreground/30 bg-muted/30"
                  )}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleOne(item.id)}
                      className="h-4 w-4 mt-0.5 rounded border-input accent-zinc-900 cursor-pointer shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">{item.source.name}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground">{formatDate(item.fetchedAt)}</span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-sm hover:underline flex items-start gap-1.5 group"
                      >
                        <span>{item.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                      {item.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => approve(item.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-md bg-green-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        {approvingThis
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <Check className="h-3.5 w-3.5" />}
                        Aprovar
                      </button>
                      <button
                        onClick={() => reject(item.id)}
                        disabled={busy}
                        className="flex items-center gap-1.5 rounded-md border border-red-200 text-red-600 px-3 py-1.5 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                      >
                        {rejectingThis
                          ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          : <X className="h-3.5 w-3.5" />}
                        Rejeitar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
