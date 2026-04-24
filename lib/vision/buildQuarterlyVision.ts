import mongoose           from 'mongoose';
import connectToDatabase  from '@/lib/mongodb';

export type MarketPosition =
  | 'early_presence'       // < 10 pages, < 3 clusters
  | 'emerging_authority'   // 10–40 pages, active build
  | 'niche_domination';    // 40+ pages, strong cluster depth

export type LockedDirection =
  | 'expand_clusters'   // go deeper in same space
  | 'broaden_reach'     // add new topic categories
  | 'deepen_niche';     // dominate one vertical completely

export type QuarterlySnapshot = {
  totalPages:    number;
  clusterCount:  number;
  actionsTotal:  number;
  dominantTopic: string | null;
  position:      MarketPosition;
};

export type VisionOutput = {
  snapshot:        QuarterlySnapshot;
  position:        MarketPosition;
  clientVoice:     string;    // inspirational, non-technical
  agentVoice:      string;    // strategic, with decision options
  emailClientHtml: string;
  emailAgentHtml:  string;
  directionOptions: Array<{ key: LockedDirection; label: string; description: string }>;
};

const DIRECTION_OPTIONS: Array<{ key: LockedDirection; label: string; description: string }> = [
  { key: 'expand_clusters',  label: 'Expand Clusters',   description: 'Build more depth in winning topic areas' },
  { key: 'broaden_reach',    label: 'Broaden Reach',     description: 'Add new topic categories for wider visibility' },
  { key: 'deepen_niche',     label: 'Deepen Your Niche', description: 'Dominate one vertical completely before expanding' },
];

/**
 * buildQuarterlyVision
 * ─────────────────────
 * Synthesizes 90 days of data into a market positioning statement
 * and strategic direction for the next quarter.
 *
 * Agent version: interactive — presents 3 direction options for voice approval.
 * Client version: inspirational — no decisions, high confidence.
 */
export async function buildQuarterlyVision(params: {
  tenantId:     string;
  tenantName:   string;
  targetDomain: string;
  brandType?:   string;
}): Promise<VisionOutput> {
  await connectToDatabase();
  const db       = mongoose.connection.db!;
  const since90d = new Date(Date.now() - 90 * 86_400_000);

  const [totalPages, actionsTotal] = await Promise.all([
    db.collection('actionproposals').countDocuments({ tenantId: params.tenantId, type: 'create_page', status: 'completed' }),
    db.collection('actionproposals').countDocuments({ tenantId: params.tenantId, status: 'completed', createdAt: { $gte: since90d } }),
  ]);

  const clusterCount = Math.ceil(totalPages / 4);

  // Position inference
  const position: MarketPosition =
    totalPages >= 40 && clusterCount >= 5 ? 'niche_domination'   :
    totalPages >= 10                       ? 'emerging_authority' :
                                             'early_presence';

  const snapshot: QuarterlySnapshot = {
    totalPages, clusterCount, actionsTotal, dominantTopic: null, position,
  };

  const domain    = params.targetDomain?.replace(/^https?:\/\//, '') ?? 'your site';
  const firstName = params.tenantName?.split(' ')[0] ?? 'there';

  /* ── Identity statements ─────────────────────────────────────── */
  const IDENTITY: Record<MarketPosition, string> = {
    early_presence:     'We are establishing your presence and laying the groundwork for long-term growth.',
    emerging_authority: 'We are positioning you as a growing authority in your space.',
    niche_domination:   'We are becoming a dominant voice in a focused area of your market.',
  };

  const TRAJECTORY: Record<MarketPosition, string> = {
    early_presence:     ` With ${totalPages} pages built, your foundation is in place and momentum will begin to compound.`,
    emerging_authority: ` You now have ${totalPages} pages across ${clusterCount} content areas, and your presence is gaining real depth.`,
    niche_domination:   ` With ${totalPages} pages and ${clusterCount} clusters, you are building the kind of presence that compounds over time.`,
  };

  const FORWARD: Record<MarketPosition, string> = {
    early_presence:     ' Over the next quarter, we will begin expanding into strategic areas to accelerate your growth.',
    emerging_authority: ' Over the next quarter, we will expand this authority and deepen your reach into the market.',
    niche_domination:   ' Over the next quarter, we will deepen this presence and begin expanding outward.',
  };

  /* ── Agent direction options text ────────────────────────────── */
  const agentVoice = [
    `${firstName} — quarterly vision update.`,
    IDENTITY[position],
    TRAJECTORY[position].trim(),
    FORWARD[position].trim(),
    ``,
    `Next quarter, we have three paths:`,
    `1. ${DIRECTION_OPTIONS[0].label} — ${DIRECTION_OPTIONS[0].description}`,
    `2. ${DIRECTION_OPTIONS[1].label} — ${DIRECTION_OPTIONS[1].description}`,
    `3. ${DIRECTION_OPTIONS[2].label} — ${DIRECTION_OPTIONS[2].description}`,
    ``,
    `Which direction do you want to take?`,
  ].join('\n');

  /* ── Client voice (inspirational, 15–20 sec) ─────────────────── */
  const clientVoice = [
    'Hey — quarterly update.',
    'Over the past few months, we\'ve been building a strong foundation and expanding your presence.',
    position === 'niche_domination'
      ? "You're becoming a recognized presence in your market and momentum is compounding."
      : position === 'emerging_authority'
      ? "You're starting to be recognized in key areas and momentum is building."
      : "The groundwork is in place and we're starting to see the early stages of growth.",
    'We\'re continuing to build this into something long-term and sustainable.',
  ].join(' ');

  /* ── Client email ────────────────────────────────────────────── */
  const emailClientHtml = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;padding:40px 20px;max-width:560px;margin:0 auto;">
      <h2 style="color:#7c3aed;font-size:20px;">Your Quarterly Progress 🚀</h2>
      <p style="color:#64748b;font-size:13px;margin-top:-8px;">${domain}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;">${IDENTITY[position]}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;">${TRAJECTORY[position].trim()}</p>
      <p style="font-size:15px;line-height:1.7;color:#374151;">${FORWARD[position].trim()}</p>
      <p style="font-size:15px;font-weight:700;color:#1a1a1a;">Everything is moving in the right direction. 🙌</p>
      <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Quarterly update from your growth team</p>
    </div>`.trim();

  /* ── Agent email ─────────────────────────────────────────────── */
  const emailAgentHtml = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;padding:32px 20px;max-width:600px;background:#f5f3ff;border-radius:10px;">
      <h2 style="color:#7c3aed;">🧭 Quarterly Vision Report — ${params.tenantName ?? domain}</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        ${[['Total Pages', totalPages], ['Content Clusters', clusterCount], ['Quarter Actions', actionsTotal], ['Market Position', position.replace(/_/g,' ')]].map(([k,v]) =>
          `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">${k}</td><td style="font-weight:700;font-size:14px;">${v}</td></tr>`
        ).join('')}
      </table>
      <p style="font-size:14px;color:#374151;line-height:1.6;">${IDENTITY[position]}${TRAJECTORY[position]}${FORWARD[position]}</p>
      <div style="background:#ede9fe;border-left:4px solid #7c3aed;padding:12px 16px;border-radius:6px;margin-top:16px;">
        <strong style="font-size:13px;color:#4c1d95;">Direction Options for Next Quarter</strong>
        <ol style="margin:8px 0 0;padding-left:16px;">
          ${DIRECTION_OPTIONS.map(d => `<li style="font-size:13px;color:#4c1d95;margin-bottom:4px;"><strong>${d.label}</strong> — ${d.description}</li>`).join('')}
        </ol>
        <p style="font-size:12px;color:#6d28d9;margin:8px 0 0;">Reply via voice call to lock in your direction.</p>
      </div>
    </div>`.trim();

  return { snapshot, position, clientVoice, agentVoice, emailClientHtml, emailAgentHtml, directionOptions: DIRECTION_OPTIONS };
}
