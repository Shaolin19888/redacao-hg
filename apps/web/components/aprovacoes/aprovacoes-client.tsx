"use client";

import { useState, useEffect } from "react";
import { CheckCircle, XCircle, FileEdit, RefreshCw, ExternalLink, ChevronDown, ChevronUp, X, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneratedText {
  id: string;
  modelo: string;
  formato: string;
  tom: string;
  conteudo: string;
  createdAt: string;
}

interface NewsItem {
  id: string;
  title: string;
  url: string;
  status: string;
  summary: string | null;
  source: { name: string };
  generatedTexts: GeneratedText[];
}

interface ParsedContent {
  tituloPrincipal?: string;
  tituloSecundario?: string;
  tituloSEO?: string;
  slug?: string;
  texto?: string;
  metaDescricao?: string;
  categoriasSugeridas?: string[];
  tagsSugeridas?: string[];
  notaRiscoEditorial?: string;
  copyFacebook?: string;
  copyWhatsApp?: string;
  pushTitle?: string;
  pushBody?: string;
}

function parseContent(raw: string): ParsedContent {
  try {
    return JSON.parse(raw) as ParsedContent;
  } catch {
    return {};
  }
}

function RiskBadge({ nota }: { nota?: string }) {
  if (!nota) return null;
  const lower = nota.toLowerCase();
  const isHigh = lower.includes("elevado") || lower.includes("alto") || lower.includes("cuidado");
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full font-medium",
      isHigh ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
    )}>
      {isHigh ? "Risco editorial" : "Sem risco assinalado"}
    </span>
  );
}

function ModelBadge({ modelo }: { modelo: string }) {
  const isGPT = modelo.toLowerCase().includes("gpt");
  return (
    <span className={cn(
      "text-xs px-2 py-0.5 rounded-full font-medium",
      isGPT ? "bg-green-50 text-green-700" : "bg-orange-50 text-orange-700"
    )}>
      {isGPT ? "ChatGPT" : "Claude"}
    </span>
  );
}

function ItemCard({ item, onAction }: {
  item: NewsItem;
  onAction: (id: string, action: "ignorar" | "guardar") => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState<"ignorar" | "guardar" | "wordpress" | null>(null);
  const [wpResult, setWpResult] = useState<{ link: string } | null>(null);
  const [wpError, setWpError] = useState<string | null>(null);

  const gen = item.generatedTexts[0];
  const content = gen ? parseContent(gen.conteudo) : null;

  // Estado editável
  const [editTitulo, setEditTitulo] = useState(content?.tituloPrincipal ?? "");
  const [editSubtitulo, setEditSubtitulo] = useState(content?.tituloSecundario ?? "");
  const [editTexto, setEditTexto] = useState(content?.texto ?? "");
  const [editMeta, setEditMeta] = useState(content?.metaDescricao ?? "");
  const [editFacebook, setEditFacebook] = useState(content?.copyFacebook ?? "");
  const [editPush, setEditPush] = useState(content?.pushTitle ?? "");

  async function handleAction(action: "ignorar" | "guardar") {
    setLoading(action);
    await onAction(item.id, action);
    setLoading(null);
  }

  async function sendToWordPress() {
    if (!content) return;
    setLoading("wordpress");
    setWpError(null);
    const titulo = editing ? editTitulo : (content.tituloPrincipal ?? item.title);
    const texto = editing ? editTexto : content.texto;
    const meta = editing ? editMeta : content.metaDescricao;
    const slug = content.slug ?? titulo.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const res = await fetch("/api/wordpress/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newsItemId: item.id,
        title: titulo,
        content: texto ?? "",
        excerpt: meta ?? "",
        slug,
        categoryNames: content.categoriasSugeridas ?? [],
        tagNames: content.tagsSugeridas ?? [],
        metaTitle: content.tituloSEO ?? titulo,
        metaDescription: meta ?? "",
        pushTitle: content.pushTitle ?? "",
        pushBody: content.pushBody ?? "",
        status: "draft",
      }),
    });
    const data = await res.json();
    setLoading(null);
    if (res.ok) {
      setWpResult({ link: data.link });
      onAction(item.id, "guardar");
    } else {
      setWpError(data.error ?? "Erro ao criar rascunho");
    }
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Cabeçalho */}
      <div className="px-5 py-4 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <p className="text-xs text-muted-foreground">{item.source.name}</p>
            <h3 className="font-medium text-sm leading-snug">{item.title}</h3>
            {content?.tituloPrincipal && content.tituloPrincipal !== item.title && (
              <p className="text-sm font-semibold text-foreground leading-snug">
                → {editing ? editTitulo : content.tituloPrincipal}
              </p>
            )}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {gen && <ModelBadge modelo={gen.modelo} />}
          {content?.notaRiscoEditorial && <RiskBadge nota={content.notaRiscoEditorial} />}
          {content?.categoriasSugeridas?.slice(0, 2).map((c) => (
            <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {c}
            </span>
          ))}
        </div>

        {content?.notaRiscoEditorial && (
          <p className="text-xs text-muted-foreground italic border-l-2 border-yellow-300 pl-2">
            {content.notaRiscoEditorial}
          </p>
        )}
      </div>

      {/* Modo edição inline */}
      {editing ? (
        <div className="px-5 py-4 border-t bg-muted/10 space-y-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">A editar</p>
            <button
              onClick={() => setEditing(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Título principal</label>
            <input
              type="text"
              value={editTitulo}
              onChange={(e) => setEditTitulo(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Subtítulo</label>
            <input
              type="text"
              value={editSubtitulo}
              onChange={(e) => setEditSubtitulo(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Texto</label>
            <textarea
              value={editTexto}
              onChange={(e) => setEditTexto(e.target.value)}
              rows={10}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Meta descrição</label>
            <textarea
              value={editMeta}
              onChange={(e) => setEditMeta(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Copy Facebook</label>
            <textarea
              value={editFacebook}
              onChange={(e) => setEditFacebook(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Título Push</label>
            <input
              type="text"
              value={editPush}
              onChange={(e) => setEditPush(e.target.value)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      ) : (
        /* Texto expandível (modo leitura) */
        content?.texto && (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-2 text-xs text-muted-foreground hover:bg-muted/30 border-t transition-colors"
            >
              <span>Ver texto gerado</span>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {expanded && (
              <div className="px-5 py-4 border-t bg-muted/10 space-y-4">
                {content.tituloSecundario && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Subtítulo</p>
                    <p className="text-sm">{content.tituloSecundario}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Texto</p>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{content.texto}</p>
                </div>
                {content.metaDescricao && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Meta descrição</p>
                    <p className="text-sm text-muted-foreground">{content.metaDescricao}</p>
                  </div>
                )}
                {content.copyFacebook && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Facebook</p>
                    <p className="text-sm text-muted-foreground">{content.copyFacebook}</p>
                  </div>
                )}
                {content.pushTitle && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Push</p>
                    <p className="text-sm text-muted-foreground">{content.pushTitle}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}

      {/* Resultado WordPress */}
      {wpResult && (
        <div className="px-5 py-2 border-t bg-green-50 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">
            Rascunho criado no WordPress.{" "}
            <a href={wpResult.link} target="_blank" rel="noopener noreferrer" className="underline font-medium">
              Ver rascunho →
            </a>
          </p>
        </div>
      )}
      {wpError && (
        <div className="px-5 py-2 border-t bg-red-50">
          <p className="text-sm text-red-700">{wpError}</p>
        </div>
      )}

      {/* Acções */}
      <div className="flex items-center gap-3 px-5 py-3 border-t bg-muted/5 flex-wrap">
        <button
          onClick={sendToWordPress}
          disabled={loading !== null || !content?.texto}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
          {loading === "wordpress" ? "A enviar..." : "Enviar para WordPress"}
        </button>
        <button
          onClick={() => handleAction("guardar")}
          disabled={loading !== null}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 transition-colors text-muted-foreground"
        >
          <CheckCircle className="h-4 w-4" />
          {loading === "guardar" ? "A aprovar..." : "Guardar no editor"}
        </button>
        <button
          onClick={() => setEditing((v) => !v)}
          disabled={loading !== null}
          className={cn(
            "flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input disabled:opacity-50 transition-colors",
            editing
              ? "bg-muted text-foreground"
              : "bg-background hover:bg-muted text-muted-foreground"
          )}
        >
          <FileEdit className="h-4 w-4" />
          {editing ? "Fechar edição" : "Editar"}
        </button>
        <button
          onClick={() => handleAction("ignorar")}
          disabled={loading !== null}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted disabled:opacity-50 transition-colors text-muted-foreground"
        >
          <XCircle className="h-4 w-4" />
          {loading === "ignorar" ? "A rejeitar..." : "Rejeitar"}
        </button>
      </div>
    </div>
  );
}

export function AprovacoesClient() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastAprovado, setLastAprovado] = useState<string | null>(null);

  async function fetchItems() {
    setLoading(true);
    try {
      const res = await fetch("/api/aprovacoes");
      const data = await res.json();
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchItems(); }, []);

  async function handleAction(id: string, action: "ignorar" | "guardar") {
    await fetch("/api/aprovacoes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newsItemId: id, action }),
    });
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (action === "guardar") {
      setLastAprovado(id);
    }
  }

  return (
    <div className="space-y-4">
      {lastAprovado && (
        <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <p className="text-sm text-green-700 font-medium">Item aprovado e enviado para o editor.</p>
          <a
            href="/editor"
            className="text-sm text-green-700 underline hover:text-green-900 font-medium"
          >
            Ir para o editor →
          </a>
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {loading ? "A carregar..." : `${items.length} ${items.length === 1 ? "item" : "itens"} a aguardar decisão`}
        </p>
        <button
          onClick={fetchItems}
          disabled={loading}
          className="h-8 px-3 rounded-md border border-input bg-background text-sm flex items-center gap-2 hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {!loading && items.length === 0 && (
        <div className="rounded-lg border bg-card px-6 py-12 text-center">
          <p className="text-muted-foreground">Nenhum texto a aguardar aprovação.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Gera textos no editor para os ver aqui.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} onAction={handleAction} />
        ))}
      </div>
    </div>
  );
}
