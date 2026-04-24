/**
 * lib/onboarding/buildStarterEngineConfig.ts
 *
 * Generates the deterministic starter SEO config for a new client.
 * Can be re-generated from the same inputs — idempotent by design.
 *
 * This config is written to the OnboardingSession and used by:
 *   - seedClientInstallData (Mongo init)
 *   - pushStarterRepoChanges (GitHub)
 */

import { OnboardingSessionDocument } from '@/models/onboarding/OnboardingSession';

export interface StarterEngineConfig {
  tenantId:    string;
  clientId:    string;
  siteUrl:     string;
  brandName:   string;
  niche:       string;
  targetGeo:   string;
  city:        string;
  state:       string;
  siteType:    string;
  publishMode: string;

  sitemapStrategy: {
    buckets: string[];
  };

  starterPages:  string[]; // slugs
  starterTopics: string[]; // blog seed questions

  gscPropertyUrl:   string;
  githubOwner:      string;
  githubRepo:       string;
  repoBranch:       string;

  generatedAt: string;
}

// Industry-specific page templates
const NICHE_STARTERS: Record<string, { pages: string[]; topics: string[] }> = {
  roofing: {
    pages:  ['roof-repair', 'roof-replacement', 'emergency-roofing', 'roof-inspection', 'commercial-roofing'],
    topics: [
      'how much does roof repair cost',
      'signs you need a roof replacement',
      'how to find a reliable roofer',
    ],
  },
  realestate: {
    pages:  ['homes-for-sale', 'luxury-homes', 'first-time-buyer-guide', 'neighborhood-guide', 'investment-property'],
    topics: [
      'how to buy a home in {city}',
      'best neighborhoods in {city}',
      'real estate market trends {city}',
    ],
  },
  hvac: {
    pages:  ['ac-repair', 'emergency-hvac', 'ac-installation', 'heat-pump-installation', 'hvac-maintenance'],
    topics: [
      'how much does AC repair cost',
      'signs your AC needs repair',
      'best HVAC maintenance tips',
    ],
  },
  dentist: {
    pages:  ['dentist-near-me', 'teeth-whitening', 'dental-implants', 'emergency-dentist', 'invisalign'],
    topics: [
      'how to find a good dentist',
      'teeth whitening cost and options',
      'dental implants vs dentures',
    ],
  },
  church: {
    pages:  ['church-near-me', 'sunday-services', 'youth-ministry', 'small-groups', 'community-outreach'],
    topics: [
      'how to find a church near me',
      'what to expect at your first visit',
      'small group benefits for new members',
    ],
  },
  legal: {
    pages:  ['personal-injury-lawyer', 'car-accident-attorney', 'free-consultation', 'case-results', 'practice-areas'],
    topics: [
      'what to do after a car accident',
      'how to choose a personal injury lawyer',
      'how long does a personal injury case take',
    ],
  },
  plumbing: {
    pages:  ['emergency-plumber', 'drain-cleaning', 'water-heater-installation', 'pipe-repair', 'commercial-plumbing'],
    topics: [
      'signs you have a plumbing emergency',
      'how much does drain cleaning cost',
      'water heater replacement cost guide',
    ],
  },
};

function slugify(city: string, page: string): string {
  const citySlug = city.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return citySlug ? `${page}-${citySlug}` : page;
}

function interpolate(s: string, city: string): string {
  return s.replace('{city}', city);
}

export function buildStarterEngineConfig(
  session: any,
  domain: any,
  gsc: any,
): StarterEngineConfig {
  const niche   = (session.business?.niche   ?? '').toLowerCase();
  const city    = session.business?.city    ?? '';
  const state   = session.business?.state   ?? '';
  const brand   = session.business?.name    ?? 'My Business';
  const rawDomain = domain?.normalizedDomain ?? session.business?.domain ?? '';
  const siteUrl = domain?.urlPrefix          ?? `https://${rawDomain}/`;

  const template = NICHE_STARTERS[niche] ?? NICHE_STARTERS['roofing'];

  // Localize page slugs to city if city is present
  const starterPages = template.pages.map(p =>
    city ? slugify(city, p) : p
  );

  // Interpolate city into topic strings
  const starterTopics = template.topics.map(t => interpolate(t, city || 'your city'));

  return {
    tenantId:    session.tenantId,
    clientId:    session.clientId,
    siteUrl,
    brandName:   brand,
    niche:       niche || 'local_business',
    targetGeo:   city && state ? `${city}, ${state}` : city || state || '',
    city,
    state,
    siteType:    session.engineConfig?.siteType    ?? 'local_business',
    publishMode: session.engineConfig?.publishMode ?? 'assisted',

    sitemapStrategy: {
      buckets: ['services', 'locations', 'blog', 'authority'],
    },

    starterPages:    session.engineConfig?.defaultServicePages?.length
      ? session.engineConfig.defaultServicePages
      : starterPages,

    starterTopics:   session.engineConfig?.defaultBlogTopics?.length
      ? session.engineConfig.defaultBlogTopics
      : starterTopics,

    gscPropertyUrl: gsc?.propertyUrl   ?? '',
    githubOwner:    domain?.hosting?.repoOwner ?? '',
    githubRepo:     domain?.hosting?.repoName  ?? '',
    repoBranch:     domain?.hosting?.repoBranch ?? 'main',

    generatedAt: new Date().toISOString(),
  };
}
