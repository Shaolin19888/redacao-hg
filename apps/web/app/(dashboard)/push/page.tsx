import { PushClient } from "@/components/push/push-client";

export default function PushPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Push Notifications</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Envio manual e histórico de notificações push
        </p>
      </div>
      <PushClient />
    </div>
  );
}
