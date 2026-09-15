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
    <main className="mx-auto mt-16 w-full max-w-md">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-gray-900">
          Equixity Merchant
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Fund your reward pool and configure rewards for your customers.
        </p>

        {errorParam === "invalid_link" && (
          <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
            That confirmation link is invalid or expired. Please sign in or sign
            up again.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                mode === m
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {m === "signin" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {mode === "signup" && (
            <label className="block text-sm font-medium text-gray-700">
              Business name
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          {message && (
            <p
              className={`rounded px-3 py-2 text-sm ${
                message.kind === "error"
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </main>
  );
}