"use client";

import { useEffect, useState } from "react";
import { ClipboardList, Play, Download, Upload, Check, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditRun {
  id: string;
  status: string;
  batchSize: number;
  totals: Record<string, number> | null;
  createdAt: string;
}

interface AuditItem {
  id: string;
  wpPostId: number;
  url: string;
  title: string;
  publishedAt: string | null;
  clicks16m: number | null;
  impressions16m: number | null;
  indexedGuess: boolean | null;
  suggestedDecision: "DELETE" | "MERGE" | "IMPROVE" | "KEEP";
  reason: string;
  layer: string;
  humanDecision: "PENDING" | "ACCEPT" | "REJECT" | "OVERRIDE";
}

const DECISION = {
  DELETE: { label: "Apagar", cls: "bg-red-50 text-red-700 border-red-200" },
  MERGE: { label: "Juntar", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  IMPROVE: { label: "Melhorar", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  KEEP: { label: "Manter", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

export function AuditPanel() {
  const [run, setRun] = useState<AuditRun | null>(null);
  const [items, setItems] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(100);
  const [csv, setCsv] = useState<string>("");
  const [csvName, setCsvName] = useState<string>("");

  async function loadLatest() {
    const res = await fetch("/api/pipeline/audit");
    if (res.ok) {
      const data = await res.json();
      if (data.latest) {
        setRun(data.latest);
        await loadItems(data.latest.id);
      }
    }
    setLoading(false);
  }

  async function loadItems(id: string) {
    const res = await fetch(`/api/pipeline/audit/${id}`);
    if (res.ok) {
      const data = await res.json();
      setRun(data.run);
      setItems(data.items ?? []);
    }
  }

  async function runAudit() {
    setRunning(true);
    const res = await fetch("/api/pipeline/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit, gscCsv: csv || undefined }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.auditRunId) await loadItems(data.auditRunId);
    }
    setRunning(false);
  }

  async function decide(itemId: string, humanDecision: AuditItem["humanDecision"]) {
    if (!run) return;
    const res = await fetch(`/api/pipeline/audit/${run.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId, humanDecision }),
    });
    if (res.ok) {
      setItems((prev) => prev.map((it) => (it.id === itemId ? { ...it, humanDecision } : it)));
    }
  }

  function onCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvName(file.name);
    file.text().then(setCsv);
  }

  useEffect(() => { loadLatest(); }, []);

  const t = run?.totals ?? null;

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-neutral-500" />
          <h2 className="text-sm font-semibold text-neutral-800">Auditoria de conteúdo</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50">
            <Upload className="h-3.5 w-3.5" />
            {csvName ? csvName.slice(0, 18) : "CSV do Search Console"}
            <input type="file" accept=".csv" className="hidden" onChange={onCsvFile} />
          </label>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.max(1, Math.min(500, Number(e.target.value) || 100)))}
            className="w-16 rounded-lg border border-neutral-200 px-2 py-1 text-xs"
            title="Tamanho do lote"
          />
          <button
            onClick={runAudit}
            disabled={running}
            className="flex items-center gap-1 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {running ? "A auditar…" : "Correr auditoria"}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-neutral-500">
        Só propõe. Nada é apagado sem a tua ordem. Junta o CSV do relatório &quot;Páginas&quot; do Search Console para ter o tráfego (16 meses).
      </p>

      {loading ? (
        <p className="text-xs text-neutral-400">A carregar…</p>
      ) : !run ? (
        <p className="text-xs text-neutral-400">Ainda não correste nenhuma auditoria. Escolhe o lote e carrega em Correr auditoria.</p>
      ) : (
        <>
          {t && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Badge cls={DECISION.DELETE.cls}>Apagar {t.DELETE ?? 0}</Badge>
              <Badge cls={DECISION.MERGE.cls}>Juntar {t.MERGE ?? 0}</Badge>
              <Badge cls={DECISION.IMPROVE.cls}>Melhorar {t.IMPROVE ?? 0}</Badge>
              <Badge cls={DECISION.KEEP.cls}>Manter {t.KEEP ?? 0}</Badge>
              <span className="text-neutral-500">Peso morto {t.deadPct ?? 0}%</span>
              <span className="text-neutral-400">· IA em {t.aiUsed ?? 0} · {(t.aiCostEur ?? 0).toString().replace(".", ",")}€</span>
              <a
                href={`/api/pipeline/audit/${run.id}/export`}
                className="ml-auto flex items-center gap-1 rounded-lg border border-neutral-200 px-2 py-1 text-neutral-600 hover:bg-neutral-50"
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </a>
            </div>
          )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-neutral-100">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-neutral-50 text-neutral-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Artigo</th>
                  <th className="px-2 py-1.5 font-medium">Cliques</th>
                  <th className="px-2 py-1.5 font-medium">Impr.</th>
                  <th className="px-2 py-1.5 font-medium">Sugestão</th>
                  <th className="px-2 py-1.5 font-medium">Motivo</th>
                  <th className="px-2 py-1.5 font-medium">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const d = DECISION[it.suggestedDecision];
                  return (
                    <tr key={it.id} className="border-t border-neutral-100 align-top">
                      <td className="max-w-[18rem] px-2 py-1.5">
                        <a href={it.url} target="_blank" rel="noreferrer" className="line-clamp-2 text-neutral-800 hover:underline">
                          {it.title}
                        </a>
                        <div className="text-[10px] text-neutral-400">
                          {it.publishedAt ? new Date(it.publishedAt).toLocaleDateString("pt-PT") : "—"}
                          {it.layer === "ai" ? " · IA" : ""}
                        </div>
                      </td>
                      <td className="px-2 py-1.5 text-neutral-600">{it.clicks16m ?? "—"}</td>
                      <td className="px-2 py-1.5 text-neutral-600">{it.impressions16m ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        <span className={cn("rounded border px-1.5 py-0.5 text-[10px] font-medium", d.cls)}>{d.label}</span>
                      </td>
                      <td className="max-w-[16rem] px-2 py-1.5 text-neutral-500">{it.reason}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">
                        <button
                          onClick={() => decide(it.id, "ACCEPT")}
                          className={cn(
                            "mr-1 rounded p-1",
                            it.humanDecision === "ACCEPT" ? "bg-emerald-100 text-emerald-700" : "text-neutral-400 hover:bg-neutral-100",
                          )}
                          title="Aceito a sugestão"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => decide(it.id, "REJECT")}
                          className={cn(
                            "rounded p-1",
                            it.humanDecision === "REJECT" ? "bg-red-100 text-red-700" : "text-neutral-400 hover:bg-neutral-100",
                          )}
                          title="Recuso a sugestão"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[11px] text-neutral-400">
            Ordenado por prioridade de corte. Marca Aceito ou Recuso. A execução (410/301) é um passo à parte, ainda não ligado.
          </p>
        </>
      )}
    </div>
  );
}

function Badge({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={cn("rounded border px-1.5 py-0.5 font-medium", cls)}>{children}</span>;
}
