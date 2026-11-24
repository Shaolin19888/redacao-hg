import { SocialAccountsHub } from "@/components/social/accounts-hub";

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contas ligadas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Liga as tuas páginas e perfis para publicar directamente a partir da Redação HG.
        </p>
      </div>
      <SocialAccountsHub />
    </div>
  );
}
