import { SocialHub } from "@/components/social/hub";

export default function ComposePage() {
  return (
    <div className="space-y-6 h-full">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Social Hub</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Fila de publicações, rascunhos e histórico de todos os canais.
        </p>
      </div>
      <SocialHub initialCompose />
    </div>
  );
}
