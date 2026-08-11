export function GET() {
  return Response.json(
    { status: "ok", service: "dot-web" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
