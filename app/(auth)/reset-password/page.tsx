"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<"request" | "verify">("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1 — send the OTP to the user's email
  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setInfo(`A 6-digit code was sent to ${email}. It expires in a few minutes.`);
    setStep("verify");
  }

  // Step 2 — verify OTP and update the password
  async function verifyAndReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const { error: updErr } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setBusy(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="card w-full max-w-md p-7">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
        <p className="mt-1 text-xs text-slate-500">
          {step === "request"
            ? "We'll email you a one-time code (OTP)."
            : "Enter the 6-digit code from your email and choose a new password."}
        </p>
      </div>

      {step === "request" ? (
        <form onSubmit={requestCode} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send code"}
          </button>
        </form>
      ) : (
        <form onSubmit={verifyAndReset} className="space-y-4">
          <div>
            <label className="label">6-digit code</label>
            <input
              className="input text-center text-lg font-bold tracking-[0.5em]"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="······"
            />
          </div>
          <div>
            <label className="label">New password</label>
            <input
              className="input"
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Confirm new password</label>
            <input
              className="input"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {info && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>
          )}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Verifying…" : "Verify & set new password"}
          </button>
          <button
            type="button"
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
            onClick={() => setStep("request")}
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="mt-5 text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
