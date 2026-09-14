"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Mail, Shield, Trash2, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useToast } from "@/components/toast";

const inputClass =
  "h-11 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-ring/20";

export default function TeamPage() {
  /* A live query now that the roster is rows in this database rather than in Clerk — the page
     updates itself the moment someone accepts an invite, with nothing to refetch by hand. */
  const data = useQuery(api.team.overview);
  const invite = useAction(api.team.invite);
  const revokeInvite = useMutation(api.team.revokeInvite);
  const removeMember = useMutation(api.team.removeMember);
  const rename = useMutation(api.team.rename);
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [name, setName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // `name` starts null and only takes the stored value until the admin edits it, so a live
  // update from someone else cannot yank the text out from under them mid-type.
  const nameValue = name ?? data?.orgName ?? "";

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast(ok);
    } catch (err) {
      toast(err instanceof Error ? err.message : "That didn't work.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (data === null) {
    return (
      <div className="space-y-7 pb-10">
        <Header />
        <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
          You are not on a team yet.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-7 pb-10">
        <Header />
        <p className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          Loading your team…
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-10">
      <Header isAdmin={data.isAdmin} />

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">Team name</h2>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={nameValue}
            onChange={(event) => setName(event.target.value)}
            disabled={!data.isAdmin}
            className={`${inputClass} disabled:opacity-60`}
          />
          {data.isAdmin ? (
            <button
              onClick={() => void run(() => rename({ name: nameValue }), "Team renamed")}
              disabled={busy || !nameValue.trim() || nameValue.trim() === data.orgName}
              className="h-11 shrink-0 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              Save
            </button>
          ) : null}
        </div>
        {!data.isAdmin ? (
          <p className="mt-2 text-xs text-muted-foreground">Only an admin can rename the team.</p>
        ) : null}
      </section>

      {data.isAdmin ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">Invite someone</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@company.com"
              type="email"
              className={inputClass}
            />
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "admin" | "member")}
              className={`${inputClass} sm:w-44`}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() =>
                void run(async () => {
                  await invite({ email, role });
                  setEmail("");
                }, `Invite sent to ${email.trim()}`)
              }
              disabled={busy || !email.trim()}
              className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
            >
              <Mail className="h-4 w-4" />
              Send invite
            </button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            They get an email with a link that expires in 7 days and works once. Once they
            accept, they see this same dashboard — the same agent, property, knowledge base and
            leads. Only admins can open this page.
          </p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-5 flex items-center gap-2">
          <Shield className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-base font-semibold">
            Members <span className="text-muted-foreground">({data.members.length})</span>
          </h2>
        </div>

        <div className="space-y-2">
          {data.members.map((member) => (
            <motion.div
              key={member.membershipId}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-4 rounded-xl border border-border px-4 py-3.5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-sm font-semibold text-blue-600">
                {member.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  (member.name[0] ?? "?").toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.name}
                  {member.isSelf ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
                  member.role === "admin"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {member.role === "admin" ? "Admin" : "Member"}
              </span>
              {data.isAdmin && !member.isSelf ? (
                <button
                  onClick={() =>
                    void run(
                      () => removeMember({ membershipId: member.membershipId }),
                      `${member.name} removed from the team`,
                    )
                  }
                  disabled={busy}
                  aria-label={`Remove ${member.name}`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : (
                <span className="w-8 shrink-0" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {data.isAdmin ? (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-center gap-2">
            <Mail className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              Pending invites{" "}
              <span className="text-muted-foreground">({data.invitations.length})</span>
            </h2>
          </div>

          {data.invitations.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Nobody is waiting on an invite.
            </p>
          ) : (
            <div className="space-y-2">
              {data.invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center gap-4 rounded-xl border border-border px-4 py-3.5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                    <Mail className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited {new Date(invitation.createdAt).toLocaleDateString()} ·{" "}
                      {invitation.role === "admin" ? "Admin" : "Member"}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      void run(
                        () => revokeInvite({ inviteId: invitation.id }),
                        "Invite revoked",
                      )
                    }
                    disabled={busy}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-40"
                  >
                    <X className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function Header({ isAdmin }: { isAdmin?: boolean }) {
  return (
    <header>
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Team</h1>
      <p className="mt-1 max-w-3xl text-sm leading-5 text-muted-foreground">
        Everyone here shares one dashboard — the same agent, property, knowledge base, screening
        questions and leads.{" "}
        {isAdmin === false
          ? "You can see who is on the team; only an admin can invite or remove people."
          : "Inviting and removing people is admin-only."}
      </p>
    </header>
  );
}
