import CallRecord from '@/models/CallRecord';

export type VoiceMetrics = {
  total:      number;
  pricing:    number;
  followups:  number;
  missed:     number;
  booked:     number;
  highIntent: number;
  objections: number;
  topKeywords: Array<{ word: string; count: number }>;
};

export type VoiceAnalysis = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  calls:   any[];
  metrics: VoiceMetrics;
};

const STOPWORDS = new Set([
  'the','and','for','that','this','with','have','from',
  'they','will','what','your','about','been','when',
  'just','call','like','there','their','were','also',
]);

/**
 * analyzeVoicePatterns (v2 — signal-aware)
 * ─────────────────────────────────────────
 * Uses stored `signals` from CallRecord instead of re-parsing
 * transcripts. Looks at the last 24 hours for real-time intelligence.
 */
export async function analyzeVoicePatterns(tenantId: string): Promise<VoiceAnalysis> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const calls = await CallRecord.find({
    tenantId,
    createdAt: { $gte: since },
  }).lean();

  const metrics: VoiceMetrics = {
    total:      calls.length,
    pricing:    0,
    followups:  0,
    missed:     0,
    booked:     0,
    highIntent: 0,
    objections: 0,
    topKeywords: [],
  };

  const wordFreq: Record<string, number> = {};

  for (const call of calls) {
    // ── Outcome buckets ─────────────────────────────────────
    if (call.outcome === 'followup_needed')  metrics.followups++;
    if (call.outcome === 'missed_lead')      metrics.missed++;
    if (call.outcome === 'booked')           metrics.booked++;

    // ── Structured signals (fast DB fields) ─────────────────
    if (call.signals?.hasPricingIntent)  metrics.pricing++;
    if (call.signals?.hasHighIntent)     metrics.highIntent++;
    if (call.signals?.hasFollowupIntent) metrics.followups++;  // overlap OK
    if (call.signals?.hasObjection)      metrics.objections++;

    // ── Keyword frequency ───────────────────────────────────
    const t = (call.transcript || '').toLowerCase();
    const words = t
      .replace(/[^a-z\s]/g, '')
      .split(/\s+/)
      .slice(0, 80)
      .filter((w: string) => w.length > 4 && !STOPWORDS.has(w));

    for (const w of words) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
  }

  metrics.topKeywords = Object.entries(wordFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return { calls, metrics };
}
