"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const [email, setEmail] = useState("");
  const [createdAt, setCreatedAt] = useState("");
  const [lastSignIn, setLastSignIn] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await createClient().auth.getUser();
      const u = data.user;
      setEmail(u?.email ?? "");
      setCreatedAt(u?.created_at ? new Date(u.created_at).toLocaleDateString() : "");
      setLastSignIn(
        u?.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString() : ""
      );
    })();
  }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (newPassword !== confirm) {
      setMsg({ ok: false, text: "Passwords do not match" });
      return;
    }
    if (newPassword.length < 6) {
      setMsg({ ok: false, text: "Password must be at least 6 characters" });
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: error.message });
      return;
    }
    setNewPassword("");
    setConfirm("");
    setMsg({ ok: true, text: "Password updated successfully" });
  }

  return (
    <AppShell title="My Profile" subtitle="Account details and security">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Account
          </h2>
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-xl font-black text-brand-700">
              {(email[0] ?? "U").toUpperCase()}
            </span>
            <div>
              <p className="font-semibold text-slate-900">{email || "…"}</p>
              <p className="text-xs text-slate-400">Inventory Manager / Warehouse Staff</p>
            </div>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Member since</dt>
              <dd className="font-medium text-slate-700">{createdAt || "—"}</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-2">
              <dt className="text-slate-500">Last sign-in</dt>
              <dd className="font-medium text-slate-700">{lastSignIn || "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="card p-5">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Change password
          </h2>
          <form onSubmit={changePassword} className="space-y-3">
            <div>
              <label className="label">New password</label>
              <input
                className="input"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {msg && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                }`}
              >
                {msg.text}
              </p>
            )}
            <button className="btn-primary" disabled={busy}>
              {busy ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
