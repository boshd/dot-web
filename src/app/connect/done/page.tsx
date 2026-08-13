import type { Metadata } from "next";
import { Suspense } from "react";

import { ConnectDoneSurface } from "@/components/connect-done-surface";

export const metadata: Metadata = {
  title: "Connected · Dot",
  description: "Finish connecting an account to Dot.",
  robots: { index: false, follow: false },
};

export default function ConnectDonePage() {
  return (
    <Suspense>
      <ConnectDoneSurface />
    </Suspense>
  );
}
