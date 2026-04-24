import fs            from 'fs';
import path          from 'path';
import OpenAI        from 'openai';
import connectToDatabase   from '@/lib/mongodb';
import NovaVoiceSummary    from '@/models/NovaVoiceSummary';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type VoiceSummaryInput = {
  tenantId:     string;
  clientName:   string;
  keyword:      string;
  actionType:   string;
  targetDomain: string;
  triggerRef?:  string;
  triggerType?: string;
};

/**
 * Builds the script Nova will speak — warm, direct, one breath.
 */
function buildScript(input: VoiceSummaryInput): string {
  const { clientName, keyword, actionType, targetDomain } = input;
  const first = clientName?.split(' ')[0] || 'there';
  const actionVerb = actionType === 'rebuild' ? 'rebuilt' :
                     actionType === 'reinforce' ? 'reinforced' :
                     actionType === 'boost'     ? 'boosted' : 'created';

  return (
    `Hey ${first} — Nova here. ` +
    `I just ${actionVerb} a page targeting "${keyword}" for ${targetDomain || 'your site'}. ` +
    `I chose this keyword because I detected strong search demand with room to rank. ` +
    `The page is now queued in the pipeline and will be live shortly. ` +
    `Keep building momentum — I'm always watching for the next opportunity.`
  );
}

/**
 * generateNovaVoiceSummary
 * ─────────────────────────
 * Generates a TTS audio clip using OpenAI's nova voice,
 * stores it in MongoDB, and returns the summary doc _id.
 */
export async function generateNovaVoiceSummary(
  input: VoiceSummaryInput
): Promise<{ summaryId: string; script: string }> {

  await connectToDatabase();

  const script = buildScript(input);

  /* ── Generate TTS audio via OpenAI ──────────────────────────── */
  const mp3Response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'nova',       // "nova" voice — Nova talking to them
    input: script,
    response_format: 'mp3',
  });

  const audioBuffer = Buffer.from(await mp3Response.arrayBuffer());

  /* ── Write to public/audio for static serving (local + CDN) ─── */
  // Falls back gracefully on Vercel where the FS is read-only.
  // MongoDB is always the durable source of truth.
  let publicAudioUrl: string | null = null;
  try {
    const audioDir  = path.join(process.cwd(), 'public', 'audio');
    const tmpId     = Date.now().toString(36);   // temp name before we get the Mongo _id
    const filePath  = path.join(audioDir, `${tmpId}.mp3`);
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(filePath, audioBuffer);
    publicAudioUrl  = `/audio/${tmpId}.mp3`;     // updated after Mongo insert with real id
  } catch {
    // Vercel production — read-only FS, use MongoDB streaming instead
  }

  /* ── Persist to MongoDB ───────────────────────────────────────── */
  const doc = await NovaVoiceSummary.create({
    tenantId:     input.tenantId,
    triggerType:  input.triggerType ?? 'page_created',
    triggerRef:   input.triggerRef,
    script,
    audioBuffer,
    audioSize:    audioBuffer.length,
    voice:        'nova',
    title:        `Nova just built a page for ${input.targetDomain || 'your site'}`,
    subtitle:     `Targeting: "${input.keyword}"`,
    keyword:      input.keyword,
    actionType:   input.actionType,
    targetDomain: input.targetDomain,
  });

  // Rename the tmp file to use the real Mongo _id for cleaner URLs
  if (publicAudioUrl) {
    try {
      const audioDir   = path.join(process.cwd(), 'public', 'audio');
      const oldPath    = path.join(process.cwd(), 'public', publicAudioUrl);
      const newName    = `${String(doc._id)}.mp3`;
      const newPath    = path.join(audioDir, newName);
      fs.renameSync(oldPath, newPath);
      publicAudioUrl = `/audio/${newName}`;
    } catch { /* file rename optional */ }
  }

  return { summaryId: String(doc._id), script, publicAudioUrl };
}
