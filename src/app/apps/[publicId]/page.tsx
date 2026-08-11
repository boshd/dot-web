import type { Metadata } from "next";

import { GeneratedAppSurface } from "@/components/generated-app-surface";
import type { GeneratedAppDetail } from "@/lib/api";

type AppPageProps = {
  params: Promise<{ publicId: string }>;
};

const INTERNAL_API_URL =
  process.env.BENJI_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

async function appMetadata(publicId: string): Promise<GeneratedAppDetail | null> {
  try {
    const response = await fetch(
      `${INTERNAL_API_URL}/api/v1/apps/public/${encodeURIComponent(publicId)}`,
      { cache: "no-store" },
    );
    return response.ok ? ((await response.json()) as GeneratedAppDetail) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: AppPageProps): Promise<Metadata> {
  const { publicId } = await params;
  const app = await appMetadata(publicId);
  return {
    title: app ? `${app.title} · Dot` : "Dot app",
    description: app?.description || "A personal app made by Dot.",
    manifest: `/apps/${publicId}/manifest.webmanifest`,
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: app?.title ?? "Dot app",
    },
  };
}

export default async function GeneratedAppPage({ params }: AppPageProps) {
  const { publicId } = await params;
  const app = await appMetadata(publicId);
  return <GeneratedAppSurface publicId={publicId} initialApp={app} />;
}
