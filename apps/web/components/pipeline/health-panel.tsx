"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Info, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthCheck {
  name: string;
  status: "ok" | "warning" | "critical" | "info";
  detail: string;
  value?: number | string | null;
}

interface HealthReport {
  id: string;
  status: "ok" | "warning" | "critical";
  checks: HealthCheck[];
  createdAt: string;
}

const STATUS_ICON = {
  ok: { Icon: CheckCircle2, cls: "text-emerald-500" },
  warning: { Icon: AlertTriangle, cls: "text-amber-500" },
  critical: { Icon: XCircle, cls: "text-red-500" },
  info: { Icon: Info, cls: "text-blue-400" },
};

const OVERALL = {
  ok: { label: "Tudo bem", cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  warning: { label: "A rever", cls: "bg-amber-50 border-amber-200 text-amber-800" },
  critical: { label: "Atenção", cls: "bg-red-50 border-red-200 text-red-800" },
};

export function HealthPanel() {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  async function load() {
    const res = await fetch("/api/pipeline/health");
    if (res.ok) {
      const data = await res.json();
      setReport(data.latest ?? null);
    }
    setLoading(false);
  }

  async function runNow() {
    setRunning(true);
    const res = await fetch("/api/pipeline/health", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setReport(data.report);
    }
    setRunning(false);
  }

  useEffect(() => { load(); }, []);

  const overall = report ? OVERALL[report.status] : null;

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium">Saúde do site</p>
          {overall && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", overall.cls)}>
              {overall.label}
            </span>
          )}
        </div>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 transition-colors"
        >
          {running ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Verificar agora
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <RefreshCw className="h-4 w-4 animate-spin" /> A carregar...
        </div>
      ) : !report ? (
        <p className="text-sm text-muted-foreground py-2">
          Ainda sem verificações. Carrega em <strong>Verificar agora</strong>.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {report.checks.map((c) => {
              const { Icon, cls } = STATUS_ICON[c.status];
              return (
                <div key={c.name} className="flex items-start gap-2 rounded-lg border p-2.5">
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", cls)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground/60 mt-3">
            Última verificação: {new Date(report.createdAt).toLocaleString("pt-PT")} · automática a cada 6 horas
          </p>
        </>
      )}
    </div>
  );
}
