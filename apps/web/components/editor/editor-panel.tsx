"use client";

import { useState, useEffect } from "react";
import { Sparkles, Copy, Check, AlertTriangle, ChevronDown, ChevronUp, Globe, ExternalLink, Columns2, ChevronRight, XCircle, Link, FileText, Loader2, Send, ImageIcon, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedContent } from "@/lib/ai/types";
import { ImagePicker, type SelectedImage } from "@/components/images/image-picker";

interface GeneratedText {
  id: string;
  modelo: string;
  conteudo: string;
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

interface EditorPanelProps {
  newsItems: NewsItem[];
}

const FORMATOS = [
  { value: "noticia", label: "Notícia" },
  { value: "opiniao", label: "Opinião" },
  { value: "analise", label: "Análise" },
  { value: "resumo", label: "Resumo rápido" },
];

const TONS = [
  { value: "informativo", label: "Informativo" },
  { value: "forte", label: "Forte" },
  { value: "critico", label: "Crítico" },
  { value: "neutro", label: "Neutro" },
  { value: "desportivo", label: "Desportivo" },
];

const PROVIDERS = [
  {
    value: "openai",
    label: "ChatGPT",
    model: "gpt-4o",
    color: "bg-green-50 text-green-700 border-green-200",
    activeColor: "bg-green-600 text-white border-green-600",
  },
  {
    value: "claude",
    label: "Claude",
    model: "claude-opus-4-8",
    color: "bg-orange-50 text-orange-700 border-orange-200",
    activeColor: "bg-orange-500 text-white border-orange-500",
  },
];

function parseGenerated(raw: string): GeneratedContent | null {
  try { return JSON.parse(raw) as GeneratedContent; } catch { return null; }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} className="text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function Field({ label, value, large, html, onChange }: { label: string; value: string; large?: boolean; html?: boolean; onChange?: (v: string) => void }) {
  const [mode, setMode] = useState<"preview" | "html">("preview");
  if (!value && !onChange) return null;

  const showToggle = large && html && onChange;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
        <div className="flex items-center gap-2">
          {showToggle && (
            <div className="flex rounded-md border border-input overflow-hidden text-xs">
              <button
                onClick={() => setMode("preview")}
                className={cn("px-2.5 py-1 transition-colors", mode === "preview" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                Pré-visualização
              </button>
              <button
                onClick={() => setMode("html")}
                className={cn("px-2.5 py-1 transition-colors border-l border-input", mode === "html" ? "bg-foreground text-background" : "bg-background text-muted-foreground hover:bg-muted")}
              >
                Editor HTML
              </button>
            </div>
          )}
          <CopyButton text={value ?? ""} />
        </div>
      </div>

      {onChange ? (
        large ? (
          mode === "html" || !html ? (
            <textarea
              value={value ?? ""}
              onChange={(e) => onChange(e.target.value)}
              rows={14}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring resize-y font-mono"
            />
          ) : (
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onChange(e.currentTarget.innerHTML)}
              className="rounded-md border border-input bg-background p-3 text-sm leading-relaxed prose prose-sm max-w-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[200px]"
              dangerouslySetInnerHTML={{ __html: value }}
            />
          )
        ) : (
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )
      ) : large ? (
        html
          ? <div className="rounded-md border bg-muted/30 p-3 text-sm leading-relaxed prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: value }} />
          : <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap leading-relaxed">{value}</div>
      ) : (
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{value}</div>
      )}
    </div>
  );
}

function ListField({ label, items, onChange }: { label: string; items: string[]; onChange?: (items: string[]) => void }) {
  const [newItem, setNewItem] = useState("");
  if (!items?.length && !onChange) return null;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <ul className="space-y-1.5">
        {items?.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-sm">
            {onChange ? (
              <>
                <input
                  value={item}
                  onChange={(e) => { const n = [...items]; n[i] = e.target.value; onChange(n); }}
                  className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive transition-colors shrink-0">
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-muted-foreground shrink-0">·</span>
                <span className="flex-1">{item}</span>
                <CopyButton text={item} />
              </>
            )}
          </li>
        ))}
      </ul>
      {onChange && (
        <div className="flex gap-2 mt-1">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { onChange([...(items ?? []), newItem.trim()]); setNewItem(""); } }}
            placeholder="Adicionar..."
            className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={() => { if (newItem.trim()) { onChange([...(items ?? []), newItem.trim()]); setNewItem(""); } }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-muted transition-colors">
            +
          </button>
        </div>
      )}
    </div>
  );
}

function EditableChips({ label, items, onChange, chipClass }: { label: string; items: string[]; onChange: (items: string[]) => void; chipClass: string }) {
  const [newItem, setNewItem] = useState("");
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <div className="flex flex-wrap gap-2 items-center">
        {items?.map((c) => (
          <span key={c} className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium", chipClass)}>
            {c}
            <button onClick={() => onChange(items.filter((i) => i !== c))} className="ml-0.5 opacity-60 hover:opacity-100 leading-none">×</button>
          </span>
        ))}
        <input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { onChange([...(items ?? []), newItem.trim()]); setNewItem(""); } }}
          placeholder="+ adicionar"
          className="rounded-full border border-dashed border-input bg-background px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-28"
        />
      </div>
    </div>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/30 transition-colors">
        {title}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 space-y-4 border-t pt-4">{children}</div>}
    </div>
  );
}

const LS_SELECTED = "redacao_hg_editor_selected";
const LS_RESULT = "redacao_hg_editor_result";


export function EditorPanel({ newsItems: initialItems }: EditorPanelProps) {
  const [items, setItems] = useState(initialItems);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LS_SELECTED) ?? "";
  });
  const [urlExtra, setUrlExtra] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [textoLivre, setTextoLivre] = useState("");
  const [provider, setProvider] = useState<"openai" | "claude">("openai");
  const [formato, setFormato] = useState("noticia");
  const [tom, setTom] = useState("informativo");
  const [instrucoes, setInstrucoes] = useState("");
  const [percentagemIA, setPercentagemIA] = useState(10);
  const [loading, setLoading] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentPreview, setContentPreview] = useState<{ conteudoUsado: string | null; resumoBD: string | null; erroExtracao: string | null; usouExtracaoCompleta: boolean } | null>(null);
  const [contentPreviewLoading, setContentPreviewLoading] = useState(false);
  const [contentPreviewOpen, setContentPreviewOpen] = useState(false);
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [resultProvider, setResultProvider] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<{ openai: GeneratedContent | null; claude: GeneratedContent | null } | null>(null);
  const [wpLoading, setWpLoading] = useState<"draft" | "publish" | null>(null);
  const [wpResult, setWpResult] = useState<{ id: number; link: string; status: string } | null>(null);
  const [wpError, setWpError] = useState<string | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushResults, setPushResults] = useState<Record<string, { ok: boolean; error?: string }> | null>(null);
  const [pushUrl, setPushUrl] = useState("");
  const [pushSending, setPushSending] = useState(false);
  const [pushSent, setPushSent] = useState<Record<string, { ok: boolean; error?: string }> | null>(null);
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [socialHubReady, setSocialHubReady] = useState(false);

  const selected = items.find((n) => n.id === selectedId);
  const hasSource = !!selectedId || (!!urlExtra && !!urlPreview) || textoLivre.trim().length > 20;

  function updateResult<K extends keyof GeneratedContent>(key: K, value: GeneratedContent[K]) {
    setResult((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function refreshItems(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch("/api/editor/items");
      if (res.ok) {
        const fresh = await res.json();
        setItems(fresh);
        // Se o item seleccionado já não está na lista, limpa a selecção
        if (selectedId && !fresh.find((i: { id: string }) => i.id === selectedId)) {
          clearAll();
          setSelectedId("");
        }
      }
    } finally {
      if (!silent) setRefreshing(false);
    }
  }

  // Refresh silencioso quando a janela recebe foco (utilizador voltou do Radar)
  useEffect(() => {
    function onFocus() { refreshItems(true); }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function loadContentPreview() {
    if (!selectedId) return;
    setContentPreviewLoading(true);
    setContentPreviewOpen(true);
    const res = await fetch("/api/editor/preview-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newsItemId: selectedId }),
    });
    const data = await res.json();
    setContentPreviewLoading(false);
    if (res.ok) setContentPreview(data);
  }

  useEffect(() => {
    if (wpResult?.link) { setPushUrl(wpResult.link); }
  }, [wpResult]);

  // Persist selectedId so we auto-restore on browser refresh
  useEffect(() => {
    if (selectedId) {
      localStorage.setItem(LS_SELECTED, selectedId);
    } else {
      localStorage.removeItem(LS_SELECTED);
    }
  }, [selectedId]);

  // For URL/free-text sessions (no selectedId), persist result to localStorage
  useEffect(() => {
    if (!selectedId && result) {
      localStorage.setItem(LS_RESULT, JSON.stringify(result));
    }
  }, [result, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      // Só limpa o resultado se não houver publicação WordPress activa (para não apagar feedback pós-publicação)
      if (!wpResult) {
        // Try to restore a URL/free-text session result from localStorage
        const savedResult = localStorage.getItem(LS_RESULT);
        if (savedResult) {
          try {
            const parsed = JSON.parse(savedResult) as GeneratedContent;
            setResult(parsed);
          } catch { /* ignore */ }
        } else {
          setResult(null); setResultProvider(null);
        }
        setWpResult(null); setWpError(null);
        setPushSent(null); setPushUrl("");
        setPushResults(null);
      }
      return;
    }
    // Clear any stored URL/free-text result when a radar item is selected
    localStorage.removeItem(LS_RESULT);
    const item = items.find((n) => n.id === selectedId);
    if (!item) {
      // Item may have been removed (e.g. published), clear stored selectedId
      localStorage.removeItem(LS_SELECTED);
      setSelectedId("");
      return;
    }
    const gen = item?.generatedTexts?.[0];
    if (gen) {
      const parsed = parseGenerated(gen.conteudo);
      if (parsed) { setResult(parsed); setResultProvider(gen.modelo.includes("claude") ? "claude" : "openai"); setWpResult(null); setWpError(null); }
    } else {
      setResult(null); setResultProvider(null);
    }
  }, [selectedId]);

  function clearAll() {
    localStorage.removeItem(LS_RESULT);
    localStorage.removeItem(LS_SELECTED);
    setContentPreview(null); setContentPreviewOpen(false); setContentPreviewLoading(false);
    setResult(null); setResultProvider(null);
    setWpResult(null); setWpError(null);
    setPushSent(null); setPushUrl(""); setPushResults(null); setPushLoading(false);
    setSocialHubReady(false);
    setCompareResults(null); setError(null);
  }

  function selectItem(id: string) { clearAll(); setSelectedId(id); }

  async function loadUrl() {
    if (!urlExtra.trim()) return;
    setUrlLoading(true); setUrlError(null); setUrlPreview(null);
    const res = await fetch("/api/editor/fetch-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: urlExtra }) });
    const data = await res.json();
    setUrlLoading(false);
    if (res.ok) { setUrlPreview(data.preview); }
    else { setUrlError(data.error ?? "Erro ao carregar URL"); }
  }

  async function generate() {
    if (!hasSource) return;
    setLoading(true); setError(null); setResult(null); setResultProvider(null); setCompareResults(null);
    const res = await fetch("/api/editor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newsItemId: selectedId || undefined,
        urlExtra: urlPreview ? urlExtra : undefined,
        textoLivre: textoLivre.trim() || undefined,
        provider, formato, tom, instrucoes,
        percentagemIA: formato === "opiniao" ? percentagemIA : undefined,
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Erro desconhecido"); return; }
    setResult(data as GeneratedContent); setResultProvider(provider); setWpResult(null); setWpError(null);
  }

  async function compare() {
    if (!hasSource) return;
    setComparing(true); setError(null); setResult(null); setCompareResults(null);
    const body = {
      newsItemId: selectedId || undefined,
      urlExtra: urlPreview ? urlExtra : undefined,
      textoLivre: textoLivre.trim() || undefined,
      formato, tom, instrucoes,
      percentagemIA: formato === "opiniao" ? percentagemIA : undefined,
    };
    const fetchP = (p: "openai" | "claude") =>
      fetch("/api/editor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, provider: p }) })
        .then((r) => r.json().then((d) => (r.ok ? (d as GeneratedContent) : null)));
    const [oi, cl] = await Promise.all([fetchP("openai"), fetchP("claude")]);
    setCompareResults({ openai: oi, claude: cl }); setComparing(false);
  }

  function selectFromCompare(p: "openai" | "claude") {
    const chosen = compareResults?.[p];
    if (!chosen) return;
    setResult(chosen); setResultProvider(p); setCompareResults(null); setWpResult(null); setWpError(null);
  }

  async function rejectItem() {
    if (!selectedId) return;
    setRejecting(true);
    await fetch(`/api/news/${selectedId}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== selectedId));
    setSelectedId(""); setRejecting(false);
  }

  async function sendPushManual() {
    if (!result || !pushUrl.trim()) return;
    setPushSending(true); setPushSent(null);
    const tituloChamativo = result.titulosChamativos?.[0] ?? result.pushTitle;
    const res = await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: tituloChamativo, body: result.pushBody ?? result.tituloPrincipal, url: pushUrl.trim() }),
    });
    const data = await res.json();
    setPushSending(false);
    setPushSent(data.results ?? {});
  }

  async function sendToWordPress(status: "draft" | "publish") {
    if (!result) return;
    setWpLoading(status); setWpError(null); setWpResult(null);
    const tituloChamativo = result.titulosChamativos?.[0] ?? result.pushTitle;
    const res = await fetch("/api/wordpress/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newsItemId: selectedId || undefined,
        title: result.tituloPrincipal, subtitulo: result.tituloSecundario,
        content: result.texto, excerpt: result.excerpto, slug: result.slug,
        categoryNames: result.categoriasSugeridas ?? [], tagNames: result.tagsSugeridas ?? [],
        metaTitle: result.tituloSEO, metaDescription: result.metaDescricao,
        pushTitle: tituloChamativo, pushBody: result.pushBody ?? result.tituloPrincipal,
        onesignalTitle: tituloChamativo, featuredMediaId: selectedImage?.id ?? null, status,
      }),
    });
    const data = await res.json();
    setWpLoading(null);
    if (!res.ok) { setWpError(data.error ?? "Erro ao enviar para WordPress"); return; }
    setWpResult(data);
    if (data.link) { setPushUrl(data.link); }
    // Remove da lista do radar mas mantém o resultado visível para push/social
    if (selectedId) setItems((prev) => prev.filter((i) => i.id !== selectedId));

    if (status === "publish" && data.link) {
      // Push automático
      setPushLoading(true);
      const pushRes = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: tituloChamativo, body: result.pushBody ?? result.tituloPrincipal, url: data.link }) });
      const pushData = await pushRes.json();
      setPushLoading(false); setPushResults(pushData.results);
    }

    // Pré-carrega compositor do Social Hub
    if (data.link) {
      localStorage.setItem("redacao_hg_social_draft", JSON.stringify({
        text: result.copyFacebook ?? "",
        linkUrl: data.link,
        title: result.tituloPrincipal,
      }));
      setSocialHubReady(true);
    }

    // Só limpa o selectedId depois de tudo concluído
    setSelectedId("");
  }


  const activeProvider = PROVIDERS.find((p) => p.value === provider)!;
  const resultProviderInfo = PROVIDERS.find((p) => p.value === resultProvider);

  return (
    <div className="space-y-5">
      {/* ── 1. NOTÍCIAS DO RADAR ── */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">
            Notícias do radar
            {items.length > 0 && <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-normal">{items.length}</span>}
          </label>
          <div className="flex items-center gap-3">
            <button onClick={() => refreshItems()} disabled={refreshing} title="Actualizar lista"
              className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            </button>
            {selectedId && <button onClick={() => selectItem("")} className="text-xs text-muted-foreground hover:text-foreground underline">Limpar</button>}
          </div>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhuma notícia disponível. Recolhe fontes no <a href="/radar" className="underline">Radar</a>.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {items.map((item) => {
              const hasText = item.generatedTexts?.length > 0;
              return (
                <div key={item.id} className={cn("flex items-stretch rounded-md border transition-colors",
                  selectedId === item.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-foreground/30"
                )}>
                  <button onClick={() => selectItem(item.id)} className="flex-1 text-left px-3 py-2.5 min-w-0 group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium shrink-0">{item.source.name}</span>
                          {hasText && <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium shrink-0">Pronto para revisão</span>}
                          {selectedId === item.id && <span className="text-xs text-primary font-medium">seleccionada</span>}
                        </div>
                        <p className="text-sm font-medium leading-snug line-clamp-2">{item.title}</p>
                        {item.summary && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.summary}</p>}
                      </div>
                      <ChevronRight className={cn("h-4 w-4 shrink-0 mt-0.5 transition-colors", selectedId === item.id ? "text-primary" : "text-muted-foreground/40 group-hover:text-muted-foreground")} />
                    </div>
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const res = await fetch(`/api/news/${item.id}`, { method: "DELETE" });
                      if (res.ok) {
                        if (selectedId === item.id) clearAll();
                        setItems((prev) => prev.filter((n) => n.id !== item.id));
                      }
                    }}
                    title="Rejeitar e apagar"
                    className="px-2.5 border-l border-inherit text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors rounded-r-md"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {selected && (
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md bg-muted/30 border px-3 py-2">
              <p className="text-xs text-muted-foreground truncate">{selected.title}</p>
              <a href={selected.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0 ml-2 flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Original
              </a>
            </div>
            <button
              onClick={() => contentPreviewOpen ? setContentPreviewOpen(false) : loadContentPreview()}
              disabled={contentPreviewLoading}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {contentPreviewLoading
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : contentPreviewOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {contentPreviewOpen ? "Esconder conteúdo extraído" : "Ver conteúdo que será enviado à IA"}
            </button>
            {contentPreviewOpen && contentPreview && (
              <div className="rounded-md border bg-muted/20 p-3 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  {contentPreview.usouExtracaoCompleta
                    ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-green-50 text-green-700 font-medium"><Check className="h-3 w-3" />Extracção completa</span>
                    : <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 bg-yellow-50 text-yellow-700 font-medium"><AlertTriangle className="h-3 w-3" />Só resumo RSS</span>}
                  {contentPreview.erroExtracao && <span className="text-destructive">{contentPreview.erroExtracao}</span>}
                </div>
                <div className="rounded border bg-background p-2 max-h-40 overflow-y-auto text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {contentPreview.conteudoUsado ?? "(sem conteúdo)"}
                </div>
                {!contentPreview.usouExtracaoCompleta && (
                  <p className="text-yellow-700">A IA vai receber apenas o resumo acima. Se o artigo original contém mais informação (como o nome do jogador), copia o texto directamente para o campo "Texto livre" abaixo.</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 2. URL EXTRA ── */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <label className="text-sm font-medium flex items-center gap-2">
          <Link className="h-4 w-4 text-muted-foreground" />
          Carregar URL
          <span className="text-xs text-muted-foreground font-normal">(artigo externo para usar como fonte)</span>
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlExtra}
            onChange={(e) => { setUrlExtra(e.target.value); setUrlPreview(null); setUrlError(null); }}
            onKeyDown={(e) => e.key === "Enter" && loadUrl()}
            placeholder="https://..."
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={loadUrl} disabled={!urlExtra.trim() || urlLoading}
            className="flex items-center gap-1.5 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 transition-colors">
            {urlLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link className="h-4 w-4" />}
            {urlLoading ? "A carregar..." : "Carregar"}
          </button>
        </div>
        {urlError && <p className="text-sm text-destructive">{urlError}</p>}
        {urlPreview && (
          <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            <span className="font-medium">URL carregado.</span> {urlPreview}...
          </div>
        )}
      </div>

      {/* ── 3. TEXTO LIVRE ── */}
      <div className="rounded-lg border bg-card p-5 space-y-3">
        <label className="text-sm font-medium flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Texto livre
          <span className="text-xs text-muted-foreground font-normal">(escreve ou cola aqui — serve de base para a IA)</span>
        </label>
        <textarea
          value={textoLivre}
          onChange={(e) => setTextoLivre(e.target.value)}
          rows={5}
          placeholder="Escreve aqui a tua opinião, notas, rascunho ou texto que queres que a IA trabalhe..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring"
        />
        {formato === "opiniao" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Intervenção da IA</span>
              <span className="font-medium tabular-nums">
                {percentagemIA}% IA · {100 - percentagemIA}% teu texto
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percentagemIA}
              onChange={(e) => setPercentagemIA(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Só correcção</span>
              <span>Só IA</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 4. MODELO, FORMATO, TOM ── */}
      <div className="rounded-lg border bg-card p-5 space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium">Modelo de IA</label>
          <div className="flex gap-2 flex-wrap">
            {PROVIDERS.map((p) => (
              <button key={p.value} onClick={() => setProvider(p.value as "openai" | "claude")}
                className={cn("flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors", provider === p.value ? p.activeColor : p.color)}>
                <Sparkles className="h-3.5 w-3.5" />
                {p.label}
                <span className="text-xs opacity-70 font-normal">{p.model}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Formato</label>
            <select value={formato} onChange={(e) => setFormato(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {FORMATOS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Tom</label>
            <select value={tom} onChange={(e) => setTom(e.target.value)} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {TONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Instruções adicionais <span className="text-muted-foreground font-normal">(opcional)</span></label>
          <textarea value={instrucoes} onChange={(e) => setInstrucoes(e.target.value)} rows={2}
            placeholder="Ex: Foca no impacto para o Benfica. Não especules sobre o valor da transferência."
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none" />
        </div>

        <div className="flex gap-3 flex-wrap">
          <button onClick={generate} disabled={!hasSource || loading || comparing}
            className={cn("flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", activeProvider.activeColor)}>
            <Sparkles className={cn("h-4 w-4", loading && "animate-pulse")} />
            {loading ? `A gerar com ${activeProvider.label}...` : `Gerar com ${activeProvider.label}`}
          </button>
          <button onClick={compare} disabled={!hasSource || loading || comparing}
            className="flex items-center gap-2 rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <Columns2 className={cn("h-4 w-4", comparing && "animate-pulse")} />
            {comparing ? "A comparar..." : "Comparar ChatGPT vs Claude"}
          </button>
          {selectedId && (
            <button onClick={rejectItem} disabled={rejecting || loading || comparing}
              className="flex items-center gap-2 rounded-md border border-input bg-background px-5 py-2.5 text-sm font-medium hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors disabled:opacity-50 text-muted-foreground ml-auto">
              <XCircle className="h-4 w-4" />
              {rejecting ? "A rejeitar..." : "Rejeitar notícia"}
            </button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>

      {/* ── COMPARAÇÃO ── */}
      {compareResults && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Columns2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Comparação de modelos</span>
            <span className="text-xs text-muted-foreground">Escolhe o texto que preferes</span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(["openai", "claude"] as const).map((p) => {
              const r = compareResults[p];
              const pInfo = PROVIDERS.find((x) => x.value === p)!;
              return (
                <div key={p} className="rounded-lg border bg-card overflow-hidden flex flex-col">
                  <div className={cn("px-4 py-3 flex items-center justify-between border-b", p === "openai" ? "bg-green-50" : "bg-orange-50")}>
                    <span className={cn("text-sm font-medium flex items-center gap-1.5", p === "openai" ? "text-green-700" : "text-orange-700")}>
                      <Sparkles className="h-3.5 w-3.5" />{pInfo.label}
                    </span>
                    {r ? (
                      <button onClick={() => selectFromCompare(p)} className={cn("text-xs px-3 py-1.5 rounded-md font-medium transition-colors", pInfo.activeColor)}>Usar este texto</button>
                    ) : (
                      <span className="text-xs text-red-600">Erro ao gerar</span>
                    )}
                  </div>
                  {r ? (
                    <div className="p-4 space-y-4 flex-1">
                      <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Título</p><p className="text-sm font-semibold leading-snug">{r.tituloPrincipal}</p></div>
                      <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Texto</p><p className="text-sm leading-relaxed whitespace-pre-line line-clamp-12">{r.texto}</p></div>
                      {r.notaRiscoEditorial && (
                        <div className="flex items-start gap-2 rounded-md bg-yellow-50 border border-yellow-200 px-3 py-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 shrink-0 mt-0.5" />
                          <p className="text-xs text-yellow-800">{r.notaRiscoEditorial}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 text-sm text-red-600">Não foi possível gerar com {pInfo.label}.</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── RESULTADO ── */}
      {result && (
        <div className="space-y-4">
          {resultProviderInfo && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Gerado com</span>
              <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", resultProviderInfo.activeColor)}>
                <Sparkles className="h-3 w-3" />{resultProviderInfo.label} — {result.modelo}
              </span>
            </div>
          )}

          {result.notaRiscoEditorial && (
            <div className="flex items-start gap-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
              <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-yellow-800 mb-1">Nota de risco editorial</p>
                <p className="text-sm text-yellow-800">{result.notaRiscoEditorial}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-card p-5">
            <ImagePicker selected={selectedImage} onSelect={setSelectedImage} />
          </div>

          <Section title="Texto da notícia">
            <Field label="Título principal" value={result.tituloPrincipal} onChange={(v) => updateResult("tituloPrincipal", v)} />
            <Field label="Título secundário" value={result.tituloSecundario} onChange={(v) => updateResult("tituloSecundario", v)} />
            <Field label="Texto completo" value={result.texto} large html onChange={(v) => updateResult("texto", v)} />
            <Field label="Excerto" value={result.excerpto} onChange={(v) => updateResult("excerpto", v)} />
          </Section>

          <Section title="Títulos e SEO">
            <ListField label="Títulos alternativos" items={result.titulosAlternativos ?? []} onChange={(v) => updateResult("titulosAlternativos", v)} />
            <Field label="Título Discover" value={result.tituloDiscover} onChange={(v) => updateResult("tituloDiscover", v)} />
            <Field label="Título SEO" value={result.tituloSEO} onChange={(v) => updateResult("tituloSEO", v)} />
            <Field label="Slug" value={result.slug} onChange={(v) => updateResult("slug", v)} />
            <Field label="Meta descrição" value={result.metaDescricao} onChange={(v) => updateResult("metaDescricao", v)} />
          </Section>

          <Section title="Categorias e Tags">
            <EditableChips
              label="Categorias sugeridas"
              items={result.categoriasSugeridas ?? []}
              onChange={(v) => updateResult("categoriasSugeridas", v)}
              chipClass="bg-muted text-foreground"
            />
            <EditableChips
              label="Tags sugeridas"
              items={result.tagsSugeridas ?? []}
              onChange={(v) => updateResult("tagsSugeridas", v)}
              chipClass="border bg-background text-foreground"
            />
          </Section>

          {/* Push — sempre visível, com envio directo */}
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between">
              <span className="text-sm font-medium">Push Notifications</span>
              {pushSent && Object.values(pushSent).every((r) => r.ok) && (
                <span className="text-xs text-green-700 font-medium flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Enviado</span>
              )}
            </div>
            <div className="px-4 py-4 space-y-4">
              {/* Dados gerados — editáveis */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Título push</label>
                  <input
                    type="text"
                    value={result.titulosChamativos?.[0] ?? result.pushTitle ?? ""}
                    onChange={(e) => {
                      const n = [...(result.titulosChamativos ?? [])];
                      n[0] = e.target.value;
                      updateResult("titulosChamativos", n);
                    }}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Corpo push</label>
                  <input
                    type="text"
                    value={result.pushBody ?? ""}
                    onChange={(e) => updateResult("pushBody", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              </div>

              {(result.titulosChamativos?.length ?? 0) > 1 && (
                <ListField
                  label="Títulos alternativos OneSignal / PushAlert"
                  items={result.titulosChamativos.slice(1)}
                  onChange={(v) => updateResult("titulosChamativos", [result.titulosChamativos[0], ...v])}
                />
              )}

              {/* Envio */}
              <div className="border-t pt-4 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">URL do artigo</label>
                  <input
                    type="url"
                    value={pushUrl}
                    onChange={(e) => setPushUrl(e.target.value)}
                    placeholder="https://hugogil.pt/artigo"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <p className="text-xs text-muted-foreground">Preenchido automaticamente após publicar no WordPress.</p>
                </div>

                {pushSent ? (
                  <div className="space-y-1">
                    {Object.entries(pushSent).map(([prov, r]) => (
                      <div key={prov} className={cn("flex items-center gap-2 text-sm rounded px-3 py-2", r.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
                        {r.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                        <span className="font-medium capitalize">{prov}:</span>
                        <span>{r.ok ? "Push enviado com sucesso" : r.error}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    onClick={sendPushManual}
                    disabled={pushSending || !pushUrl.trim()}
                    className="flex items-center gap-2 rounded-md bg-foreground text-background px-4 py-2 text-sm font-medium hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {pushSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {pushSending ? "A enviar push..." : "Disparar push (OneSignal + PushAlert)"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <Section title="Verificação editorial" defaultOpen={false}>
            <ListField label="Factos confirmados" items={result.factosConfirmados ?? []} onChange={(v) => updateResult("factosConfirmados", v)} />
            <ListField label="Pontos não confirmados" items={result.pontosNaoConfirmados ?? []} onChange={(v) => updateResult("pontosNaoConfirmados", v)} />
            <ListField label="Fontes usadas" items={result.fontesUsadas ?? []} onChange={(v) => updateResult("fontesUsadas", v)} />
          </Section>

          {/* WordPress */}
          <div className="rounded-lg border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Enviar para WordPress</span>
            </div>

            {wpResult ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 rounded-md bg-green-50 border border-green-200 px-3 py-2">
                  <Check className="h-4 w-4 text-green-600 shrink-0" />
                  <div className="flex-1 text-sm text-green-800">{wpResult.status === "publish" ? "Publicado" : "Rascunho criado"} (ID {wpResult.id})</div>
                  <a href={wpResult.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-green-700 hover:underline">
                    Ver no WordPress <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-foreground underline">
                  Limpar e começar nova notícia
                </button>
              </div>
            ) : (
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => sendToWordPress("draft")} disabled={!!wpLoading}
                  className="flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Globe className={cn("h-4 w-4", wpLoading === "draft" && "animate-pulse")} />
                  {wpLoading === "draft" ? "A criar..." : "Guardar rascunho"}
                </button>
                <button onClick={() => sendToWordPress("publish")} disabled={!!wpLoading}
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                  <Globe className={cn("h-4 w-4", wpLoading === "publish" && "animate-pulse")} />
                  {wpLoading === "publish" ? "A publicar..." : "Publicar agora"}
                </button>
              </div>
            )}

            {wpError && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{wpError}</p>
              </div>
            )}

            {(pushLoading || pushResults) && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Push enviado</p>
                {pushLoading ? <p className="text-sm text-muted-foreground">A enviar push...</p> : pushResults ? (
                  <div className="space-y-1">
                    {Object.entries(pushResults).map(([prov, r]) => (
                      <div key={prov} className={cn("flex items-center gap-2 text-sm rounded px-2 py-1", r.ok ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50")}>
                        {r.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                        <span className="font-medium capitalize">{prov}:</span>
                        <span>{r.ok ? "enviado" : r.error}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          {/* ── SOCIAL HUB ── */}
          {socialHubReady && wpResult?.link && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-900">Artigo publicado. Conteúdo social pronto no compositor.</p>
                <p className="text-xs text-emerald-700 mt-0.5">O texto para redes sociais foi pré-carregado no Social Hub.</p>
              </div>
              <a href="/social/compose"
                className="flex items-center gap-1.5 rounded-md bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 transition-colors shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
                Ir para compositor
              </a>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
