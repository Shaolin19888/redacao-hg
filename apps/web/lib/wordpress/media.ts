import { getWpConfig } from "./client";

/** Deteta o tipo de imagem pelos bytes mágicos (Telegram serve as fotos como octet-stream). */
function sniffImage(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { mime: "image/png", ext: "png" };
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  if (buf.length >= 4 && buf.toString("ascii", 0, 4) === "GIF8") return { mime: "image/gif", ext: "gif" };
  return null;
}

/**
 * Faz upload de uma imagem (a partir de um URL) para a biblioteca de media do WordPress e
 * devolve o ID do anexo, para ser usado como imagem destacada. Define também o alt text.
 * Devolve null se falhar (o rascunho segue sem imagem destacada — nunca bloqueia).
 */
export async function uploadMediaFromUrl(
  imageUrl: string,
  filenameBase: string,
  alt?: string
): Promise<{ id: number; url: string } | null> {
  try {
    const imgRes = await fetch(imageUrl, { headers: { "User-Agent": "RedacaoHG/1.0" } });
    if (!imgRes.ok) return null;

    const buf = Buffer.from(await imgRes.arrayBuffer());
    if (buf.byteLength < 1024) return null; // demasiado pequena (provável placeholder/erro)

    // Tipo da imagem: usa o content-type se for image/*; senão deteta pelos bytes mágicos
    // (o Telegram serve as fotos como application/octet-stream, que era rejeitado antes).
    const headerType = (imgRes.headers.get("content-type") ?? "").split(";")[0].trim();
    let contentType: string;
    let ext: string;
    if (headerType.startsWith("image/")) {
      contentType = headerType;
      ext = headerType.includes("png") ? "png" : headerType.includes("webp") ? "webp" : headerType.includes("gif") ? "gif" : "jpg";
    } else {
      const sniff = sniffImage(buf);
      if (!sniff) return null; // não é uma imagem reconhecível
      contentType = sniff.mime;
      ext = sniff.ext;
    }

    const filename = `${filenameBase}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "imagem";

    const { baseUrl, headers } = getWpConfig();
    const auth = (headers as Record<string, string>).Authorization;

    const res = await fetch(`${baseUrl}/media`, {
      method: "POST",
      headers: {
        Authorization: auth,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}.${ext}"`,
      },
      body: buf,
    });
    if (!res.ok) return null;
    const media = (await res.json()) as { id: number; source_url?: string };

    if (alt) {
      await fetch(`${baseUrl}/media/${media.id}`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/json" },
        body: JSON.stringify({ alt_text: alt.slice(0, 200) }),
      }).catch(() => {});
    }
    return { id: media.id, url: media.source_url ?? imageUrl };
  } catch {
    return null;
  }
}
