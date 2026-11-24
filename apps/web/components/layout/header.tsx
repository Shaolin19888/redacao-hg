"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
}

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : source.slice(0, 2)).toUpperCase();
}

export function Header({ user }: HeaderProps) {
  const today = new Date().toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <header className="h-14 shrink-0 border-b bg-card/80 backdrop-blur flex items-center justify-between px-6">
      <p className="text-sm text-muted-foreground capitalize">{today}</p>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
            {initials(user?.name, user?.email)}
          </span>
          <div className="text-left hidden sm:block">
            <p className="text-sm font-medium leading-none">{user?.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{user?.email}</p>
          </div>
        </div>

        <div className="h-5 w-px bg-border" />

        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </div>
    </header>
  );
}
