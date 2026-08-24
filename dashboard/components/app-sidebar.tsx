"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Phone,
  UserPlus,
  MessageSquare,
  Building2,
  Menu,
  X,
  Settings,
  BookOpen,
  Users,
} from "lucide-react";
import { useState } from "react";

// Messages is intentionally hidden from nav for now (feature not ready to show yet) — the
// route, page, and backend all still work, it's just not linked to from anywhere. Flip
// `hidden` back off to bring it back into the nav with no other changes needed.
const ALL_LINKS = [
  { href: "/", label: "Call", icon: Phone, hidden: false },
  { href: "/leads", label: "Leads", icon: UserPlus, hidden: false },
  { href: "/tenants", label: "Tenants", icon: Users, hidden: false },
  { href: "/messages", label: "Messages", icon: MessageSquare, hidden: true },
  { href: "/docs", label: "Knowledge", icon: BookOpen, hidden: false },
  { href: "/property", label: "Property", icon: Building2, hidden: false },
  { href: "/settings", label: "Agent", icon: Settings, hidden: false },
];

const LINKS = ALL_LINKS.filter((l) => !l.hidden);

// The bottom nav only has room for a handful of items; the rest live in the "More" sheet.
const BOTTOM_NAV_LINKS = LINKS.filter((l) => ["/", "/leads", "/tenants"].includes(l.href));
const MORE_LINKS = LINKS.filter((l) => ["/property", "/docs", "/settings"].includes(l.href));

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className="relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
          >
            {active && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-lg bg-sidebar-primary"
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            )}
            <Icon
              className={`relative z-10 h-4 w-4 shrink-0 ${
                active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"
              }`}
            />
            <span
              className={`relative z-10 font-medium ${
                active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/80"
              }`}
            >
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-1">
      {/* Same monogram as the browser tab favicon (app/icon.tsx) — one brand mark, one place to change it. */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        E
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-sidebar-foreground">Emily</div>
        <div className="text-[11px] text-sidebar-foreground/50">Leasing Assistant</div>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [moreOpen, setMoreOpen] = useState(false);
  const pathname = usePathname();
  const moreActive = MORE_LINKS.some((l) => l.href === pathname);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4 lg:flex">
        <Brand />
        <NavLinks />
      </aside>

      {/* Mobile top bar (brand only — navigation lives in the bottom bar) */}
      <header className="sticky top-0 z-30 flex items-center border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Brand />
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-sidebar-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden">
        {BOTTOM_NAV_LINKS.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px]"
            >
              <Icon
                className={`h-5 w-5 ${active ? "text-primary" : "text-sidebar-foreground/60"}`}
              />
              <span className={active ? "font-medium text-primary" : "text-sidebar-foreground/60"}>
                {link.label}
              </span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px]"
          aria-label="More"
        >
          <Menu className={`h-5 w-5 ${moreActive ? "text-primary" : "text-sidebar-foreground/60"}`} />
          <span className={moreActive ? "font-medium text-primary" : "text-sidebar-foreground/60"}>
            More
          </span>
        </button>
      </nav>

      {/* "More" sheet — Knowledge + Agent settings, kept out of the primary bottom nav */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMoreOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-sidebar-border bg-sidebar p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] lg:hidden"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-medium text-sidebar-foreground">More</span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="rounded-lg p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-col gap-1">
                {MORE_LINKS.map((link) => {
                  const active = pathname === link.href;
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
