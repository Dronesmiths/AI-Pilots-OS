/**
 * lib/onboarding/steps/createTenant.ts
 *
 * Step 1: Create or return the Tenant record.
 *
 * tenantId is a human-readable slug derived from name or domain:
 *   "Urban Design Remodel" → "urban-design-remodel"
 *   "urbandesignremodel.com" → "urbandesignremodel-com"
 *
 * Idempotent: returns existing tenant if domain or slug already exists.
 */
import connectToDatabase    from '@/lib/mongodb';
import Tenant               from '@/models/Tenant';
import type { ActivateTenantInput } from '../types';

function slugifyTenantId(input: string): string {
  return input
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export async function createTenant(input: ActivateTenantInput) {
  await connectToDatabase();

  const tenantId = slugifyTenantId(input.name || input.domain);

  const existing = await Tenant.findOne({
    $or: [{ tenantId }, { domain: input.domain }],
  });

  if (existing) return existing;

  return Tenant.create({
    tenantId,
    name:       input.name || tenantId,
    domain:     input.domain,
    repoUrl:    input.repoUrl,
    gscSiteUrl: input.gscSiteUrl || '',
    status:     'active',
  });
}
