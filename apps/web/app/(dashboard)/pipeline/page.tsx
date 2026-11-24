import { PipelineClient } from "@/components/pipeline/pipeline-client";

export default function PipelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600 mb-1.5">Redacção semi-autónoma</p>
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline Editorial</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Estado dos artigos ao longo do fluxo, com auditoria por agente. Nada publica sem aprovação humana.
        </p>
      </div>
      <PipelineClient />
    </div>
  );
}
