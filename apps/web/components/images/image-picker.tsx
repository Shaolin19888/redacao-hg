"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X, Check, ImageIcon, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface WPImage {
  id: number;
  title: { rendered: string };
  alt_text: string;
  source_url: string;
  media_details: {
    sizes?: {
      thumbnail?: { source_url: string };
      medium?: { source_url: string };
    };
  };
}

export interface SelectedImage {
  id: number;
  url: string;
  thumbnailUrl: string;
  title: string;
  altText: string;
}

interface ImagePickerProps {
  selected: SelectedImage | null;
  onSelect: (img: SelectedImage | null) => void;
}

export function ImagePicker({ selected, onSelect }: ImagePickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [images, setImages] = useState<WPImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load(q: string, p: number) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (q) params.set("search", q);
      const res = await fetch(`/api/wordpress/media?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro");
      setImages(data.items);
      setTotalPages(data.totalPages);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro ao carregar imagens");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load(query, page);
  }, [open, query, page]);

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setQuery(val);
      setPage(1);
    }, 400);
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Apenas imagens são permitidas.");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/wordpress/media", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro no upload");
      // Selecciona automaticamente a imagem carregada
      const thumb =
        data.media_details?.sizes?.thumbnail?.source_url ??
        data.media_details?.sizes?.medium?.source_url ??
        data.source_url;
      onSelect({ id: data.id, url: data.source_url, thumbnailUrl: thumb, title: data.title, altText: data.alt_text });
      setOpen(false);
      // Actualiza a lista
      await load(query, 1);
      setPage(1);
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function pickImage(img: WPImage) {
    const thumb =
      img.media_details?.sizes?.thumbnail?.source_url ??
      img.media_details?.sizes?.medium?.source_url ??
      img.source_url;
    onSelect({
      id: img.id,
      url: img.source_url,
      thumbnailUrl: thumb,
      title: img.title?.rendered ?? "",
      altText: img.alt_text ?? "",
    });
    setOpen(false);
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">Imagem destacada</label>

      {selected ? (
        <div className="flex items-center gap-3 rounded-md border p-2 bg-card">
          <img
            src={selected.thumbnailUrl}
            alt={selected.altText}
            className="h-14 w-20 object-cover rounded"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate"
              dangerouslySetInnerHTML={{ __html: selected.title }}
            />
            {selected.altText && (
              <p className="text-xs text-muted-foreground truncate">{selected.altText}</p>
            )}
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setOpen(true)}
              className="text-xs px-2 py-1 border rounded hover:bg-muted"
            >
              Trocar
            </button>
            <button
              onClick={() => onSelect(null)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors"
        >
          <ImageIcon className="h-4 w-4" />
          Escolher imagem do WordPress
        </button>
      )}

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col mx-4">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h2 className="font-medium text-sm">Escolher imagem</h2>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Search */}
            <div className="px-4 py-3 border-b">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Pesquisar por nome..."
                  className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>
            </div>

            {/* Upload */}
            <div className="px-4 py-3 border-b">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
              />
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-sm text-muted-foreground hover:border-foreground/40 hover:text-foreground cursor-pointer transition-colors"
              >
                <Upload className="h-4 w-4 shrink-0" />
                {uploading ? "A carregar..." : "Carregar nova imagem — clica ou arrasta"}
              </div>
              {uploadError && (
                <p className="text-xs text-red-600 mt-1">{uploadError}</p>
              )}
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">
                  {error}
                </p>
              )}
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">A carregar...</p>
                </div>
              ) : images.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">Nenhuma imagem encontrada</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                  {images.map((img) => {
                    const thumb =
                      img.media_details?.sizes?.thumbnail?.source_url ??
                      img.media_details?.sizes?.medium?.source_url ??
                      img.source_url;
                    const isSelected = selected?.id === img.id;
                    return (
                      <button
                        key={img.id}
                        onClick={() => pickImage(img)}
                        onMouseEnter={() => setHoverId(img.id)}
                        onMouseLeave={() => setHoverId(null)}
                        className={cn(
                          "relative rounded overflow-hidden aspect-square border-2 transition-all",
                          isSelected
                            ? "border-primary"
                            : hoverId === img.id
                            ? "border-foreground/40"
                            : "border-transparent"
                        )}
                      >
                        <img
                          src={thumb}
                          alt={img.alt_text}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <Check className="h-5 w-5 text-primary" />
                          </div>
                        )}
                        {hoverId === img.id && !isSelected && (
                          <div className="absolute inset-0 bg-black/30" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <span className="text-muted-foreground text-xs">
                  Página {page} de {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded hover:bg-muted disabled:opacity-40"
                >
                  Seguinte
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
