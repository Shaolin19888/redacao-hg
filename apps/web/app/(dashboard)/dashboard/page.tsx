import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Newspaper,
  Database,
  Layers,
  FileEdit,
  CheckSquare,
  Globe,
  Image,
  Share2,
  Bell,
  Settings,
  Activity,
  LayoutDashboard,
  Users,
  HardDrive,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

const modules = [
  {
    title: "Radar de Notícias",
    description: "Notícias recolhidas das fontes activas",
    icon: Newspaper,
    href: "/radar",
    active: true,
  },
  {
    title: "Fontes",
    description: "Gestão das fontes editoriais",
    icon: Database,
    href: "/fontes",
    active: true,
  },
  {
    title: "Editor",
    description: "Geração e revisão de conteúdos",
    icon: FileEdit,
    href: "/editor",
    active: true,
  },
  {
    title: "Aprovações",
    description: "Conteúdos a aguardar decisão",
    icon: CheckSquare,
    href: "/aprovacoes",
    active: true,
  },
  {
    title: "WordPress",
    description: "Rascunhos e publicações",
    icon: Globe,
    href: "/wordpress",
    active: true,
  },
  {
    title: "Imagens",
    description: "Banco de imagens da Drive",
    icon: Image,
    href: "/imagens",
    active: false,
  },
  {
    title: "Redes Sociais",
    description: "Conteúdos para redes sociais",
    icon: Share2,
    href: "/social",
    active: true,
  },
  {
    title: "Push",
    description: "Notificações push",
    icon: Bell,
    href: "/push",
    active: true,
  },
  {
    title: "Logs",
    description: "Histórico de acções",
    icon: Activity,
    href: "/logs",
    active: true,
  },
  {
    title: "Utilizadores",
    description: "Gestão de utilizadores e permissões",
    icon: Users,
    href: "/utilizadores",
    active: true,
  },
  {
    title: "Backups",
    description: "Estado e gestão de backups da base de dados",
    icon: HardDrive,
    href: "/backups",
    active: true,
  },
  {
    title: "Configurações",
    description: "Fontes, modelos e integrações",
    icon: Settings,
    href: "/configuracoes",
    active: true,
  },
];

async function getStats() {
  const [totalRecolhidas, pendentesAprovacao, prontoEditor, rascunhosWP, workerSetting, lastFetch] =
    await Promise.all([
      prisma.newsItem.count(),
      prisma.newsItem.count({ where: { status: "texto_gerado" } }),
      prisma.newsItem.count({ where: { status: "guardada" } }),
      prisma.newsItem.count({ where: { status: "rascunho_wp" } }),
      prisma.setting.findUnique({ where: { key: "cron_fetch_enabled" } }),
      prisma.log.findFirst({ where: { action: "cron_fetch" }, orderBy: { createdAt: "desc" } }),
    ]);
  return { totalRecolhidas, pendentesAprovacao, prontoEditor, rascunhosWP, workerAtivo: workerSetting?.value === "true", ultimaRecolha: lastFetch?.createdAt ?? null };
}

export default async function DashboardPage() {
  const stats = await getStats();

  const statsCards = [
    { label: "Notícias recolhidas", value: stats.totalRecolhidas, href: "/radar", accent: "bg-zinc-900", active: false },
    { label: "A aguardar aprovação", value: stats.pendentesAprovacao, href: "/aprovacoes", accent: "bg-orange-500", active: stats.pendentesAprovacao > 0 },
    { label: "Prontos para editor", value: stats.prontoEditor, href: "/editor", accent: "bg-blue-500", active: stats.prontoEditor > 0 },
    { label: "Rascunhos WordPress", value: stats.rascunhosWP, href: "/wordpress", accent: "bg-emerald-500", active: false },
  ];

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Cabeçalho */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-600 mb-1.5">Painel editorial</p>
          <h1 className="text-2xl font-semibold tracking-tight">Redação HG</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Da recolha à publicação, com mão humana em cada passo.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs pb-1">
          <span className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-medium",
            stats.workerAtivo
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-muted text-muted-foreground border-border"
          )}>
            <span className={cn("h-1.5 w-1.5 rounded-full", stats.workerAtivo ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
            Radar {stats.workerAtivo ? "activo" : "pausado"}
          </span>
          {stats.ultimaRecolha && (
            <span className="text-muted-foreground">
              última recolha às {new Date(stats.ultimaRecolha).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>

      {/* Pipeline editorial */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {statsCards.map((s) => (
          <Link key={s.href} href={s.href} className="group">
            <div className="relative overflow-hidden border rounded-xl p-4 bg-card hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
              <span className={cn("absolute inset-x-0 top-0 h-[3px]", s.accent, !s.active && "opacity-25")} />
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-3xl font-semibold mt-1.5 tabular-nums tracking-tight">{s.value}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Módulos */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-3">Módulos</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            const card = (
              <div
                className={cn(
                  "group rounded-xl border bg-card p-4 flex items-start gap-3.5 transition-all duration-200 h-full",
                  mod.active
                    ? "hover:shadow-md hover:-translate-y-0.5"
                    : "opacity-50 cursor-not-allowed"
                )}
              >
                <span className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors",
                  mod.active ? "bg-zinc-100 text-zinc-700 group-hover:bg-red-50 group-hover:text-red-600" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    {mod.title}
                    {!mod.active && (
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground border rounded px-1 py-px">breve</span>
                    )}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    {mod.description}
                  </p>
                </div>
              </div>
            );

            if (mod.active) {
              return (
                <Link key={mod.href} href={mod.href}>
                  {card}
                </Link>
              );
            }

            return <div key={mod.href}>{card}</div>;
          })}
        </div>
      </div>
    </div>
  );
}
