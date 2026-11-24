import { LogsClient } from "@/components/logs/logs-client";

export default function LogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico de acções do sistema
        </p>
      </div>
      <LogsClient />
    </div>
  );
}
