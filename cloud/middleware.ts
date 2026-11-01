import { NextResponse, type NextRequest } from 'next/server';
/* Cheap gate: no cookie, no app. Real validation happens in requireSession() on the server. */
export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/app') && !req.cookies.get('cf_session')) {
    const url = req.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/app/:path*'] };
