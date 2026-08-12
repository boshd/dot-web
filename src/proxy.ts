import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APP_HOST = "app.textdot.co";
const LANDING_HOST = "textdot.co";
const PRODUCT_QUERY_KEYS = new Set([
  "auth",
  "connect",
  "connect_token",
  "conversation",
  "group_invite",
  "tab",
]);

function hasProductQuery(request: NextRequest) {
  return [...request.nextUrl.searchParams.keys()].some((key) => PRODUCT_QUERY_KEYS.has(key));
}

export function proxy(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = forwardedHost ?? request.headers.get("host");
  const hostname = (hostHeader?.split(",")[0]?.trim().split(":")[0] || request.nextUrl.hostname).toLowerCase();
  const { pathname } = request.nextUrl;

  if (hostname === `www.${LANDING_HOST}`) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.hostname = LANDING_HOST;
    canonicalUrl.protocol = "https";
    canonicalUrl.port = "";
    return NextResponse.redirect(canonicalUrl, 308);
  }

  if (hostname !== LANDING_HOST) return NextResponse.next();

  if (
    pathname.startsWith("/a/") ||
    pathname.startsWith("/apps/") ||
    pathname.startsWith("/connect/") ||
    (pathname === "/" && hasProductQuery(request))
  ) {
    const appUrl = request.nextUrl.clone();
    appUrl.hostname = APP_HOST;
    appUrl.protocol = "https";
    appUrl.port = "";
    return NextResponse.redirect(appUrl, 307);
  }

  if (pathname === "/") {
    const landingUrl = request.nextUrl.clone();
    landingUrl.pathname = "/landing";
    return NextResponse.rewrite(landingUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/a/:path*", "/apps/:path*", "/connect/:path*"],
};
