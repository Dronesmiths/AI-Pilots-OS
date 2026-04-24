import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { EmailService } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Natively intercept Vapi Cloud Webhooks
    if (body.message?.type !== 'end-of-call-report') {
      return NextResponse.json({ success: true, warning: 'Ignored non-report payload' });
    }

    const { call, transcript, summary, messages } = body.message;
    if (!call || !call.assistantId) {
      return NextResponse.json({ error: 'Missing call or agent data' }, { status: 400 });
    }

    // -------------------------------------------------------------
    // PHASE 12: MATHEMATICAL SPAM FILTRATION ENGINE
    // -------------------------------------------------------------
    const startedAt = new Date(call.createdAt || call.startedAt || Date.now());
    const endedAt = new Date(call.endedAt || Date.now());
    const durationSecs = (endedAt.getTime() - startedAt.getTime()) / 1000;
    
    // Aggressively isolate human-spoken words to calculate intent
    let userText = '';
    if (messages && Array.isArray(messages)) {
      userText = messages
        .filter(m => m.role === 'user' || m.role === 'guest')
        .map(m => m.message || m.content || '')
        .join(' ');
    } else if (transcript) {
      userText = transcript; // Fallback if matrix is empty
    }
    const wordCount = userText.split(/\s+/).filter(word => word.length > 0).length;

    console.log(`[VAPI TELEMETRY] Agent ${call.assistantId} | Call Ended. Duration: ${Math.round(durationSecs)}s. Human Words Spoken: ${wordCount}`);

    // If call lasted less than 15 seconds OR the human physically spoke less than 10 words: Drop it!
    if (durationSecs < 15 || wordCount < 10) {
      console.warn(`[SPAM FILTER] Call ${call.id} violently rejected. Classified as spam or ghost hangup.`);
      return NextResponse.json({ success: true, filtered: true, reason: 'failed_intent_threshold' });
    }

    // -------------------------------------------------------------
    // AUTOMATED CLIENT DISPATCH
    // -------------------------------------------------------------
    await connectToDatabase();
    
    const user = await User.findOne({
      $or: [
        { vapiAgentId: call.assistantId },
        { 'agents.vapiAgentId': call.assistantId }
      ]
    }).lean();

    const clientEmail = user?.email || user?.adminEmail;

    if (!user || !clientEmail) {
      console.error(`[VAPI DISPATCH] Dropping transcript for ${call.assistantId} - No CRM Client email mapped.`);
      return NextResponse.json({ error: 'Client not mapped' }, { status: 404 });
    }

    // Push the qualified lead directly to their inbox
    const emailEngine = new EmailService();
    const durationMins = Math.max(1, Math.ceil(durationSecs / 60));
    // Determine if it was a web call or a phone dial
    const callerIdentifier = call.customer?.number || call.customer?.identifier || 'Web Browser Caller';
    const recordingUrl = call.recordingUrl || '';

    await emailEngine.sendEndOfCallTranscript(
      clientEmail,
      callerIdentifier,
      durationMins,
      summary || 'A highly qualified conversation was successfully recorded by your AI Assistant.',
      recordingUrl,
      transcript || 'Transcript compilation was blocked or unreadable.'
    );

    console.log(`[SPAM FILTER PASSED] High-Intent Lead transcript successfully dispatched to Client [${clientEmail}].`);
    
    return NextResponse.json({ success: true, emailed: true, client: user.name });
  } catch (error: any) {
    console.error("[VAPI REPORT ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
