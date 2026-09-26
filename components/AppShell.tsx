"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { section: "Main", items: [
    { href: "/", label: "Dashboard", icon: "▚" },
  ]},
  { section: "Products", items: [
    { href: "/products", label: "Products", icon: "▣" },
  ]},
  { section: "Operations", items: [
    { href: "/operations/receipts", label: "Receipts", icon: "↘" },
    { href: "/operations/deliveries", label: "Delivery Orders", icon: "↗" },
    { href: "/operations/transfers", label: "Internal Transfers", icon: "⇄" },
    { href: "/operations/adjustments", label: "Inventory Adjustments", icon: "⚖" },
    { href: "/operations/move-history", label: "Move History", icon: "☰" },
    { href: "/", label: "Dashboard", icon: "▚", hidden: true },
  ]},
  { section: "Settings", items: [
    { href: "/settings/warehouse", label: "Warehouse", icon: "⛭" },
  ]},
];

export default function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string>("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await createClient().auth.getUser();
      setEmail(data.user?.email ?? "");
    })();
  }, []);

  async function logout() {
    setSigningOut(true);
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
            S
          </span>
          <div>
            <p className="text-sm font-bold leading-tight text-slate-900">StockSense</p>
            <p className="text-[11px] text-slate-400">Inventory, live</p>
          </div>
        </div>
        <SidebarNav pathname={pathname} />
        <div className="mt-auto border-t border-slate-100 p-4">
          <p className="truncate text-xs font-semibold text-slate-600">{email || "…"}</p>
          <button
            onClick={logout}
            disabled={signingOut}
            className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {signingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3.5 md:px-8">
            <button
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-slate-600 md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              ☰
            </button>
            <div className="min-w-0 flex-1">
              {title && <h1 className="truncate text-lg font-bold text-slate-900">{title}</h1>}
              {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
            </div>
            {actions}
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700"
                aria-label="Profile menu"
              >
                {(email[0] ?? "U").toUpperCase()}
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-11 z-30 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                  <Link
                    href="/profile"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    My Profile
                  </Link>
                  <button
                    onClick={logout}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
          {menuOpen && (
            <div className="border-t border-slate-100 px-4 py-2 md:hidden">
              <SidebarNav pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </div>
          )}
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 pb-4">
      {NAV.map((group) => (
        <div key={group.section} className="mb-3">
          <p className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {group.section}
          </p>
          {group.items
            .filter((i) => !i.hidden)
            .map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  onClick={onNavigate}
                  className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="w-4 text-center text-xs opacity-70">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
        </div>
      ))}
    </nav>
  );
}
