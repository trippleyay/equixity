"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  PrivyProvider,
  useLogin,
  usePrivy,
} from "@privy-io/react-auth";
import { buttonClassName } from "@/components/site/Button";

/**
 * "My Rewards" — how a CUSTOMER gets back to what they have earned.
 *
 * The reward page is a one-time hand-over: it delivers the stock and stops.
 * Without an entry point on the marketing site, a customer who earned something
 * last week has no way back to it, which is not a finished product. This is that
 * entry point, in the hero and in the footer.
 *
 * THREE THINGS IT MUST NEVER DO, all of them bugs that were already observed on
 * the reward page and are deliberately not repeated here:
 *
 *   1. IT MUST NEVER BE A DEAD BUTTON. The reward page's version read
 *      `if (!ready) return;`, so a click while Privy was still initialising did
 *      nothing at all: no modal, no message, no console output, indistinguishable
 *      from a broken page. Here, a click that arrives before Privy is ready
 *      simply navigates to /wallet, which renders its own sign-in card. The
 *      button always moves the customer forward.
 *
 *   2. IT MUST NOT RELY ON A SESSION CALLBACK ALONE. Privy PERSISTS sessions, so
 *      `login()` on an already-signed-in visitor refuses to reopen the modal and
 *      only logs a warning. That is handled by checking `authenticated` first.
 *
 *   3. IT MUST NOT PUT PRIVY ON EVERY PAGE. The provider is mounted here, around
 *      the button only, so the marketing pages do not carry the SDK for visitors
 *      who never sign in. Only the hero and the footer mount it, and only when
 *      an app id is actually configured — otherwise it degrades to a plain link
 *      to /wallet rather than rendering a button that cannot work.
 *
 * The wallet itself is NOT created here. Privy creates the embedded Solana wallet
 * on login (`createOnLogin: "users-without-wallets"`), which is the same config
 * the reward page uses, so the email a customer signs in with resolves to the
 * same wallet every time and a second reward never makes a second wallet.
 */
function CustomerRewardsButtonInner({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  const { login } = useLogin({
    // Fires for both newly and already authenticated users (Privy's own docs on
    // the installed types). The destination is the same either way.
    onComplete: () => router.push("/wallet"),
  });

  const go = useCallback(() => {
    if (authenticated || !ready) {
      // Signed in already, or Privy has not finished initialising: /wallet
      // handles both, and shows its own sign-in card in the second case.
      router.push("/wallet");
      return;
    }
    login();
  }, [authenticated, ready, login, router]);

  return (
    <button type="button" onClick={go} className={className}>
      {label}
    </button>
  );
}

export default function CustomerRewardsButton({
  label = "My Rewards",
  variant = "outlineOnDark",
  className = "",
}: {
  label?: string;
  /** Outline by default: it sits beside a filled call to action, not against it. */
  variant?: "solid" | "onDark" | "outlineOnDark" | "text" | "footerLink";
  className?: string;
}) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";
  const classes = buttonClassName(variant, className);

  if (!privyAppId) {
    return (
      <a href="/wallet" className={classes}>
        {label}
      </a>
    );
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
      }}
    >
      <CustomerRewardsButtonInner label={label} className={classes} />
    </PrivyProvider>
  );
}
