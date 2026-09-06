import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/*
 * THE MATCHER IS THE LIST OF PROTECTED PATHS. There is not a second one.
 *
 * There used to be: `config.matcher` decided where the middleware ran, and a
 * separate `isProtected` expression decided whether to redirect. They drifted,
 * as two hand-maintained lists of the same thing always do —
 * `/spirit`, `/admin`, `/flourishing`, `/metrics` and `/templates` were matched
 * and then never protected, so the middleware woke up, checked the session and
 * let the request through regardless. Nothing leaked, because each of those
 * pages returns null without a user, but that is defence by coincidence: the
 * day someone writes a page that forgets the check, the gate is already open.
 *
 * Now: if the middleware runs, a session is required, unless the path is on the
 * short public list below. Adding a route to the matcher protects it, which is
 * the behaviour anyone editing this file will assume.
 */
const PUBLIC_PATHS = new Set(['/login'])

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user && !PUBLIC_PATHS.has(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // So the login form can send you where you were actually going.
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  // Must stay a static literal — Next reads it at build time and cannot
  // evaluate an expression here. Every entry is protected; see the note above.
  matcher: [
    '/dashboard/:path*',
    '/projects/:path*',
    '/tasks/:path*',
    '/calendar/:path*',
    '/goals/:path*',
    '/sops/:path*',
    '/reviews/:path*',
    '/books/:path*',
    '/notes/:path*',
    '/knowledge/:path*',
    '/fitness/:path*',
    '/spirit/:path*',
    '/admin/:path*',
    '/flourishing/:path*',
    '/metrics/:path*',
    '/templates/:path*',
    // Added with the cross-project sync: the brief, its history, and the page
    // that says whether any of it is current.
    '/brief',
    '/briefs/:path*',
    '/sync',
    '/login',
  ],
}
