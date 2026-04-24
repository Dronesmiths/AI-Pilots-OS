import mongoose           from 'mongoose';
import connectToDatabase  from '@/lib/mongodb';
import { getToneProfile } from '@/lib/voice/brandVoice';

type WeeklyStoryInput = {
  tenantId:      string;
  tenantName:    string;
  targetDomain:  string;
  brandType?:    string;
  momentumState?: string;
};

type WeeklyStoryResult = {
  voiceScript:   string;
  emailSubject:  string;
  emailHtml:     string;
  stats: {
    pagesThisWeek: number;
    totalPages:    number;
    actionsCount:  number;
    callDecisions: number;
  };
};

/**
 * buildWeeklyStory
 * ─────────────────
 * Aggregates the past 7 days of tenant activity and produces:
 *   1. A short voice script (< 45 sec spoken) for a Vapi call
 *   2. A premium HTML email with the same story
 *
 * Written entirely in non-technical, client-friendly language.
 */
export async function buildWeeklyStory(input: WeeklyStoryInput): Promise<WeeklyStoryResult> {
  await connectToDatabase();
  const db = mongoose.connection.db!;

  const since7d = new Date(Date.now() - 7 * 86_400_000);

  /* ── Gather stats ─────────────────────────────────────────────── */
  const [pagesThisWeek, totalPages, actionsCount, callDecisions] = await Promise.all([
    db.collection('actionproposals').countDocuments({ tenantId: input.tenantId, type: 'create_page', status: 'completed', createdAt: { $gte: since7d } }),
    db.collection('actionproposals').countDocuments({ tenantId: input.tenantId, type: 'create_page', status: 'completed' }),
    db.collection('actionproposals').countDocuments({ tenantId: input.tenantId, status: 'completed', createdAt: { $gte: since7d } }),
    db.collection('activitylogs').countDocuments({ userId: input.tenantId, type: 'VOICE_DECISION', timestamp: { $gte: since7d.toISOString() } }),
  ]);

  const stats = { pagesThisWeek, totalPages, actionsCount, callDecisions };

  /* ── Voice script ─────────────────────────────────────────────── */
  const profile  = getToneProfile(input.brandType);
  const domain   = input.targetDomain?.replace(/^https?:\/\//, '') ?? 'your site';
  const name     = input.tenantName?.split(' ')[0] ?? 'there';

  const momentumPhrase =
    input.momentumState === 'breakthrough' ? "and momentum is really stacking up"    :
    input.momentumState === 'accelerating' ? "and momentum is building nicely"        :
    input.momentumState === 'stable'       ? "and everything is running smoothly"     :
    input.momentumState === 'building'     ? "and things are starting to come together" :
                                             "and we're getting things moving";

  const voiceScript = [
    `Hey ${name} —`,
    `Here's your weekly progress update for ${domain}.`,
    pagesThisWeek > 0
      ? `This week we added ${pagesThisWeek} new page${pagesThisWeek > 1 ? 's' : ''} to help more people find your business online.`
      : `This week we focused on strengthening the work already in place.`,
    totalPages > 1
      ? `You now have ${totalPages} pages working for you ${momentumPhrase}.`
      : `The foundation is being built ${momentumPhrase}.`,
    profile.closings[0],
    `That's your weekly update — talk soon.`,
  ].join(' ');

  /* ── Email HTML ───────────────────────────────────────────────── */
  const emailSubject = `📈 Your weekly progress — ${domain}`;

  const statBlocks = [
    { label: 'Pages added this week', value: pagesThisWeek, icon: '📄' },
    { label: 'Total pages live',      value: totalPages,     icon: '🏗️' },
    { label: 'Improvements made',     value: actionsCount,   icon: '⚡' },
  ];

  const emailHtml = `
    <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;padding:40px 20px;max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;">
      <div style="text-align:center;margin-bottom:28px;">
        <div style="font-size:36px;margin-bottom:8px;">📈</div>
        <h1 style="color:#4f46e5;font-size:22px;margin:0;">Your Weekly Progress Update</h1>
        <div style="font-size:13px;color:#6b7280;margin-top:4px;">${domain}</div>
      </div>

      <p style="font-size:15px;line-height:1.6;color:#4a5568;">Hey ${name},</p>
      <p style="font-size:15px;line-height:1.6;color:#4a5568;">
        Here's a summary of what happened on your site this week.
        ${pagesThisWeek > 0
          ? `We added <strong>${pagesThisWeek} new page${pagesThisWeek > 1 ? 's' : ''}</strong> to help more people find your business online.`
          : `We focused on strengthening the work already in place.`}
      </p>

      <div style="display:flex;gap:12px;margin:24px 0;flex-wrap:wrap;">
        ${statBlocks.map(s => `
          <div style="flex:1;min-width:140px;background:#f5f3ff;border-radius:10px;padding:16px;text-align:center;border:1px solid #e0d9ff;">
            <div style="font-size:24px;margin-bottom:6px;">${s.icon}</div>
            <div style="font-size:22px;font-weight:800;color:#4f46e5;">${s.value}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px;">${s.label}</div>
          </div>
        `).join('')}
      </div>

      <div style="background:#f8fafc;border-left:4px solid #4f46e5;padding:14px 18px;border-radius:6px;margin:20px 0;">
        <div style="font-size:14px;color:#4a5568;line-height:1.6;">
          ${totalPages > 1
            ? `You now have <strong>${totalPages} pages</strong> actively working to bring people to your business ${momentumPhrase}.`
            : `The foundation is being built and things are heading in the right direction.`
          }
        </div>
      </div>

      <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px;">
        Sent weekly by your growth team
      </p>
    </div>
  `.trim();

  return { voiceScript, emailSubject, emailHtml, stats };
}
