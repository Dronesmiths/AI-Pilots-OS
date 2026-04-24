/**
 * lib/voice/parseMissionCommand.ts
 *
 * Detects when a voice transcript is asking Nova to create a mission
 * (multi-step campaign) rather than a single delegation or intent.
 *
 * Returns isMission=true only for clear multi-step goal phrases.
 * Ambiguous phrases fall through to the delegation or standard intent flow.
 *
 * Supported patterns:
 *   "grow Palmdale traffic 30%"       → seo_growth
 *   "start a content campaign for X"  → content_expansion
 *   "launch outreach mission in X"    → outreach
 *   "recover traffic for X"           → recovery
 *   "create a mission to [goal]"      → custom
 */

export interface ParsedMissionCommand {
  isMission:      boolean;
  title:          string;
  goal:           string;
  objectiveType:  'seo_growth' | 'outreach' | 'content_expansion' | 'recovery' | 'custom';
  targetMetric?:  string;
  targetValue?:   number;
  scope?:         string;
}

const LOCATION_PATTERN = /\b(palmdale|los angeles|la|california|san diego|fresno|bakersfield|lancaster|riverside|orange county|ventura)\b/i;
const PERCENT_PATTERN  = /(\d+)\s*%/;

export function parseMissionCommand(text: string): ParsedMissionCommand {
  const t = text.toLowerCase();

  const locationMatch = text.match(LOCATION_PATTERN);
  const scope         = locationMatch?.[0]
    ? locationMatch[0].charAt(0).toUpperCase() + locationMatch[0].slice(1).toLowerCase()
    : undefined;

  const percentMatch = t.match(PERCENT_PATTERN);
  const targetValue  = percentMatch ? Number(percentMatch[1]) : undefined;

  // ── SEO growth mission ────────────────────────────────────────────────────
  if (/\b(grow|increase|boost)\b/.test(t) && /\b(traffic|seo|rankings?|search)\b/.test(t)) {
    return {
      isMission:      true,
      title:          `SEO growth mission${scope ? ` — ${scope}` : ''}`,
      goal:           text,
      objectiveType:  'seo_growth',
      targetMetric:   'traffic_growth',
      targetValue,
      scope,
    };
  }

  // ── Outreach mission ──────────────────────────────────────────────────────
  if (/\b(outreach|canvass|prospect|contact)\b/.test(t) && /\b(mission|campaign|launch|start)\b/.test(t)) {
    return {
      isMission:     true,
      title:         `Outreach mission${scope ? ` — ${scope}` : ''}`,
      goal:          text,
      objectiveType: 'outreach',
      scope,
    };
  }

  // ── Content expansion mission ─────────────────────────────────────────────
  if (/\b(content|article|blog)\b/.test(t) && /\b(campaign|expand|push|mission)\b/.test(t)) {
    return {
      isMission:     true,
      title:         `Content expansion mission${scope ? ` — ${scope}` : ''}`,
      goal:          text,
      objectiveType: 'content_expansion',
      scope,
    };
  }

  // ── Recovery mission ──────────────────────────────────────────────────────
  if (/\b(recover|fix|restore|repair)\b/.test(t) && /\b(traffic|rankings?|site|performance)\b/.test(t)) {
    return {
      isMission:     true,
      title:         `Recovery mission${scope ? ` — ${scope}` : ''}`,
      goal:          text,
      objectiveType: 'recovery',
      scope,
    };
  }

  // ── Explicit mission creation ─────────────────────────────────────────────
  if (/\b(create|start|launch|begin)\s+(a\s+)?mission\b/.test(t)) {
    return {
      isMission:     true,
      title:         'Custom mission',
      goal:          text,
      objectiveType: 'custom',
      scope,
    };
  }

  // Not a mission command — fall through to delegation or standard intent
  return { isMission: false, title: '', goal: text, objectiveType: 'custom' };
}
