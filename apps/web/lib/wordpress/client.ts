export function getWpConfig() {
  const url = process.env.WORDPRESS_URL?.replace(/\/$/, "");
  const user = process.env.WORDPRESS_USER;
  const pass = process.env.WORDPRESS_APP_PASSWORD;

  if (!url || !user || !pass) {
    throw new Error(
      "Credenciais WordPress em falta. Preenche WORDPRESS_URL, WORDPRESS_USER e WORDPRESS_APP_PASSWORD no .env"
    );
  }

  const token = Buffer.from(`${user}:${pass}`).toString("base64");

  return {
    baseUrl: `${url}/wp-json/wp/v2`,
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
  };
}

export async function wpFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const { baseUrl, headers } = getWpConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WordPress API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}
