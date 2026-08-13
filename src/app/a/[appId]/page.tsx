import type { Metadata } from "next";

import { BenjiAuthProvider } from "@/components/benji-auth-provider";
import { GeneratedAppV2Runtime } from "@/components/generated-app-v2-runtime";
import { buildAppPageMetadata, loadAppLinkPreview } from "@/lib/app-preview";

type AppPageProps = {
  params: Promise<{ appId: string }>;
};

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const { appId } = await params;
  const preview = await loadAppLinkPreview(appId);
  return buildAppPageMetadata(appId, preview);
}

export default async function GeneratedAppV2Page({ params }: AppPageProps) {
  const { appId } = await params;
  return (
    <BenjiAuthProvider>
      <GeneratedAppV2Runtime appId={appId} />
    </BenjiAuthProvider>
  );
}
