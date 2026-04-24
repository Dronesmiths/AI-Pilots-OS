/**
 * app/api/tenants/route.ts
 *
 * GET /api/tenants
 * Returns all active tenants for the fleet switcher + overview grid.
 */
import { NextResponse }  from 'next/server';
import { cookies }       from 'next/headers';
import { getTenants }    from '@/lib/tenant/getTenants';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cs      = await cookies();
  const session = cs.get('admin_session')?.value ?? cs.get('session')?.value;
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const tenants = await getTenants();
    return NextResponse.json(tenants);
  } catch (e: any) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load tenants' },
      { status: 500 }
    );
  }
}
