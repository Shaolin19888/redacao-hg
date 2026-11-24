"use client";

import { useState } from "react";
import { Globe, RefreshCw, CheckCircle, XCircle, Clock, Trash2, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Source {
  id: string;
  name: string;
  url: string;
  rssUrl: string | null;
  active: boolean;
  autoPublish: boolean;
  autoModel: string;
  lastFetched: Date | null;
  _count: { newsItems: number };
}

interface FontesListProps {
  initialSources: Source[];
}

function formatDate(date: Date | null) {
  if (!date) return "Nunca";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(date));
}

export function FontesList({ initialSources }: FontesListProps) {
  const [sources, setSources] = useState(initialSources);
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [fetchingAll, setFetchingAll] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: "ok" | "error" } | null>(null);

  // Formulário de nova fonte
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newRss, setNewRss] = useState("");
  const [adding, setAdding] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function showMsg(text: string, type: "ok" | "error" = "ok") {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 4000);
  }

  async function toggleActive(id: string, current: boolean) {
    const res = await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !current }),
    });
    if (res.ok) setSources((prev) => prev.map((s) => (s.id === id ? { ...s, active: !current } : s)));
  }

  async function changeModel(id: string, model: string) {
    const res = await fetch(`/api/sources/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ autoModel: model }),
    });
    if (res.ok) setSources((prev) => prev.map((s) => (s.id === id ? { ...s, autoModel: model } : s)));
  }

  async function fetchOne(id: string) {
    setFetching((prev) => ({ ...prev, [id]: true }));
    setMessage(null);
    const res = await fetch(`/api/sources/${id}/fetch`, { method: "POST" });
    const data = await res.json();
    setFetching((prev) => ({ ...prev, [id]: false }));
    if (res.ok) {
      showMsg(`Recolhidas ${data.count} notícias.`);
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, lastFetched: new Date() } : s)));
    } else {
      showMsg(`Erro: ${data.error}`, "error");
    }
  }

  async function fetchAll() {
    setFetchingAll(true);
    setMessage(null);
    const res = await fetch("/api/sources/fetch-all", { method: "POST" });
    const data = await res.json();
    setFetchingAll(false);
    if (res.ok) {
      showMsg(`Recolhidas ${data.total} notícias no total.`);
      setSources((prev) => prev.map((s) => ({ ...s, lastFetched: new Date() })));
    } else {
      showMsg("Erro ao recolher fontes.", "error");
    }
  }

  async function removeSource(id: string) {
    setRemoving(id);
    const res = await fetch(`/api/sources/${id}`, { method: "DELETE" });
    setRemoving(null);
    setConfirmRemove(null);
    if (res.ok) {
      setSources((prev) => prev.filter((s) => s.id !== id));
      showMsg("Fonte removida.");
    } else {
      showMsg("Erro ao remover fonte.", "error");
    }
  }

  async function addSource() {
    setFormError(null);
    if (!newName.trim() || !newUrl.trim()) { setFormError("Nome e URL são obrigatórios."); return; }
    setAdding(true);
    const res = await fetch("/api/sources", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, url: newUrl, rssUrl: newRss || null }),
    });
    const data = await res.json();
    setAdding(false);
    if (res.ok) {
      setSources((prev) => [...prev, data]);
      setNewName(""); setNewUrl(""); setNewRss("");
      setShowForm(false);
      showMsg(`Fonte "${data.name}" adicionada.`);
    } else {
      setFormError(data.error ?? "Erro ao adicionar fonte.");
    }
  }

  return (
    <div className="space-y-4">
      {/* Barra de topo */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {sources.filter((s) => s.active).length} de {sources.length} fontes activas
        </p>
        <div className="flex gap-2">
          <button onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
            <Plus className="h-4 w-4" />
            Adicionar fonte
          </button>
          <button onClick={fetchAll} disabled={fetchingAll}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
            <RefreshCw className={cn("h-4 w-4", fetchingAll && "animate-spin")} />
            {fetchingAll ? "A recolher..." : "Recolher todas"}
          </button>
        </div>
      </div>

      {/* Formulário de nova fonte */}
      {showForm && (
        <div className="rounded-lg border bg-card p-5 space-y-4">
          <p className="text-sm font-medium">Nova fonte</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome *</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="Ex: Record"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL principal *</label>
              <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://www.record.pt"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL do RSS <span className="font-normal text-muted-foreground">(opcional)</span></label>
              <input type="url" value={newRss} onChange={(e) => setNewRss(e.target.value)}
                placeholder="https://www.record.pt/rss"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring" />
            </div>
          </div>
          {formError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />{formError}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={addSource} disabled={adding}
              className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <Plus className="h-4 w-4" />
              {adding ? "A adicionar..." : "Adicionar"}
            </button>
            <button onClick={() => { setShowForm(false); setFormError(null); }}
              className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Mensagem de feedback */}
      {message && (
        <p className={cn("text-sm rounded-md px-4 py-2", message.type === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
          {message.text}
        </p>
      )}

      {/* Tabela */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fonte</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notícias</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Última recolha</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acções</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="font-medium">{source.name}</p>
                      <a href={source.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline">
                        {source.url.replace(/^https?:\/\//, "")}
                      </a>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 flex-wrap">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      source.rssUrl ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700")}>
                      {source.rssUrl ? "RSS" : "Crawler"}
                    </span>
                    {source.autoPublish && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700">
                        Auto-reescreve
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{source._count.newsItems}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span className="text-xs">{formatDate(source.lastFetched)}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleActive(source.id, source.active)} className="flex items-center gap-1.5">
                    {source.active
                      ? <CheckCircle className="h-4 w-4 text-green-600" />
                      : <XCircle className="h-4 w-4 text-muted-foreground" />}
                    <span className={cn("text-xs", source.active ? "text-green-600" : "text-muted-foreground")}>
                      {source.active ? "Activa" : "Inactiva"}
                    </span>
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {source.autoPublish && (
                      <select value={source.autoModel} onChange={(e) => changeModel(source.id, e.target.value)}
                        className="rounded border border-input bg-background px-2 py-1 text-xs" title="Modelo de reescrita automática">
                        <option value="openai">ChatGPT</option>
                        <option value="claude">Claude</option>
                      </select>
                    )}
                    <button onClick={() => fetchOne(source.id)} disabled={fetching[source.id] || !source.active}
                      className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                      <RefreshCw className={cn("h-3.5 w-3.5", fetching[source.id] && "animate-spin")} />
                      {fetching[source.id] ? "A recolher..." : "Recolher"}
                    </button>

                    {/* Remover */}
                    {confirmRemove === source.id ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">Tens a certeza?</span>
                        <button onClick={() => removeSource(source.id)} disabled={removing === source.id}
                          className="inline-flex items-center gap-1 rounded-md bg-red-600 text-white px-2.5 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                          {removing === source.id ? "A remover..." : "Remover"}
                        </button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors">
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmRemove(source.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                        Remover
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma fonte configurada. Adiciona a primeira fonte acima.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
