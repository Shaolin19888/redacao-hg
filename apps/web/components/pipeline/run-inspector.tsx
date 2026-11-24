"use client";

import { useEffect, useState } from "react";
import { X, RefreshCw, FileText, ListChecks, ScrollText, CheckCircle2, AlertTriangle, HelpCircle, ShieldCheck, Globe, Search, Send, Trash2, Save, PenLine, Share2, ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface Fact {
  id: string;
  text: string;
  type: string;
  status: "CONFIRMED" | "DOUBTFUL" | "UNCONFIRMED";
  confidence: number;
  sourceUrl: string | null;
  evidenceQuote: string | null;
  sensitive: boolean;
}

interface Decision {
  id: string;
  agent: string;
  fromState: string | null;
  toState: string | null;
  ok: boolean;
  model: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}

interface QaIssue { type: string; severity: string; detail: string }
interface QaReport { id: string; stage: string; passed: boolean; score: number | null; issues: QaIssue[] | null }
interface WpDraftInfo { simulated: boolean; status: string; wpPostId: number | null; link: string | null; error: string | null; publishedAt: string | null; publishedBy: string | null }
interface ImageInfo { source: string; url: string; alt: string; width: number | null; height: number | null; format: string | null; license: string | null; attribution: string | null; qaStatus: string }
interface ApprovalInfo { channel: string; decision: string | null; decidedBy: string | null; decidedAt: string | null }
interface SocialTarget { account: { platform: string; accountName: string } }
interface SocialPostInfo { id: string; text: string; linkUrl: string | null; status: string; targets: SocialTarget[] }

interface RunDetail {
  id: string;
  state: string;
  candidate: { title: string; url: string; source: { name: string } } | null;
  ledger: { locked: boolean; facts: Fact[] } | null;
  article: {
    title: string; lead: string | null; body: string; wordCount: number; model: string | null;
    slug: string | null; seoTitle: string | null; metaDescription: string | null;
    discoverTitle: string | null; tags: string[]; category: string | null;
  } | null;
  qaReports: QaReport[];
  wpDraft: WpDraftInfo | null;
  image: ImageInfo | null;
  approval: ApprovalInfo | null;
  socialPosts: SocialPostInfo[];
  decisions: Decision[];
}

const APPROVAL_BUTTONS: { decision: string; label: string; icon: typeof Send; cls: string }[] = [
  { decision: "APPROVE_ALL", label: "Aprovar e publicar", icon: Send, cls: "bg-emerald-600 text-white hover:bg-emerald-700" },
  { decision: "REJECT_TEXT_APPROVE_IMAGE", label: "Rejeitar texto (reescrever)", icon: PenLine, cls: "border text-amber-700 hover:bg-amber-50" },
  { decision: "SAVE_DRAFT", label: "Guardar rascunho", icon: Save, cls: "border text-muted-foreground hover:bg-muted" },
  { decision: "REJECT_ALL", label: "Rejeitar tudo", icon: Trash2, cls: "border border-red-200 text-red-600 hover:bg-red-50" },
];

const SEVERITY_CLS: Record<string, string> = {
  critical: "text-red-700 bg-red-50 border-red-200",
  warning: "text-amber-700 bg-amber-50 border-amber-200",
  info: "text-blue-700 bg-blue-50 border-blue-200",
};

const FACT_STATUS: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  CONFIRMED: { label: "Confirmado", cls: "text-emerald-700 bg-emerald-50 border-emerald-200", icon: CheckCircle2 },
  DOUBTFUL: { label: "Duvidoso", cls: "text-amber-700 bg-amber-50 border-amber-200", icon: HelpCircle },
  UNCONFIRMED: { label: "Não confirmado", cls: "text-red-700 bg-red-50 border-red-200", icon: AlertTriangle },
};

export function RunInspector({ runId, onClose, onChanged }: { runId: string; onClose: () => void; onChanged?: () => void }) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);

  function load() {
    return fetch(`/api/pipeline/${runId}`)
      .then((r) => r.json())
      .then((d) => setRun(d.run ?? null));
  }

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/pipeline/${runId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) setRun(d.run ?? null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [runId]);

  async function decide(decision: string) {
    setDeciding(decision);
    setDecideError(null);
    try {
      const res = await fetch(`/api/pipeline/${runId}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) setDecideError(data.error ?? "Erro ao decidir.");
      else { await load(); onChanged?.(); }
    } catch {
      setDecideError("Erro de ligação.");
    }
    setDeciding(null);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-3xl rounded-2xl bg-background shadow-2xl mt-8 mb-8">
        <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-background rounded-t-2xl">
          <h2 className="text-sm font-semibold">Inspector do run</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground p-10 justify-center">
            <RefreshCw className="h-4 w-4 animate-spin" /> A carregar...
          </div>
        ) : !run ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Run não encontrado.</p>
        ) : (
          <div className="p-6 space-y-6">
            {/* Gate de pré-escrita (fora do Benfica) */}
            {run.state === "AWAITING_TOPIC_APPROVAL" && (
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <PenLine className="h-4 w-4 text-amber-600" />
                  <p className="text-sm font-semibold text-amber-900">Escrever este artigo?</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Notícia fora do Benfica. Só se escreve (e gasta créditos) com a tua aprovação.
                </p>
                {decideError && <p className="text-xs text-red-600 mb-2">{decideError}</p>}
                <div className="flex gap-2">
                  <button onClick={() => decide("WRITE_TOPIC")} disabled={deciding !== null}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 text-white px-3 py-2 text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                    {deciding === "WRITE_TOPIC" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                    Escrever
                  </button>
                  <button onClick={() => decide("SKIP_TOPIC")} disabled={deciding !== null}
                    className="flex items-center gap-2 rounded-lg border border-red-200 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors">
                    {deciding === "SKIP_TOPIC" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Ignorar
                  </button>
                </div>
              </div>
            )}

            {/* Gate de aprovação humana */}
            {run.state === "AWAITING_APPROVAL" && (
              <div className="rounded-xl border-2 border-red-200 bg-red-50/50 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="h-4 w-4 text-red-600" />
                  <p className="text-sm font-semibold text-red-900">A aguardar a tua decisão</p>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  Nada é publicado sem aprovação humana. {run.approval?.channel === "telegram" ? "Também podes decidir pelo Telegram." : "Telegram não configurado — decide aqui."}
                </p>
                {decideError && <p className="text-xs text-red-600 mb-2">{decideError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {APPROVAL_BUTTONS.map((b) => {
                    const Icon = b.icon;
                    return (
                      <button
                        key={b.decision}
                        onClick={() => decide(b.decision)}
                        disabled={deciding !== null}
                        className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50", b.cls)}
                      >
                        {deciding === b.decision ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Decisão já tomada */}
            {run.approval?.decidedAt && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Decisão: <strong>{run.approval.decision}</strong> por {run.approval.decidedBy} ({run.approval.channel})</span>
              </div>
            )}

            {/* Candidato */}
            {run.candidate && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1.5">Candidato</p>
                <p className="text-sm font-medium">{run.candidate.title}</p>
                <a href={run.candidate.url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline break-all">
                  {run.candidate.source.name} · {run.candidate.url}
                </a>
              </div>
            )}

            {/* Fact Ledger */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Fact Ledger {run.ledger?.locked && <span className="ml-1 text-emerald-600">· trancado</span>}
                </p>
              </div>
              {run.ledger && run.ledger.facts.length > 0 ? (
                <div className="space-y-1.5">
                  {run.ledger.facts.map((f) => {
                    const st = FACT_STATUS[f.status];
                    const Icon = st.icon;
                    return (
                      <div key={f.id} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-start gap-2">
                          <span className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0", st.cls)}>
                            <Icon className="h-2.5 w-2.5" /> {st.label}
                          </span>
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{f.type}</span>
                          {f.sensitive && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 shrink-0">sensível</span>}
                        </div>
                        <p className="mt-1.5">{f.text}</p>
                        {f.evidenceQuote && (
                          <p className="mt-1 text-xs text-muted-foreground italic border-l-2 pl-2">{f.evidenceQuote}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Sem factos extraídos.</p>
              )}
            </div>

            {/* Artigo */}
            {run.article && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Artigo · {run.article.wordCount} palavras {run.article.model && `· ${run.article.model}`}
                  </p>
                </div>
                <div className="rounded-lg border p-4 bg-card">
                  <h3 className="font-semibold text-base">{run.article.title}</h3>
                  {run.article.lead && <p className="text-sm text-muted-foreground mt-1">{run.article.lead}</p>}
                  <div className="mt-3 text-sm whitespace-pre-wrap leading-relaxed">{run.article.body}</div>
                </div>
              </div>
            )}

            {/* SEO / Discover */}
            {run.article?.slug && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">SEO / Discover</p>
                </div>
                <div className="rounded-lg border p-3 space-y-1.5 text-sm bg-card">
                  <p><span className="text-muted-foreground">Slug:</span> <span className="font-mono text-xs">{run.article.slug}</span></p>
                  {run.article.seoTitle && <p><span className="text-muted-foreground">Título SEO:</span> {run.article.seoTitle} <span className="text-xs text-muted-foreground/60">({run.article.seoTitle.length})</span></p>}
                  {run.article.discoverTitle && <p><span className="text-muted-foreground">Título Discover:</span> {run.article.discoverTitle} <span className="text-xs text-muted-foreground/60">({run.article.discoverTitle.length})</span></p>}
                  {run.article.metaDescription && <p><span className="text-muted-foreground">Meta:</span> {run.article.metaDescription} <span className="text-xs text-muted-foreground/60">({run.article.metaDescription.length})</span></p>}
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {run.article.category && <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-900 text-white">{run.article.category}</span>}
                    {run.article.tags.map((t) => <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted">{t}</span>)}
                  </div>
                </div>
              </div>
            )}

            {/* Relatórios de QA */}
            {run.qaReports.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Controlo de qualidade</p>
                </div>
                <div className="space-y-2">
                  {run.qaReports.map((q) => (
                    <div key={q.id} className="rounded-lg border p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium uppercase">{q.stage}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", q.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
                          {q.passed ? "passou" : "falhou"}
                        </span>
                        {q.score != null && <span className="text-xs text-muted-foreground ml-auto">score {q.score.toFixed(2)}</span>}
                      </div>
                      {q.issues && q.issues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {q.issues.map((iss, i) => (
                            <div key={i} className={cn("text-xs rounded border px-2 py-1", SEVERITY_CLS[iss.severity] ?? "bg-muted")}>
                              <span className="font-medium">{iss.type}</span> · {iss.detail}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Imagem */}
            {run.image && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Imagem destacada</p>
                </div>
                <div className="rounded-lg border p-3 flex gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={run.image.url} alt={run.image.alt} className="h-20 w-32 object-cover rounded-md border shrink-0 bg-muted" />
                  <div className="min-w-0 text-sm space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                        run.image.qaStatus === "ok" ? "bg-emerald-100 text-emerald-700" : run.image.qaStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600")}>
                        {run.image.qaStatus === "ok" ? "validada" : run.image.qaStatus === "rejected" ? "rejeitada" : "pendente"}
                      </span>
                      <span className="text-xs text-muted-foreground">{run.image.source}</span>
                      {run.image.width && <span className="text-xs text-muted-foreground">{run.image.width}×{run.image.height} {run.image.format}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">Alt: {run.image.alt}</p>
                    {run.image.license && <p className="text-xs text-muted-foreground">Licença: {run.image.license}</p>}
                    {run.image.attribution && <p className="text-xs text-muted-foreground truncate">{run.image.attribution}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* WordPress */}
            {run.wpDraft && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">WordPress</p>
                </div>
                <div className="rounded-lg border p-3 text-sm space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", run.wpDraft.simulated ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                      {run.wpDraft.simulated ? "simulado" : "real"}
                    </span>
                    <span className="text-muted-foreground">estado: {run.wpDraft.status}</span>
                    {run.wpDraft.wpPostId && <span className="text-muted-foreground">· WP #{run.wpDraft.wpPostId}</span>}
                    {run.wpDraft.link && <a href={run.wpDraft.link} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline text-xs ml-auto">abrir</a>}
                  </div>
                  {run.wpDraft.publishedAt && (
                    <p className="text-xs text-emerald-700">
                      Publicado {new Date(run.wpDraft.publishedAt).toLocaleString("pt-PT")}
                      {run.wpDraft.publishedBy && ` · aprovado por ${run.wpDraft.publishedBy}`}
                    </p>
                  )}
                  {run.wpDraft.error && <span className="text-red-600 text-xs">{run.wpDraft.error}</span>}
                </div>
              </div>
            )}

            {/* Redes sociais */}
            {run.socialPosts.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Share2 className="h-4 w-4 text-muted-foreground" />
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Redes sociais</p>
                </div>
                {run.socialPosts.map((sp) => (
                  <div key={sp.id} className="rounded-lg border p-3 text-sm space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                        sp.status === "PUBLISHED" ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-600")}>
                        {sp.status === "PUBLISHED" ? "publicado" : "rascunho"}
                      </span>
                      {sp.targets.length > 0
                        ? sp.targets.map((t, i) => <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-muted">{t.account.accountName}</span>)
                        : <span className="text-xs text-muted-foreground">sem contas ligadas</span>}
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{sp.text}</p>
                  </div>
                ))}
                {run.state === "SOCIAL_QA_OK" && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Rascunho social pronto. Distribui pelo <a href="/social" className="text-blue-600 hover:underline">Social Hub</a> (nada é publicado em redes sem a tua acção).
                  </p>
                )}
              </div>
            )}

            {/* Trilho de decisões */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ScrollText className="h-4 w-4 text-muted-foreground" />
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Trilho de decisões</p>
              </div>
              <div className="space-y-1">
                {run.decisions.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", d.ok ? "bg-emerald-500" : "bg-red-500")} />
                    <span className="font-medium w-40 shrink-0">{d.agent}</span>
                    <span className="text-muted-foreground">
                      {d.fromState} → {d.toState}
                    </span>
                    <span className="text-muted-foreground/60 ml-auto shrink-0">
                      {d.model && `${d.model} · `}{d.durationMs != null && `${d.durationMs}ms`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
