"use client";

import { useCallback, useState } from "react";
import { RewardClaimPanel } from "@/components/RewardClaimPanel";

type RewardClaimExperienceProps = {
  rewardEventId: string;
  merchantName: string;
  assetTicker: string;
  assetLogoUrl: string | null;
  assetAmount: string;
  assetWorth: string | null;
  attestationText: string;
  initiallyDelivered: boolean;
};

export function RewardClaimExperience({
  rewardEventId,
  merchantName,
  assetTicker,
  assetLogoUrl,
  assetAmount,
  assetWorth,
  attestationText,
  initiallyDelivered,
}: RewardClaimExperienceProps) {
  const [delivered, setDelivered] = useState(initiallyDelivered);
  const markDelivered = useCallback(() => setDelivered(true), []);

  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-gradient-to-b from-equixity-mist/60 via-white to-white px-4 py-12">
      <header className="mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/equixity-wordmark-dark.svg"
          alt="Equixity"
          width={132}
          height={28}
          className="h-6 w-auto sm:h-7"
        />
        <h1 className="mt-3 font-display text-3xl font-medium text-ink">
          {delivered
            ? "Congratulations!"
            : `${merchantName} sent you a reward!`}
        </h1>
      </header>

      <section className="mb-6 rounded-2xl border border-ink/5 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-equixity-mist">
            {assetLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={assetLogoUrl}
                alt=""
                width={40}
                height={40}
                loading="eager"
                className="h-10 w-10 rounded-full object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="font-display text-2xl font-medium text-ink">
              {assetAmount} {assetTicker}
            </p>
            <p className="text-sm text-slate">{assetWorth}</p>
          </div>
        </div>
      </section>

      <section>
        <RewardClaimPanel
          rewardEventId={rewardEventId}
          attestationText={attestationText}
          onDelivered={markDelivered}
        />
      </section>
    </main>
  );
}
