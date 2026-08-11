import type { Metadata } from "next";

import { PlaidConnectSurface } from "@/components/plaid-connect-surface";

export const metadata: Metadata = {
  title: "Connect your bank · Dot",
  description: "Securely connect a bank account to Dot through Plaid.",
  robots: { index: false, follow: false },
};

export default function PlaidConnectPage() {
  return <PlaidConnectSurface />;
}
