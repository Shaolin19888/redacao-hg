import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UtilizadoresClient } from "@/components/utilizadores/utilizadores-client";

export default async function UtilizadoresPage() {
  const session = await auth();
  if (!session) redirect("/login");

  if (session.user.role !== "admin") {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Utilizadores</h1>
        <p className="text-sm text-muted-foreground">Apenas administradores podem aceder a esta página.</p>
      </div>
    );
  }

  return <UtilizadoresClient currentUserId={session.user.id} />;
}
