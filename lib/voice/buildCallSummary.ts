/**
 * Builds a lightweight summary string for the NovaMemory entry.
 * The first 400 chars of the transcript give the AI enough context without
 * blowing up the memory collection with raw walls of text.
 */
export function buildCallSummary(transcript: string, outcome: string): string {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();

  if (!cleaned) {
    return `Call recorded with outcome: ${outcome}. No transcript available.`;
  }

  const preview = cleaned.length > 400 ? cleaned.slice(0, 400) + '…' : cleaned;
  return `Outcome: ${outcome}. Transcript excerpt: "${preview}"`;
}
