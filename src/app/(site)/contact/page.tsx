"use client";

import { useState } from "react";

/**
 * Contact form — posts directly to Web3Forms (no backend route needed).
 * Access key is a public submit token by design (Web3Forms' documented
 * client-side usage); it only allows sending through the configured inbox.
 */
const ACCESS_KEY = "501e378f-9bc2-4a72-ac00-8518b1cd557d";

export default function ContactPage() {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    try {
      const res = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: ACCESS_KEY,
          subject: `Equixity contact: ${String(data.get("subject") || "General")}`,
          from_name: String(data.get("name") || ""),
          replyto: String(data.get("email") || ""),
          message: String(data.get("message") || ""),
        }),
      });
      const json = (await res.json()) as { success?: boolean };
      if (res.ok && json.success) {
        setStatus("sent");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const inputClass =
    "w-full rounded-full border border-ink/10 bg-white/70 px-4 py-2.5 text-sm text-ink outline-none transition focus:border-equixity-deep/40 focus:ring-2 focus:ring-equixity-deep/20";

  return (
    <div className="mx-auto max-w-prose px-4 py-20 sm:px-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-equixity-deep">
        Contact
      </p>
      <h1 className="mt-3 font-display text-4xl font-medium tracking-tight text-ink sm:text-5xl">
        Talk to us
      </h1>
      <p className="mt-4 text-base leading-relaxed text-slate">
        Questions about rewards, checkout integration, or anything else - send
        a message and we will get back to you.
      </p>

      {status === "sent" ? (
        <div className="mt-10 rounded-2xl border border-equixity-deep/15 bg-equixity-mist/60 p-6">
          <p className="font-display text-lg text-ink">Message sent.</p>
          <p className="mt-1 text-sm text-slate">
            Thanks for reaching out - we will reply to your email shortly.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-ink">
                Name
              </label>
              <input id="name" name="name" required maxLength={120} className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                maxLength={200}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="subject" className="mb-1.5 block text-sm font-medium text-ink">
              Subject
            </label>
            <select id="subject" name="subject" className={inputClass} defaultValue="General">
              <option>General</option>
              <option>Merchant question</option>
              <option>Integration help</option>
              <option>Something else</option>
            </select>
          </div>
          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium text-ink">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              maxLength={4000}
              className="w-full rounded-2xl border border-ink/10 bg-white/70 px-4 py-3 text-sm text-ink outline-none transition focus:border-equixity-deep/40 focus:ring-2 focus:ring-equixity-deep/20"
            />
          </div>
          {status === "error" && (
            <p className="text-sm text-red-600">
              Something went wrong sending your message. Please try again.
            </p>
          )}
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-full bg-equixity-deep px-6 py-3 text-sm font-semibold text-white transition hover:bg-equixity-deepDark disabled:opacity-60 sm:w-auto"
          >
            {status === "sending" ? "Sending..." : "Send message"}
          </button>
        </form>
      )}
    </div>
  );
}