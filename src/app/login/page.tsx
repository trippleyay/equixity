"use client";

import { Suspense } from "react";
import { LoginForm } from "@/components/LoginForm";

/**
 * /login — a thin client page. The form lives in LoginForm and is wrapped in a
 * Suspense boundary because it uses useSearchParams() (a CSR-bailout hook that
 * Next.js requires inside a suspense boundary during prerender).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
