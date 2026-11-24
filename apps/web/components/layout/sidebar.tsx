"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Newspaper,
  GitBranch,
  Database,
  Layers,
  FileEdit,
  Globe,
  Image,
  Share2,
  Bell,
  Settings,
  Activity,
  LayoutDashboard,
  Users,
  HardDrive,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  badgeKey?: string;
  disabled?: boolean;
  children?: { label: string; href: string; icon: React.ElementType }[];
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: null,
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Redação",
    items: [
      { label: "Radar", href: "/radar", icon: Newspaper },
      { label: "Pipeline", href: "/pipeline", icon: GitBranch },
      { label: "Fontes", href: "/fontes", icon: Database },
      { label: "Editor", href: "/editor", icon: FileEdit, badgeKey: "pendentesEditor" },
    ],
  },
  {
    title: "Publicação",
    items: [
      { label: "WordPress", href: "/wordpress", icon: Globe },
      { label: "Imagens", href: "/imagens", icon: Image, disabled: true },
      { label: "Social Hub", href: "/social", icon: Share2 },
      { label: "Push", href: "/push", icon: Bell },
    ],
  },
  {
    title: "Sistema",
    items: [
      { label: "Logs", href: "/logs", icon: Activity },
      { label: "Utilizadores", href: "/utilizadores", icon: Users },
      { label: "Backups", href: "/backups", icon: HardDrive },
      { label: "Configurações", href: "/configuracoes", icon: Settings },
    ],
  },
];

interface Stats {
  pendentesEditor: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const [stats, setStats] = useState<Stats>({ pendentesEditor: 0 });

  useEffect(() => {
    const load = () =>
      fetch("/api/stats")
        .then((r) => r.json())
        .then((d) => setStats({ pendentesEditor: (d.pendentesAprovacao ?? 0) + (d.prontoEditor ?? 0) }))
        .catch(() => {});
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  const linkBase =
    "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-150";

  return (
    <aside className="w-[232px] shrink-0 flex flex-col bg-zinc-950 text-zinc-400">
      {/* Marca */}
      <div className="px-5 pt-6 pb-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white font-bold text-sm tracking-tight shadow-lg shadow-red-950/40">
            HG
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-sm font-semibold text-white tracking-tight">Redação HG</span>
            <span className="text-[10px] text-zinc-500 uppercase tracking-[0.18em] mt-1">hugogil.pt</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 px-3 pb-3 space-y-5 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi} className="space-y-0.5">
            {group.title && (
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600 select-none">
                {group.title}
              </p>
            )}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const badge = item.badgeKey ? stats[item.badgeKey as keyof Stats] : 0;

              if (item.disabled) {
                return (
                  <div key={item.href} className={cn(linkBase, "text-zinc-700 cursor-not-allowed")}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                    <span className="ml-auto text-[9px] uppercase tracking-wider text-zinc-700 border border-zinc-800 rounded px-1 py-px">breve</span>
                  </div>
                );
              }

              if (item.children) {
                const expanded = pathname.startsWith(item.href);
                return (
                  <div key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        linkBase,
                        pathname === item.href
                          ? "bg-zinc-900 text-white"
                          : expanded
                          ? "text-zinc-200"
                          : "hover:bg-zinc-900/70 hover:text-zinc-200"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1">{item.label}</span>
                      {expanded
                        ? <ChevronDown className="h-3.5 w-3.5 opacity-40" />
                        : <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
                    </Link>
                    {expanded && (
                      <div className="ml-[1.15rem] mt-1 space-y-0.5 border-l border-zinc-800 pl-3">
                        {item.children.map((child) => {
                          const ChildIcon = child.icon;
                          const childActive = pathname === child.href || pathname.startsWith(child.href + "/");
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={cn(
                                "flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors duration-150",
                                childActive
                                  ? "text-white bg-zinc-900 font-medium"
                                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/60"
                              )}
                            >
                              <ChildIcon className="h-3.5 w-3.5 shrink-0" />
                              <span>{child.label}</span>
                              {childActive && <span className="ml-auto h-1 w-1 rounded-full bg-red-500" />}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    linkBase,
                    active ? "bg-zinc-900 text-white" : "hover:bg-zinc-900/70 hover:text-zinc-200"
                  )}
                >
                  {/* Barra de acento do item activo */}
                  <span
                    className={cn(
                      "absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-full bg-red-500 transition-opacity",
                      active ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <Icon className={cn("h-4 w-4 shrink-0", active && "text-red-400")} />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold min-w-[1.2rem] text-center bg-red-600/90 text-white">
                      {badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-4 border-t border-zinc-900 flex items-center justify-between">
        <p className="text-[10px] text-zinc-600 uppercase tracking-[0.16em]">MVP v0.1</p>
        <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          online
        </span>
      </div>
    </aside>
  );
}
