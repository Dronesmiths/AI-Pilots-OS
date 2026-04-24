/**
 * lib/onboarding/normalizeDomain.ts
 *
 * Takes any domain input and produces a canonical output object
 * ready for ConnectedDomain and GSC property matching.
 *
 * Input examples:
 *   "https://www.example.com/"
 *   "example.com"
 *   "www.example.com"
 *   "http://example.com/path"
 *
 * Output:
 *   { rawInput, normalizedDomain, host, urlPrefix, domainProperty }
 */

export interface NormalizedDomain {
  rawInput:         string;
  normalizedDomain: string; // example.com
  host:             string; // www.example.com  (preserves www if present)
  urlPrefix:        string; // https://www.example.com/
  domainProperty:   string; // sc-domain:example.com (for GSC domain properties)
  isValid:          boolean;
  error:            string;
}

export function normalizeDomain(rawInput: string): NormalizedDomain {
  const raw = (rawInput ?? '').trim();
  const base: NormalizedDomain = {
    rawInput:         raw,
    normalizedDomain: '',
    host:             '',
    urlPrefix:        '',
    domainProperty:   '',
    isValid:          false,
    error:            '',
  };

  if (!raw) {
    return { ...base, error: 'Domain input is empty' };
  }

  try {
    // Ensure there's a protocol so URL() can parse it
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProto);

    // hostname = www.example.com | example.com
    const host = parsed.hostname.toLowerCase();

    // normalizedDomain strips www. prefix
    const normalizedDomain = host.replace(/^www\./, '');

    if (!normalizedDomain || !normalizedDomain.includes('.')) {
      return { ...base, error: `Invalid domain: "${raw}" has no TLD` };
    }

    // For urlPrefix we prefer https + original host
    const urlPrefix = `https://${host}/`;

    // sc-domain property = just the apex domain
    const domainProperty = `sc-domain:${normalizedDomain}`;

    return {
      rawInput:         raw,
      normalizedDomain,
      host,
      urlPrefix,
      domainProperty,
      isValid:          true,
      error:            '',
    };
  } catch {
    return { ...base, error: `Could not parse "${raw}" as a valid domain` };
  }
}
