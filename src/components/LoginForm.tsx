"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Email/password sign in + sign up (spec section 7). Sign up collects a business
 * name which is passed as user metadata and consumed at JIT provisioning.
 *
 * Email confirmation is OFF for this build, so a successful signUp returns a
 * session → straight to /dashboard. The code still handles the case where it is
 * ON (no session returned): it shows a "check your email" state instead of
 * failing, so flipping the toggle back on later needs no code change.
 */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const errorParam = searchParams ? String(searchParams.get("error") ?? "") : "";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setMessage({ kind: "error", text: error.message });
          setBusy(false);
          return;
        }
        router.push("/dashboard");
        router.refresh();
        return;
      }

      // sign up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { business_name: businessName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (error) {
        setMessage({ kind: "error", text: error.message });
        setBusy(false);
        return;
      }
      if (data.session) {
        // Confirmation off → signed straight in.
        setMode("signin");
        router.push("/dashboard");
        router.refresh();
        return;
      }
      // Confirmation on → session not returned yet.
      setMessage({
        kind: "info",
        text: "Account created. Check your email to confirm, then sign in.",
      });
      setMode("signin");
    } catch (err) {
      setMessage({ kind: "error", text: `Unexpected error: ${err}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg rounded-3xl border border-white/60 bg-gradient-to-b from-white via-white to-equixity-mist p-8 shadow-[0_12px_40px_-12px_rgba(105,18,128,0.18)]">
        <h1 className="text-xl font-semibold text-ink">
          Equixity Merchant
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fund your reward pool and configure rewards for your customers.
        </p>

        {errorParam === "invalid_link" && (
          <p className="mt-3 rounded-full bg-red-50 px-4 py-2 text-sm text-red-700">
            That confirmation link is invalid or expired. Please sign in or sign
            up again.
          </p>
        )}

        <div className="mt-5 flex gap-2">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-equixity-deep text-white hover:bg-equixity-deepDark"
                  : "bg-white text-gray-600 hover:bg-equixity-mist"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {mode === "signup" && (
            <label className="block text-sm font-medium text-gray-700">
              Business name
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 block w-full rounded-full border border-gray-300 bg-white/70 px-4 py-2.5 text-sm transition focus:border-equixity-deep focus:outline-none focus:ring-2 focus:ring-equixity-deep/25"
                placeholder="Acme Inc."
              />
            </label>
          )}
          <label className="block text-sm font-medium text-gray-700">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-full border border-gray-300 bg-white/70 px-4 py-2.5 text-sm transition focus:border-equixity-deep focus:outline-none focus:ring-2 focus:ring-equixity-deep/25"
              placeholder="you@example.com"
            />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-full border border-gray-300 bg-white/70 px-4 py-2.5 text-sm transition focus:border-equixity-deep focus:outline-none focus:ring-2 focus:ring-equixity-deep/25"
            />
          </label>

          {message && (
            <p
              className={`rounded-2xl px-4 py-2 text-sm ${
                message.kind === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-equixity-mist text-equixity-deepDark"
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-equixity-deep px-4 py-2.5 text-sm font-medium text-white transition hover:bg-equixity-deepDark disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}