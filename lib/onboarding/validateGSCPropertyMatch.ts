/**
 * lib/onboarding/validateGSCPropertyMatch.ts
 *
 * Checks whether a GSC property URL matches a connected domain.
 *
 * Valid matches:
 *   domain: example.com
 *   GSC property: sc-domain:example.com         → domain_property
 *   GSC property: https://www.example.com/      → url_prefix
 *   GSC property: https://example.com/          → url_prefix_no_www
 */

export interface GSCMatchResult {
  valid:     boolean;
  matchType: string;
  warnings:  string[];
}

export function validateGSCPropertyMatch(
  propertyUrl:      string,
  normalizedDomain: string,
  urlPrefix:        string,
): GSCMatchResult {
  const warnings: string[] = [];

  if (!propertyUrl || !normalizedDomain) {
    return { valid: false, matchType: 'no_match', warnings: ['Missing property URL or domain'] };
  }

  const prop = propertyUrl.toLowerCase().trim();
  const dom  = normalizedDomain.toLowerCase().trim();

  // sc-domain:example.com
  if (prop === `sc-domain:${dom}`) {
    return { valid: true, matchType: 'domain_property', warnings: [] };
  }

  // https://www.example.com/
  if (prop === `https://www.${dom}/` || prop === `https://www.${dom}`) {
    return { valid: true, matchType: 'url_prefix_www', warnings: [] };
  }

  // https://example.com/
  if (prop === `https://${dom}/` || prop === `https://${dom}`) {
    return { valid: true, matchType: 'url_prefix_no_www', warnings: [] };
  }

  // http variants (warn but allow)
  if (prop === `http://www.${dom}/` || prop === `http://${dom}/`) {
    warnings.push('GSC property uses HTTP — consider migrating to HTTPS property');
    return { valid: true, matchType: 'url_prefix_http', warnings };
  }

  // Subdomain properties (e.g. blog.example.com) — partial match
  if (prop.includes(dom)) {
    warnings.push(`GSC property "${propertyUrl}" appears to be a subdomain of "${dom}". Ensure this is the correct property.`);
    return { valid: true, matchType: 'subdomain_partial', warnings };
  }

  // No match
  return {
    valid:     false,
    matchType: 'no_match',
    warnings:  [`GSC property "${propertyUrl}" does not match domain "${normalizedDomain}". Select a property that contains your domain.`],
  };
}
