"use client";

import { useEffect, useState } from "react";
import { RefreshCw, GitBranch, AlertCircle, CheckCircle2, Clock, Copy, Play, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunInspector } from "./run-inspector";
import { HealthPanel } from "./health-panel";
import { AuditPanel } from "./audit-panel";

interface Decision {
  id: string;
  agent: string;
  toState: string | null;
  ok: boolean;
  createdAt: string;
}

interface Candidate {
  title: string;
  url: string;
  duplicateOfId: string | null;
}

interface Run {
  id: string;
  state: string;
  currentAgent: string | null;
  candidate: Candidate | null;
  error: string | null;
  updatedAt: string;
  decisions: Decision[];
  _count: { decisions: number };
}

// Grupos de estados para colorir o pipeline
const STATE_STYLE: Record<string, { label: string; cls: string }> = {
  COLLECTED: { label: "Recolhido", cls: "bg-zinc-100 text-zinc-700" },
  DEDUP_OK: { label: "Sem duplicados", cls: "bg-zinc-100 text-zinc-700" },
  RELEVANT: { label: "Relevante", cls: "bg-blue-50 text-blue-700" },
  FACTS_EXTRACTED: { label: "Factos extraídos", cls: "bg-blue-50 text-blue-700" },
  FACTS_QA_OK: { label: "Factos validados", cls: "bg-blue-50 text-blue-700" },
  WRITTEN: { label: "Escrito", cls: "bg-indigo-50 text-indigo-700" },
  EDITORIAL_QA_OK: { label: "QA editorial OK", cls: "bg-indigo-50 text-indigo-700" },
  SEO_QA_OK: { label: "SEO OK", cls: "bg-indigo-50 text-indigo-700" },
  IMAGE_READY: { label: "Imagem pronta", cls: "bg-violet-50 text-violet-700" },
  IMAGE_QA_OK: { label: "Imagem OK", cls: "bg-violet-50 text-violet-700" },
  WP_DRAFTED: { label: "Rascunho WP", cls: "bg-amber-50 text-amber-700" },
  AWAITING_APPROVAL: { label: "A aguardar aprovação", cls: "bg-orange-100 text-orange-800" },
  APPROVED_ALL: { label: "Aprovado", cls: "bg-emerald-50 text-emerald-700" },
  PUBLISHED: { label: "Publicado", cls: "bg-emerald-100 text-emerald-800" },
  DISTRIBUTED: { label: "Distribuído", cls: "bg-emerald-100 text-emerald-800" },
  DONE: { label: "Concluído", cls: "bg-emerald-600 text-white" },
  TEXT_REJECTED: { label: "Texto rejeitado", cls: "bg-red-50 text-red-700" },
  IMAGE_REJECTED: { label: "Imagem rejeitada", cls: "bg-red-50 text-red-700" },
  PAUSED: { label: "Em pausa", cls: "bg-zinc-100 text-zinc-600" },
  ARCHIVED: { label: "Arquivado", cls: "bg-zinc-100 text-zinc-500" },
  FAILED: { label: "Falhou", cls: "bg-red-100 text-red-800" },
};

function stateStyle(state: string) {
  return STATE_STYLE[state] ?? { label: state, cls: "bg-zinc-100 text-zinc-700" };
}

export function PipelineClient() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [candidateTotal, setCandidateTotal] = useState(0);
  const [duplicateTotal, setDuplicateTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectMsg, setCollectMsg] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [sources, setSources] = useState<{ id: string; name: string; collectType: string }[]>([]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/pipeline");
    if (res.ok) {
      const data = await res.json();
      setRuns(data.runs ?? []);
      setCounts(data.counts ?? {});
      setCandidateTotal(data.candidateTotal ?? 0);
      setDuplicateTotal(data.duplicateTotal ?? 0);
    }
    setLoading(false);
  }

  async function loadSources() {
    const res = await fetch("/api/pipeline/collect");
    if (res.ok) setSources((await res.json()).sources ?? []);
  }

  async function collectFrom(sourceId: string | null) {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch("/api/pipeline/collect", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceId ? { sourceId } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        const r = data.result;
        setCollectMsg(`Recolha: ${r.created} candidatos novos, ${r.skippedExisting} já existentes, ${r.runsStarted} runs. O pipeline processa em segundo plano.`);
        setTimeout(load, 2000); setTimeout(load, 6000);
      } else {
        setCollectMsg(data.error ?? "Erro na recolha.");
      }
    } catch {
      setCollectMsg("Erro de ligação.");
    }
    setCollecting(false);
  }

  async function simulateCollection() {
    setCollecting(true);
    setCollectMsg(null);
    try {
      const res = await fetch("/api/pipeline/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json();
      if (res.ok) {
        const r = data.result;
        setCollectMsg(`Recolha simulada: ${r.created} candidatos novos, ${r.runsStarted} runs iniciados. O dedup processa em segundo plano.`);
        // Recarrega após dar tempo ao worker de processar o dedup.
        setTimeout(load, 1500);
        setTimeout(load, 4000);
      } else {
        setCollectMsg(data.error ?? "Erro na recolha.");
      }
    } catch {
      setCollectMsg("Erro de ligação.");
    }
    setCollecting(false);
  }

  useEffect(() => {
    load();
    loadSources();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  const total = runs.length;
  const awaiting = counts["AWAITING_APPROVAL"] ?? 0;
  const failed = counts["FAILED"] ?? 0;
  const done = counts["DONE"] ?? 0;

  return (
    <div className="space-y-6">
      {/* Saúde do site */}
      <HealthPanel />

      {/* Auditoria de conteúdo */}
      <AuditPanel />

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Runs activos", value: total, icon: GitBranch, accent: "bg-zinc-900" },
          { label: "A aguardar aprovação", value: awaiting, icon: Clock, accent: "bg-orange-500" },
          { label: "Concluídos", value: done, icon: CheckCircle2, accent: "bg-emerald-500" },
          { label: "Falhados", value: failed, icon: AlertCircle, accent: "bg-red-500" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="relative overflow-hidden border rounded-xl p-4 bg-card">
              <span className={cn("absolute inset-x-0 top-0 h-[3px]", s.accent)} />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-3xl font-semibold mt-1.5 tabular-nums">{s.value}</p>
            </div>
          );
        })}
      </div>

      {/* Recolha simulada + candidatos */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{candidateTotal}</span>
              <span className="text-muted-foreground">candidatos</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Copy className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{duplicateTotal}</span>
              <span className="text-muted-foreground">duplicados detectados</span>
            </div>
          </div>
          <button
            onClick={simulateCollection}
            disabled={collecting}
            className="flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          >
            {collecting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Simular
          </button>
        </div>

        {/* Recolher de fontes reais */}
        {sources.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t">
            <span className="text-xs text-muted-foreground pt-2">Recolher de:</span>
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => collectFrom(s.id)}
                disabled={collecting}
                className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {collecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                {s.name}
              </button>
            ))}
          </div>
        )}
        {collectMsg && (
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">{collectMsg}</p>
        )}
      </div>

      {/* Grupos de agregação abertos (a juntar fontes do mesmo tema) */}

      {/* Lista de runs */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Runs recentes</p>
        <button onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Actualizar
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card px-6 py-14 text-center">
          <GitBranch className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Ainda não há runs no pipeline.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            A Fase 1 (Source Manager + recolha) cria os primeiros candidatos.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => {
            const st = stateStyle(run.state);
            return (
              <button
                key={run.id}
                onClick={() => setInspectId(run.id)}
                className="w-full text-left flex items-center gap-4 rounded-xl border bg-card p-4 hover:border-foreground/20 hover:shadow-sm transition-all"
              >
                <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full shrink-0", st.cls)}>
                  {st.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {run.candidate?.title ?? <span className="font-mono text-muted-foreground">{run.id}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {run._count.decisions} decisões · actualizado {new Date(run.updatedAt).toLocaleString("pt-PT")}
                    {run.currentAgent && ` · ${run.currentAgent}`}
                    {run.candidate?.duplicateOfId && " · duplicado"}
                  </p>
                  {run.error && (
                    <p className="text-xs text-red-600 mt-1 truncate">{run.error}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {inspectId && <RunInspector runId={inspectId} onClose={() => setInspectId(null)} onChanged={load} />}
    </div>
  );
}
