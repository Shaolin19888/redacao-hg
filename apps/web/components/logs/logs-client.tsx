"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Log {
  id: string;
  action: string;
  details: string | null;
  userId: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  source_fetch: { label: "Recolha", color: "bg-blue-50 text-blue-700" },
  news_saved: { label: "Guardada", color: "bg-green-50 text-green-700" },
  ai_generate: { label: "IA", color: "bg-purple-50 text-purple-700" },
  wp_draft: { label: "WP Rascunho", color: "bg-yellow-50 text-yellow-700" },
  wp_publish: { label: "WP Publicado", color: "bg-emerald-50 text-emerald-700" },
  push_send: { label: "Push", color: "bg-orange-50 text-orange-700" },
  login: { label: "Login", color: "bg-gray-50 text-gray-700" },
  error: { label: "Erro", color: "bg-red-50 text-red-700" },
};

const ACTIONS = Object.keys(ACTION_LABELS);

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_LABELS[action];
  const color = meta?.color ?? "bg-muted text-muted-foreground";
  const label = meta?.label ?? action;
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color)}>
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LogsClient() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  const [search, setSearch] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(search ? { search } : {}),
        ...(filterAction ? { action: filterAction } : {}),
      });
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, filterAction]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Pesquisar em logs..."
            className="w-full h-9 rounded-md border border-input bg-background px-3 pl-9 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          value={filterAction}
          onChange={(e) => { setFilterAction(e.target.value); setPage(1); }}
        >
          <option value="">Todas as acções</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>{ACTION_LABELS[a].label}</option>
          ))}
        </select>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="h-9 px-4 rounded-md border border-input bg-background text-sm flex items-center gap-2 hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Contagem */}
      <p className="text-sm text-muted-foreground">
        {total} {total === 1 ? "registo" : "registos"}
        {filterAction || search ? " (filtrado)" : ""}
      </p>

      {/* Tabela */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-44">Data</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-36">Acção</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={3} className="text-center py-10 text-muted-foreground">
                  {loading ? "A carregar..." : "Sem registos"}
                </td>
              </tr>
            ) : (
              logs.map((log) => (
                <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums whitespace-nowrap text-xs">
                    {formatDate(log.createdAt)}
                  </td>
                  <td className="px-4 py-2.5">
                    <ActionBadge action={log.action} />
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-0 truncate">
                    <span title={log.details ?? ""}>{log.details ?? "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="h-8 w-8 rounded-md border border-input bg-background flex items-center justify-center hover:bg-muted disabled:opacity-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
