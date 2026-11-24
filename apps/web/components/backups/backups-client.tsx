"use client";

import { useEffect, useState } from "react";
import { HardDrive, RefreshCw, Trash2, PlayCircle } from "lucide-react";

interface BackupFile {
  name: string;
  size: number;
  sizeHuman: string;
  createdAt: string;
}

function parseDate(name: string): string {
  // redacao_hg_20260628_030000.sql.gz → 2026-06-28 03:00
  const m = name.match(/redacao_hg_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/);
  if (!m) return name;
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

export function BackupsClient() {
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [dir, setDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runOutput, setRunOutput] = useState("");
  const [runError, setRunError] = useState("");
  const [deletingName, setDeletingName] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/backups");
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Erro ao carregar");
      }
      const d = await res.json();
      setBackups(d.backups);
      setDir(d.dir);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function runBackup() {
    setRunning(true);
    setRunOutput("");
    setRunError("");
    try {
      const res = await fetch("/api/backups", { method: "POST" });
      const d = await res.json();
      if (!res.ok) {
        setRunError(d.error ?? "Erro");
        setRunOutput(d.output ?? "");
      } else {
        setRunOutput(d.output ?? "Backup concluído.");
        await load();
      }
    } finally {
      setRunning(false);
    }
  }

  async function deleteBackup(name: string) {
    setDeletingName(name);
    try {
      const res = await fetch("/api/backups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) await load();
    } finally {
      setDeletingName(null);
    }
  }

  const lastBackup = backups[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Backups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {backups.length > 0
              ? `${backups.length} backup${backups.length !== 1 ? "s" : ""} disponível${backups.length !== 1 ? "eis" : ""}`
              : "Nenhum backup encontrado"}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="px-3 py-2 border rounded-md text-sm hover:bg-muted flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Actualizar
          </button>
          <button
            onClick={runBackup}
            disabled={running}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            <PlayCircle className="h-4 w-4" />
            {running ? "A fazer backup..." : "Fazer backup agora"}
          </button>
        </div>
      </div>

      {/* Estado do último backup */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Último backup</p>
          <p className="font-medium text-sm">
            {lastBackup ? parseDate(lastBackup.name) : "—"}
          </p>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Tamanho do último</p>
          <p className="font-medium text-sm">{lastBackup?.sizeHuman ?? "—"}</p>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <p className="text-xs text-muted-foreground mb-1">Pasta de backups</p>
          <p className="font-mono text-xs text-muted-foreground truncate" title={dir}>{dir || "—"}</p>
        </div>
      </div>

      {/* Output do backup manual */}
      {(runOutput || runError) && (
        <div className={`rounded-lg border p-4 ${runError ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <p className="text-xs font-medium mb-2 ${runError ? 'text-red-700' : 'text-green-700'}">
            {runError ? "Erro no backup" : "Backup concluído"}
          </p>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
            {runError || runOutput}
          </pre>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
      )}

      {/* Lista de backups */}
      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar...</p>
      ) : backups.length === 0 ? (
        <div className="border rounded-lg p-8 text-center">
          <HardDrive className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum backup encontrado.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Clica em "Fazer backup agora" para criar o primeiro.
          </p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Ficheiro</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Data</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs">Tamanho</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {backups.map((b, i) => (
                <tr key={b.name} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {b.name}
                    {i === 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-xs font-sans">
                        mais recente
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">{parseDate(b.name)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{b.sizeHuman}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => {
                        if (confirm(`Apagar ${b.name}?`)) deleteBackup(b.name);
                      }}
                      disabled={deletingName === b.name}
                      className="flex items-center gap-1 text-xs px-2 py-1 border border-red-200 text-red-600 rounded hover:bg-red-50 disabled:opacity-40"
                    >
                      <Trash2 className="h-3 w-3" />
                      {deletingName === b.name ? "..." : "Apagar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Em produção, os backups automáticos correm todos os dias às 03:00. Os backups são guardados durante 7 dias.
      </p>
    </div>
  );
}
