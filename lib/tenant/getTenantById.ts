/**
 * lib/tenant/getTenantById.ts
 *
 * Look up a Tenant by its slug tenantId.
 * Used by dashboard routes that receive tenantId from query params.
 */
import connectToDatabase from '@/lib/mongodb';
import Tenant            from '@/models/Tenant';

export async function getTenantById(tenantId: string) {
  await connectToDatabase();
  return Tenant.findOne({ tenantId }).lean();
}
