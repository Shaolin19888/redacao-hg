import { ConfiguracoesClient } from "@/components/configuracoes/configuracoes-client";

export default function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ligações aos serviços e modelos de IA. Cada código é testado quando o guardas.
        </p>
      </div>
      <ConfiguracoesClient />
    </div>
  );
}
