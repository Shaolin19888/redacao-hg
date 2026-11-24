import { getWpConfig } from "./client";

/**
 * Cliente da API REST do plugin Redirection (gratuito) do WordPress. Cria 301 para os artigos
 * apagados na auditoria, sem tocar no servidor. Requer o plugin instalado e que o utilizador
 * do Application Password tenha permissão de administração (manage_options).
 * Docs: https://redirection.me/developed/rest-api/
 */

function redirectionBase(): string {
  const url = process.env.WORDPRESS_URL?.replace(/\/$/, "");
  if (!url) throw new Error("WORDPRESS_URL em falta");
  return `${url}/wp-json/redirection/v1`;
}

async function redFetch<T>(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const { headers } = getWpConfig();
  try {
    const res = await fetch(`${redirectionBase()}${path}`, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : undefined;
    if (!res.ok) return { ok: false, status: res.status, error: text.slice(0, 200) };
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err instanceof Error ? err.message : "erro" };
  }
}

/** True se o plugin Redirection está instalado e acessível com as credenciais atuais. */
export async function redirectionAvailable(): Promise<{ ok: boolean; reason?: string }> {
  const url = process.env.WORDPRESS_URL?.replace(/\/$/, "");
  const { headers } = getWpConfig();
  const root = await fetch(`${url}/wp-json/`, { headers }).then((r) => r.json()).catch(() => null);
  const ns: string[] = root?.namespaces ?? [];
  if (!ns.includes("redirection/v1")) return { ok: false, reason: "plugin-nao-instalado" };
  const g = await redFetch("/group");
  if (!g.ok) return { ok: false, reason: g.status === 403 ? "sem-permissao-admin" : `erro-${g.status}` };
  return { ok: true };
}

/** Id do grupo por defeito onde criar os redirects (o primeiro grupo do plugin). */
export async function getDefaultGroupId(): Promise<number> {
  const g = await redFetch<{ items: { id: number; name: string }[] }>("/group");
  return g.data?.items?.[0]?.id ?? 1;
}

/** Cria um 301 do caminho de origem para o URL de destino. Idempotência é do lado do chamador. */
export async function createRedirect(
  sourcePath: string,
  targetUrl: string,
  opts: { code?: number; groupId?: number } = {},
): Promise<{ ok: boolean; error?: string }> {
  const groupId = opts.groupId ?? (await getDefaultGroupId());
  const r = await redFetch("/redirect", {
    method: "POST",
    body: JSON.stringify({
      url: sourcePath,
      match_type: "url",
      action_type: "url",
      action_code: opts.code ?? 301,
      action_data: { url: targetUrl },
      group_id: groupId,
      regex: false,
      enabled: true,
    }),
  });
  return { ok: r.ok, error: r.error };
}
