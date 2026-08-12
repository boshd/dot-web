type RouteContext = {
  params: Promise<{ appId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { appId } = await params;
  const encodedAppId = encodeURIComponent(appId);

  return Response.json(
    {
      id: `/a/${encodedAppId}`,
      // A manifest request carries neither Firebase auth nor a fragment handoff.
      // Never expose private app metadata through this unauthenticated endpoint.
      name: "Dot app",
      short_name: "Dot app",
      description: "A useful app made by Dot.",
      start_url: `/a/${encodedAppId}`,
      scope: `/a/${encodedAppId}`,
      display: "standalone",
      background_color: "#f5f4ef",
      theme_color: "#e65f45",
      icons: [{ src: "/dot-app-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
