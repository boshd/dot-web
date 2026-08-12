import type { GeneratedAppDetail } from "@/lib/api";

type RouteContext = {
  params: Promise<{ publicId: string }>;
};

const INTERNAL_API_URL =
  process.env.BENJI_INTERNAL_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8000";

const themeColors = {
  coral: "#df654f",
  sage: "#63846d",
  ocean: "#397a91",
  plum: "#7d5a82",
  gold: "#a87827",
  dot: "#df654f",
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { publicId } = await params;
  let app: GeneratedAppDetail | null = null;
  try {
    const response = await fetch(
      `${INTERNAL_API_URL}/api/v1/apps/public/${encodeURIComponent(publicId)}`,
      { cache: "no-store" },
    );
    if (response.ok) app = (await response.json()) as GeneratedAppDetail;
  } catch {
    app = null;
  }

  const name = app?.title ?? "Dot app";
  return Response.json(
    {
      id: `/apps/${publicId}`,
      name,
      short_name: name.slice(0, 24),
      description: app?.description || "A personal app made by Dot.",
      start_url: `/apps/${publicId}`,
      scope: `/apps/${publicId}`,
      display: "standalone",
      background_color: "#f5f0e8",
      theme_color: app ? themeColors[app.theme] : "#df654f",
      icons: [
        {
          src: "/dot-app-icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable",
        },
      ],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
