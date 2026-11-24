import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Painel de marca */}
      <div className="hidden lg:flex flex-col justify-between bg-zinc-950 text-white p-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 text-white font-bold text-sm">
            HG
          </span>
          <span className="font-semibold tracking-tight">Redação HG</span>
        </div>
        <div className="space-y-4 max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">
            A redação assistida por agentes do hugogil.pt
          </p>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Recolha de notícias, agrupamento por tema, geração assistida por IA
            e publicação no WordPress. Nada sai sem aprovação humana.
          </p>
        </div>
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.18em]">
          MVP v0.1 · hugogil.pt
        </p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 lg:text-left text-center">
            <div className="lg:hidden flex justify-center mb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-600 text-white font-bold">
                HG
              </span>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo de volta</h1>
            <p className="text-sm text-muted-foreground">
              Entra com as tuas credenciais para aceder à redação
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
