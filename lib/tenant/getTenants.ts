/**
 * lib/tenant/getTenants.ts
 *
 * Returns all active tenants, newest first.
 * Used by /api/tenants and the fleet overview UI.
 */
import connectToDatabase from '@/lib/mongodb';
import Tenant            from '@/models/Tenant';

export async function getTenants() {
  await connectToDatabase();
  return Tenant.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .lean();
}
