export type AppLinkPreview = {
  title: string;
  description: string;
};

export const FALLBACK_APP_PREVIEW: AppLinkPreview = {
  title: "Dot app",
  description: "A useful app made by Dot.",
};

const PAPER_ORIGIN = "https://app.textdot.co";

const SKIP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "from",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function appInitials(title: string): string {
  const words = title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .filter((word) => !SKIP_WORDS.has(word.toLowerCase()));
  if (words.length === 0) return "D";
  const first = [...words[0]][0];
  if (!first) return "D";
  if (words.length === 1) return first.toUpperCase();
  const second = [...words[1]][0];
  if (!second) return first.toUpperCase();
  return `${first}${second}`.toUpperCase();
}

export function buildAppPageMetadata(appId: string, preview: AppLinkPreview) {
  const encodedId = encodeURIComponent(appId);
  return {
    metadataBase: new URL(PAPER_ORIGIN),
    title:
      preview.title === FALLBACK_APP_PREVIEW.title
        ? preview.title
        : `${preview.title} · Dot`,
    description: preview.description,
    manifest: `/a/${encodedId}/manifest.webmanifest`,
    robots: { index: false, follow: false },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default" as const,
      title: preview.title,
    },
    openGraph: {
      type: "website" as const,
      siteName: "Dot",
      title: preview.title,
      description: preview.description,
    },
    twitter: {
      card: "summary_large_image" as const,
      title: preview.title,
      description: preview.description,
    },
  };
}

const INTERNAL_API_URL =
  process.env.BENJI_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

export async function loadAppLinkPreview(appId: string): Promise<AppLinkPreview> {
  try {
    const response = await fetch(
      `${INTERNAL_API_URL}/api/v1/apps/v2/${encodeURIComponent(appId)}`,
      { cache: "no-store" },
    );
    if (!response.ok) return FALLBACK_APP_PREVIEW;
    const payload = (await response.json()) as {
      app?: { title?: unknown; description?: unknown };
    };
    const title =
      typeof payload.app?.title === "string" ? payload.app.title.trim() : "";
    const description =
      typeof payload.app?.description === "string"
        ? payload.app.description.trim()
        : "";
    if (!title) return FALLBACK_APP_PREVIEW;
    return {
      title,
      description: description || FALLBACK_APP_PREVIEW.description,
    };
  } catch {
    return FALLBACK_APP_PREVIEW;
  }
}
