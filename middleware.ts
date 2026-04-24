/**
 * middleware.ts — Next.js Edge Middleware
 *
 * Responsibilities:
 *  1. CORS enforcement — restricts cross-origin access by route type:
 *       /api/admin/*  → same-origin only (rejects external origins)
 *       /api/public/* → open CORS (any origin allowed)
 *       /api/widget/* → open CORS (any origin allowed)
 *       /api/cron/*   → CRON_SECRET bearer required
 *       All others    → permissive for now, can lock down per-route
 *
 *  2. Cron route protection — validates CRON_SECRET on all /api/cron/* routes
 *
 *  3. Origin header in responses — echoes the specific allowed origin back
 *     instead of a wildcard, which is required when credentials are sent.
 */

import { NextRequest, NextResponse } from 'next/server';

// ─── Allowed Origins ─────────────────────────────────────────────────────────
const ALLOWED_ADMIN_ORIGINS: string[] = [
  process.env.NEXT_PUBLIC_BASE_URL ?? '',
  process.env.NEXT_PUBLIC_APP_URL ?? '',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3080',
].filter(Boolean);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (origin.endsWith('aipilots.site')) return true;
  if (origin.endsWith('.vercel.app')) return true;
  return ALLOWED_ADMIN_ORIGINS.includes(origin);
}

// ─── Route Matchers ──────────────────────────────────────────────────────────
function isAdminRoute(pathname: string)  { return pathname.startsWith('/api/admin'); }
function isCronRoute(pathname: string)   { return pathname.startsWith('/api/cron'); }
function isPublicRoute(pathname: string) {
  return pathname.startsWith('/api/public') || pathname.startsWith('/api/widget');
}

// ─── CORS Headers ────────────────────────────────────────────────────────────
function addOpenCors(res: NextResponse): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return res;
}

function addRestrictedCors(res: NextResponse, origin: string): NextResponse {
  res.headers.set('Access-Control-Allow-Origin', origin);
  res.headers.set('Access-Control-Allow-Credentials', 'true');
  res.headers.set('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Version');
  res.headers.set('Vary', 'Origin');
  return res;
}

// ─── Main Middleware ─────────────────────────────────────────────────────────
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin = req.headers.get('origin') ?? '';
  const method = req.method;

  // ── 1. Cron route protection ───────────────────────────────────────────────
  if (isCronRoute(pathname)) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      console.error('[MIDDLEWARE] CRON_SECRET not set — cron routes are unprotected!');
      return new NextResponse('Server misconfiguration', { status: 500 });
    }
    const authHeader = req.headers.get('authorization') ?? '';
    if (authHeader !== `Bearer ${cronSecret}`) {
      return new NextResponse('Unauthorized', { status: 401 });
    }
    return NextResponse.next();
  }

  // ── 2. Public / Widget routes — open CORS ─────────────────────────────────
  if (isPublicRoute(pathname)) {
    if (method === 'OPTIONS') {
      return addOpenCors(new NextResponse(null, { status: 204 }));
    }
    return addOpenCors(NextResponse.next());
  }

  // ── 3. Admin routes — restricted CORS ────────────────────────────────────
  if (isAdminRoute(pathname)) {
    // Handle preflight
    if (method === 'OPTIONS') {
      if (origin && isAllowedOrigin(origin)) {
        return addRestrictedCors(new NextResponse(null, { status: 204 }), origin);
      }
      // Reject preflight from unknown origins
      return new NextResponse('Forbidden', { status: 403 });
    }

    // For actual requests: if origin header is present and NOT in allowlist, reject
    // (no origin = server-side / same-origin request — always allow)
    if (origin && !isAllowedOrigin(origin)) {
      return new NextResponse(
        JSON.stringify({ error: 'Cross-origin request blocked.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const res = NextResponse.next();
    if (origin && isAllowedOrigin(origin)) {
      addRestrictedCors(res, origin);
    }
    return res;
  }

  // ── 4. All other API routes — pass through ────────────────────────────────
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
