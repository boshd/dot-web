import type { Metadata } from "next";

import { BenjiAuthProvider } from "@/components/benji-auth-provider";
import { GeneratedAppV2Runtime } from "@/components/generated-app-v2-runtime";

type AppPageProps = {
  params: Promise<{ appId: string }>;
};

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const { appId } = await params;
  return {
    // Access is established in the browser with auth or a fragment handoff. Keep
    // server-rendered metadata generic so private app details never leak pre-auth.
    title: "Dot app",
    description: "A useful app made by Dot.",
    manifest: `/a/${encodeURIComponent(appId)}/manifest.webmanifest`,
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Dot app",
    },
  };
}

export default async function GeneratedAppV2Page({ params }: AppPageProps) {
  const { appId } = await params;
  return (
    <BenjiAuthProvider>
      <GeneratedAppV2Runtime appId={appId} />
    </BenjiAuthProvider>
  );
}
