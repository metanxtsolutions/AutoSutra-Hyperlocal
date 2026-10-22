import { NextResponse, type NextRequest } from "next/server";

/**
 * Cheap edge check: send visitors without a session cookie to the login page.
 * The real authentication and authorisation happen on the server for every request.
 */
export function middleware(req: NextRequest) {
  if (!req.cookies.get("as_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app/:path*", "/admin/:path*"] };
