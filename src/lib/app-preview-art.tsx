import { ImageResponse } from "next/og";

import { appInitials, loadAppLinkPreview } from "@/lib/app-preview";

export const PREVIEW_INK = "#151512";
export const PREVIEW_PAPER = "#f6f6f2";
export const PREVIEW_MUTED = "#6d6c65";

const PREVIEW_CACHE = {
  "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
};

export function appIconResponse(initials: string) {
  const single = initials.length === 1;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: PREVIEW_PAPER,
          color: PREVIEW_INK,
          fontSize: single ? 84 : 72,
          fontWeight: 500,
          letterSpacing: single ? 0 : -2,
          position: "relative",
        }}
      >
        <div style={{ display: "flex", marginTop: -4 }}>{initials}</div>
        <div
          style={{
            position: "absolute",
            right: 22,
            bottom: 22,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: PREVIEW_INK,
          }}
        />
      </div>
    ),
    {
      width: 180,
      height: 180,
      headers: PREVIEW_CACHE,
    },
  );
}

export function appOpenGraphResponse(preview: {
  title: string;
  description: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PREVIEW_PAPER,
          color: PREVIEW_INK,
          padding: "72px 80px 68px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: PREVIEW_INK,
              marginRight: 12,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 28,
              color: PREVIEW_MUTED,
              letterSpacing: 0.4,
            }}
          >
            Dot
          </div>
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 980,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 64,
              fontWeight: 500,
              lineHeight: 1.12,
              letterSpacing: -1.4,
            }}
          >
            {preview.title}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 20,
              fontSize: 28,
              lineHeight: 1.35,
              color: PREVIEW_MUTED,
            }}
          >
            {preview.description}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: PREVIEW_CACHE,
    },
  );
}

export async function renderAppIcon(appId: string) {
  const preview = await loadAppLinkPreview(appId);
  return appIconResponse(appInitials(preview.title));
}

export async function renderAppOpenGraphImage(appId: string) {
  const preview = await loadAppLinkPreview(appId);
  return appOpenGraphResponse(preview);
}
