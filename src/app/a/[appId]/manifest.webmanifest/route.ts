import { FALLBACK_APP_PREVIEW, loadAppLinkPreview } from "@/lib/app-preview";

type RouteContext = {
  params: Promise<{ appId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { appId } = await params;
  const encodedAppId = encodeURIComponent(appId);
  const preview = await loadAppLinkPreview(appId);
  const name =
    preview.title === FALLBACK_APP_PREVIEW.title ? "Dot app" : preview.title;

  return Response.json(
    {
      id: `/a/${encodedAppId}`,
      name,
      short_name: name,
      description: preview.description,
      start_url: `/a/${encodedAppId}`,
      scope: `/a/${encodedAppId}`,
      display: "standalone",
      background_color: "#f6f6f2",
      theme_color: "#151512",
      icons: [
        {
          src: `/a/${encodedAppId}/apple-icon`,
          sizes: "180x180",
          type: "image/png",
          purpose: "any",
        },
      ],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
