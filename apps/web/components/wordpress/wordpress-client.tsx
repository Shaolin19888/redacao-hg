"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCw, ExternalLink, FileEdit, Globe, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface WpPost {
  id: number;
  date: string;
  modified: string;
  slug: string;
  status: string;
  title: { rendered: string };
  excerpt: { rendered: string };
  link: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Globe }> = {
  publish: { label: "Publicado", color: "bg-green-50 text-green-700", icon: Globe },
  draft:   { label: "Rascunho", color: "bg-yellow-50 text-yellow-700", icon: FileEdit },
  pending: { label: "Pendente", color: "bg-blue-50 text-blue-700", icon: Clock },
  private: { label: "Privado", color: "bg-gray-50 text-gray-700", icon: Globe },
};

function stripHtml(html: string) {
  return html.replace(/<[^>]*>/g, "").trim();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function PostCard({ post, wpUrl }: { post: WpPost; wpUrl: string }) {
  const cfg = STATUS_CONFIG[post.status] ?? { label: post.status, color: "bg-muted text-muted-foreground", icon: Globe };
  const Icon = cfg.icon;
  const editUrl = `${wpUrl}/wp-admin/post.php?post=${post.id}&action=edit`;
  const excerpt = stripHtml(post.excerpt.rendered);

  return (
    <div className="rounded-lg border bg-card px-5 py-4 space-y-2 hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1", cfg.color)}>
              <Icon className="h-3 w-3" />
              {cfg.label}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {post.status === "publish" ? `Publicado ${formatDate(post.date)}` : `Modificado ${formatDate(post.modified)}`}
            </span>
          </div>
          <h3
            className="font-medium text-sm leading-snug"
            dangerouslySetInnerHTML={{ __html: post.title.rendered }}
          />
          {excerpt && (
            <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{excerpt}</p>
          )}
          <p className="text-xs text-muted-foreground font-mono">/{post.slug}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <a
          href={editUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted transition-colors text-muted-foreground"
        >
          <FileEdit className="h-3.5 w-3.5" />
          Editar no WordPress
        </a>
        {post.status === "publish" && (
          <a
            href={post.link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-input bg-background hover:bg-muted transition-colors text-muted-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver artigo
          </a>
        )}
      </div>
    </div>
  );
}

export function WordpressClient() {
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("any");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const wpUrl = process.env.NEXT_PUBLIC_WORDPRESS_URL ?? "";

  const fetchPosts = useCallback(async (reset = false) => {
    setLoading(true);
    setError(null);
    const currentPage = reset ? 1 : page;
    try {
      const res = await fetch(`/api/wordpress/posts?status=${filterStatus}&page=${currentPage}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erro ao carregar posts");
        return;
      }
      const newPosts: WpPost[] = data.posts ?? [];
      if (reset) {
        setPosts(newPosts);
        setPage(1);
      } else {
        setPosts((prev) => [...prev, ...newPosts]);
      }
      setHasMore(newPosts.length === 20);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro de rede");
    } finally {
      setLoading(false);
    }
  }, [filterStatus, page]);

  useEffect(() => {
    fetchPosts(true);
  }, [filterStatus]);

  function loadMore() {
    const next = page + 1;
    setPage(next);
    fetchPosts(false);
  }

  const counts = {
    publish: posts.filter((p) => p.status === "publish").length,
    draft: posts.filter((p) => p.status === "draft").length,
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {[
            { value: "any", label: "Todos" },
            { value: "draft", label: "Rascunhos" },
            { value: "publish", label: "Publicados" },
            { value: "pending", label: "Pendentes" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterStatus(opt.value)}
              className={cn(
                "h-9 px-4 rounded-md text-sm border transition-colors",
                filterStatus === opt.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => fetchPosts(true)}
          disabled={loading}
          className="h-9 px-3 rounded-md border border-input bg-background text-sm flex items-center gap-2 hover:bg-muted disabled:opacity-50 sm:ml-auto"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-start gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Resumo */}
      {!error && !loading && posts.length > 0 && filterStatus === "any" && (
        <div className="flex gap-4 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{counts.publish}</strong> publicados</span>
          <span><strong className="text-foreground">{counts.draft}</strong> rascunhos</span>
        </div>
      )}

      {/* Lista */}
      {!error && (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} wpUrl={wpUrl} />
          ))}

          {!loading && posts.length === 0 && (
            <div className="rounded-lg border bg-card px-6 py-12 text-center">
              <p className="text-muted-foreground">Nenhum artigo encontrado.</p>
            </div>
          )}

          {loading && (
            <div className="rounded-lg border bg-card px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">A carregar...</p>
            </div>
          )}

          {hasMore && !loading && (
            <button
              onClick={loadMore}
              className="w-full h-9 rounded-md border border-input bg-background text-sm hover:bg-muted transition-colors text-muted-foreground"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
