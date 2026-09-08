"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useClerk, useUser } from "@clerk/nextjs";
import {
  Phone,
  History,
  MessageSquare,
  Building2,
  Menu,
  X,
  Settings,
  BookOpen,
  Users,
  MessageCircle,
  ChevronDown,
  LogOut,
  Check,
} from "lucide-react";
import { useState } from "react";

// Messages, WhatsApp, and Agent are intentionally hidden from nav for now — the route, page,
// and backend all still work for each, they're just not linked to from anywhere. Flip
// `hidden` back off to bring any of them back into the nav with no other changes needed.
const ALL_LINKS = [
  { href: "/call", label: "Call", icon: Phone, hidden: false },
  { href: "/leads", label: "Leads", icon: History, hidden: false },
  { href: "/tenants", label: "Tenants", icon: Users, hidden: false },
  { href: "/whatsapp", label: "WhatsApp", icon: MessageCircle, hidden: true },
  { href: "/messages", label: "Messages", icon: MessageSquare, hidden: true },
  { href: "/docs", label: "Knowledge", icon: BookOpen, hidden: false },
  { href: "/property", label: "Property", icon: Building2, hidden: false },
  { href: "/settings", label: "Agent", icon: Settings, hidden: true },
];

const LINKS = ALL_LINKS.filter((l) => !l.hidden);

// The bottom nav only has room for a handful of items; the rest live in the "More" sheet.
const BOTTOM_NAV_LINKS = LINKS.filter((l) => ["/call", "/leads", "/tenants"].includes(l.href));
const MORE_LINKS = LINKS.filter((l) => ["/whatsapp", "/property", "/docs", "/settings"].includes(l.href));

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1.5">
      {LINKS.map((link) => {
        const active = pathname === link.href;
        const Icon = link.icon;
        return (
          <Link
            key={link.href}
            href={link.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active ? "" : "hover:bg-sidebar-accent"
            }`}
          >
            {active && (
              <motion.div
                layoutId="sidebar-active"
                className="absolute inset-0 rounded-xl bg-sidebar-accent"
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
              />
            )}
            <Icon
              className={`relative z-10 h-4 w-4 shrink-0 ${
                active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/55"
              }`}
            />
            <span
              className={`relative z-10 ${
                active ? "font-semibold text-sidebar-accent-foreground" : "font-medium text-sidebar-foreground/80"
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

function SidebarUser() {
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  if (!isSignedIn || !user) return null;

  const name =
    user.fullName?.trim() ||
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() ||
    user.primaryEmailAddress?.emailAddress ||
    "Account";
  const email = user.primaryEmailAddress?.emailAddress;
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  const logout = () => void signOut({ redirectUrl: "/" });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-sidebar-primary text-xs font-semibold text-sidebar-primary-foreground"
        aria-expanded={open}
        aria-label="Account menu"
      >
        {user.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close account menu"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute right-0 top-10 z-50 w-56 rounded-xl border border-sidebar-border bg-card p-2 shadow-lg"
            >
              <div className="px-2 py-1.5">
                <div className="truncate text-sm font-medium text-sidebar-foreground">{name}</div>
                {email ? (
                  <div className="truncate text-[11px] text-sidebar-foreground/50">{email}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Brand({
  onAccountClick,
  open = false,
}: {
  onAccountClick?: () => void;
  open?: boolean;
}) {
  const inner = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
        S
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-sm font-semibold text-sidebar-foreground">Sara</div>
        <div className="text-[11px] text-sidebar-foreground/50">Leasing Assistant</div>
      </div>
      {onAccountClick ? (
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-sidebar-foreground/40 transition-transform ${open ? "rotate-180" : ""}`}
        />
      ) : null}
    </>
  );

  if (!onAccountClick) {
    return <div className="flex items-center gap-2.5 px-1">{inner}</div>;
  }

  return (
    <button
      type="button"
      onClick={onAccountClick}
      className="flex w-full items-center gap-2.5 rounded-xl px-1 py-0.5 text-left hover:bg-sidebar-accent"
      aria-label="Account menu"
    >
      {inner}
    </button>
  );
}

function BrandAccount() {
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);

  const name =
    user?.fullName?.trim() ||
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    user?.primaryEmailAddress?.emailAddress ||
    "Account";
  const email = user?.primaryEmailAddress?.emailAddress;
  const logout = () => void signOut({ redirectUrl: "/" });

  return (
    <div className="relative">
      <Brand onAccountClick={() => setOpen((current) => !current)} open={open} />
      <AnimatePresence>
        {open && isSignedIn && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40 cursor-default"
              aria-label="Close account menu"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="absolute left-0 right-0 top-12 z-50 rounded-xl border border-sidebar-border bg-card p-2 shadow-lg"
            >
              <div className="px-2 py-1.5">
                <div className="truncate text-sm font-medium text-sidebar-foreground">{name}</div>
                {email ? (
                  <div className="truncate text-[11px] text-sidebar-foreground/50">{email}</div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusCard() {
  return (
    <div className="rounded-xl border border-sidebar-border bg-card p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </div>
        <div className="min-w-0 leading-tight">
          <div className="text-sm font-semibold text-sidebar-foreground">AI Receptionist</div>
          <p className="mt-1 text-[11px] leading-4 text-sidebar-foreground/50">
            Always here. Never misses a call.
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="text-xs font-medium text-success">Online</span>
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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-8 border-r border-sidebar-border bg-sidebar px-3.5 py-5 lg:flex">
        <BrandAccount />
        <NavLinks />
        <div className="mt-auto">
          <StatusCard />
        </div>
      </aside>

      {/* Mobile top bar (brand only — navigation lives in the bottom bar) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-sidebar/95 px-4 py-3 backdrop-blur-sm lg:hidden">
        <Brand />
        <SidebarUser />
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
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${
                        active
                          ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
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
