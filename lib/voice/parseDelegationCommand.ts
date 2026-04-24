/**
 * lib/voice/parseDelegationCommand.ts
 *
 * Extracts a structured delegation command from a voice transcript.
 * Used to detect when a spoken instruction should route to the agent
 * dispatch engine rather than the standard approve/reject flow.
 *
 * Returns action='dispatch' when the transcript clearly calls for
 * sending agents or running an autonomous task. Returns action='unknown'
 * if no dispatch signal is found — the caller should fall through to
 * the standard intent handler in that case.
 *
 * Location extraction uses a simple regex — covers major US cities/regions
 * found in common outreach use cases. Extend the pattern as needed.
 */

export type DelegationAction = 'dispatch' | 'unknown';

export interface ParsedDelegationCommand {
  action:        DelegationAction;
  targetType:    'outreach' | 'seo' | 'content' | 'analysis' | 'governance' | 'general';
  location?:     string;
  intentSummary: string;
  confidence:    number;
}

// Patterns that indicate a dispatch command
const DISPATCH_PATTERN = /\b(send|run|deploy|launch|dispatch|fire|start|trigger)\b/;

// Target type signals
const TARGET_PATTERNS: Array<[ParsedDelegationCommand['targetType'], RegExp]> = [
  ['outreach',   /\b(outreach|drone|canvass|contact|prospect|cluster|territory)\b/],
  ['seo',        /\b(seo|search|content drone|sitemap|keyword|rankinge?)\b/],
  ['content',    /\b(content|article|blog|copy|publish|write)\b/],
  ['analysis',   /\b(analyz|report|insight|review|audit|assess)\b/],
  ['governance', /\b(govern|enforce|compliance|policy|rule)\b/],
];

// Location extraction — extend as needed
const LOCATION_PATTERN = /\b(palmdale|los angeles|la|california|san diego|fresno|bakersfield|riverside|orange county|ventura)\b/i;

export function parseDelegationCommand(text: string): ParsedDelegationCommand {
  const t = text.toLowerCase();

  const isDispatch = DISPATCH_PATTERN.test(t);

  if (!isDispatch) {
    return { action: 'unknown', targetType: 'general', intentSummary: text, confidence: 0 };
  }

  let targetType: ParsedDelegationCommand['targetType'] = 'general';
  for (const [type, pattern] of TARGET_PATTERNS) {
    if (pattern.test(t)) { targetType = type; break; }
  }

  const locationMatch = text.match(LOCATION_PATTERN);
  const location      = locationMatch?.[0]
    ? locationMatch[0].charAt(0).toUpperCase() + locationMatch[0].slice(1).toLowerCase()
    : undefined;

  return {
    action:        'dispatch',
    targetType,
    location,
    intentSummary: text,
    confidence:    targetType !== 'general' ? 0.85 : 0.65,
  };
}
