"use client";

import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Setting {
  key: string;
  label: string;
  group: string;
  sensitive: boolean;
  placeholder: string;
  hint: string | null;
  verifiable: boolean;
  value: string;
  configured: boolean;
}

interface SaveResult {
  ok: boolean;
  verified: boolean | null;
  message: string;
}

const GROUP_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  telegram: "Telegram",
  social: "Redes sociais",
  ai: "Modelos de IA",
  push: "Notificações push",
  radar: "Recolha de notícias",
};

const GROUP_HINTS: Record<string, string> = {
  telegram: "O bot que te manda as notícias para aprovar.",
  social: "Contas onde os artigos são publicados depois de aprovares.",
  push: "Avisos enviados aos leitores. Nada sai sem a tua ordem.",
};

function SettingField({ setting, onSave }: {
  setting: Setting;
  onSave: (key: string, value: string) => Promise<SaveResult>;
}) {
  const [value, setValue] = useState(setting.value);
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);

  const isDirty = value !== setting.value;
  // Sensível já preenchido: o valor nunca volta do servidor, por isso mostra-se o estado.
  const placeholder = setting.sensitive && setting.configured && !isDirty
    ? "•••••••• (guardado)"
    : setting.placeholder;

  async function handleSave() {
    setSaving(true);
    setResult(null);
    const r = await onSave(setting.key, value);
    setResult(r);
    setSaving(false);
    if (setting.sensitive) setValue("");
  }

  async function handleClear() {
    setValue("");
    setSaving(true);
    const r = await onSave(setting.key, "");
    setResult(r);
    setSaving(false);
  }

  const estado = result === null ? null : result.verified === null ? "guardado" : result.verified ? "ok" : "erro";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-medium">{setting.label}</label>
        {setting.configured && !isDirty && !result && (
          <span className="text-xs text-emerald-600 flex items-center gap-1">
            <CheckCircle className="h-3 w-3" /> configurado
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={setting.sensitive && !show ? "password" : "text"}
            value={value}
            onChange={(e) => { setValue(e.target.value); setResult(null); }}
            placeholder={placeholder}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring pr-9"
          />
          {setting.sensitive && value && (
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={show ? "Esconder" : "Mostrar"}
            >
              {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={cn(
            "h-9 px-3 rounded-md text-sm flex items-center gap-1.5 transition-colors shrink-0",
            isDirty ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border border-input bg-background text-muted-foreground",
            "disabled:opacity-50",
          )}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? (setting.verifiable ? "A verificar…" : "A guardar…") : "Guardar"}
        </button>
      </div>

      {/* Resultado do teste real contra o serviço */}
      {result && (
        <p className={cn(
          "text-xs flex items-start gap-1.5 rounded-md px-2 py-1.5",
          estado === "ok" && "text-emerald-700 bg-emerald-50",
          estado === "erro" && "text-red-700 bg-red-50",
          estado === "guardado" && "text-muted-foreground bg-muted",
        )}>
          {estado === "erro"
            ? <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-px" />
            : <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-px" />}
          <span>{result.message}</span>
        </p>
      )}

      {setting.hint && !result && <p className="text-xs text-muted-foreground">{setting.hint}</p>}

      {setting.configured && !isDirty && !result && (
        <button className="text-xs text-muted-foreground underline hover:text-foreground" onClick={handleClear}>
          Limpar
        </button>
      )}
    </div>
  );
}

export function ConfiguracoesClient() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await fetch("/api/configuracoes");
    if (r.ok) setSettings((await r.json()).settings ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleSave(key: string, value: string): Promise<SaveResult> {
    try {
      const res = await fetch("/api/configuracoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false, verified: false, message: data.error ?? "Não consegui guardar." };
      // Recarrega para actualizar o estado "configurado" dos campos.
      load();
      return { ok: true, verified: data.verified ?? null, message: data.message ?? "Guardado." };
    } catch {
      return { ok: false, verified: false, message: "Erro de ligação ao servidor." };
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">A carregar…</p>;

  const groups = [...new Set(settings.map((s) => s.group))];

  return (
    <div className="space-y-8 max-w-2xl">
      {groups.map((group) => (
        <div key={group} className="space-y-4">
          <div>
            <h2 className="font-semibold text-sm">{GROUP_LABELS[group] ?? group}</h2>
            {GROUP_HINTS[group] && <p className="text-xs text-muted-foreground mt-0.5">{GROUP_HINTS[group]}</p>}
          </div>
          <div className="space-y-5 rounded-xl border bg-card p-4">
            {settings.filter((s) => s.group === group).map((s) => (
              <SettingField key={s.key} setting={s} onSave={handleSave} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
