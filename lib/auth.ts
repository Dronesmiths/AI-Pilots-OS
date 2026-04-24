/**
 * lib/auth.ts — Shared Admin Authentication Guard
 *
 * Centralizes JWT verification for all admin routes.
 * Replaces the `process.env.JWT_SECRET || 'fallback-secret-for-local-dev'`
 * pattern across 198+ route files.
 *
 * Usage:
 *   import { verifyAdminToken } from '@/lib/auth';
 *   const decoded = verifyAdminToken(token); // throws 401-safe error on failure
 */

import jwt from 'jsonwebtoken';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// ─── Fail loudly at module load time if the secret is missing ────────────────
// This surfaces misconfiguration immediately during startup rather than silently
// signing tokens with a known fallback key in production.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      '[AUTH] JWT_SECRET environment variable is not set. ' +
      'Add it to .env.local (dev) or Vercel environment variables (prod).'
    );
  }
  return secret;
}

/** Decoded admin token payload */
export interface AdminTokenPayload {
  role: string;
  email?: string;
  [key: string]: unknown;
}

/**
 * Verifies a raw JWT string against the environment secret.
 * @throws Error with a user-safe message if the token is invalid or expired.
 */
export function verifyAdminToken(token: string): AdminTokenPayload {
  const secret = getJwtSecret();
  const decoded = jwt.verify(token, secret) as AdminTokenPayload;
  return decoded;
}

/**
 * Full guard for use at the top of any admin API route.
 *
 * Reads `admin_token` from cookies, verifies it, and checks for the
 * required role. Returns `null` on success (caller continues), or a
 * 401 NextResponse that should be returned immediately.
 *
 * @example
 *   const authError = await requireAdminAuth(req, 'superadmin');
 *   if (authError) return authError;
 */
export async function requireAdminAuth(
  requiredRole: string = 'superadmin'
): Promise<NextResponse | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const decoded = verifyAdminToken(token);

    if (decoded.role !== requiredRole) {
      return NextResponse.json(
        { error: 'Insufficient privileges.' },
        { status: 401 }
      );
    }

    return null; // Auth passed
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Invalid or expired session.' },
      { status: 401 }
    );
  }
}

/**
 * Convenience: reads token from cookies and returns the decoded payload,
 * or null if auth fails. Use when you need the token data, not just a guard.
 */
export async function getAdminSession(): Promise<AdminTokenPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return null;
    return verifyAdminToken(token);
  } catch {
    return null;
  }
}
