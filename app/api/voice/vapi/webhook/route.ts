import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { TwilioService } from '@/lib/twilio';
import { EmailService } from '@/lib/email';
import { CalendarService } from '@/lib/calendar';
import { ingestVoiceEvent } from '@/lib/voice/ingestVoiceEvent';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const message = payload.message || payload;
    const eventType = message.type || 'unknown_event';

    console.log(`[VAPI ORCHESTRATOR] Received event: ${eventType}`);

    if (eventType === 'tool-calls') {
      return await handleToolCalls(message);
    }

    if (eventType === 'end-of-call-report') {
      return await handleEndOfCallReport(message);
    }

    return NextResponse.json({ success: true, processed: true });

  } catch (error: any) {
    console.error('[VAPI ORCHESTRATOR ERROR]', error.message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

async function handleToolCalls(message: any) {
  const toolWithToolCallList = message.toolWithToolCallList || [];
  const assistantId = message.call?.assistantId;
  const customerNumber = message.call?.customer?.number;

  if (!assistantId) {
    return generateErrorResponse(toolWithToolCallList, "I'm sorry, my system lacks physical agent identification.");
  }

  await connectToDatabase();
  const dbUser = await User.findOne({
    $or: [{ vapiAgentId: assistantId }, { "agents.vapiAgentId": assistantId }]
  });

  if (!dbUser) {
    return generateErrorResponse(toolWithToolCallList, "I'm sorry, I cannot locate the master business owner parameters.");
  }

  let activeTwilioNumber = dbUser.twilioNumber;
  if (dbUser.agents && dbUser.agents.length > 0) {
    const specificAgent = dbUser.agents.find((a: any) => a.vapiAgentId === assistantId);
    if (specificAgent && specificAgent.twilioNumber) {
      activeTwilioNumber = specificAgent.twilioNumber;
    }
  }

  const results = [];
  const calendar = new CalendarService();
  const twilio = new TwilioService();

  for (const item of toolWithToolCallList) {
    const toolName = item.tool.name || item.toolCall.function.name;
    const callId = item.toolCall.id;
    const args = typeof item.toolCall.function.arguments === 'string' 
                 ? JSON.parse(item.toolCall.function.arguments) 
                 : item.toolCall.function.arguments;

    let resultMessage = "";

    try {
      if (toolName === 'checkAvailability') {
        resultMessage = await calendar.checkAvailability(dbUser, args);
      } else if (toolName === 'bookAppointment') {
        resultMessage = await calendar.bookAppointment(dbUser, args);
      } else if (toolName === 'sendSmsMessage') {
        if (!customerNumber) throw new Error("Caller ID missing precisely from webhook physical intercept array.");
        await twilio.sendSms(customerNumber, activeTwilioNumber, args.body);
        resultMessage = `You successfully natively injected an SMS to ${customerNumber} with the requested message. Aggressively confirm to the caller that the text was sent successfully.`;
      } else {
        resultMessage = `Logically unknown tool architecture: ${toolName}`;
      }
    } catch (err: any) {
      console.error(`[VAPI TOOL CRASH] Failed to execute ${toolName}:`, err);
      resultMessage = `I explicitly experienced an error while safely physically executing that request.`;
    }

    results.push({ toolCallId: callId, result: resultMessage });
  }

  return NextResponse.json({ results }, { status: 200 });
}

async function handleEndOfCallReport(message: any) {
  const assistantId = message.assistantId || message.call?.assistantId;
  
  if (!assistantId) {
    return NextResponse.json({ success: true, processed: false, reason: 'missing_assistant_id' });
  }

  await connectToDatabase();
  const owningClient = await User.findOne({
    $or: [{ vapiAgentId: assistantId }, { 'agents.vapiAgentId': assistantId }]
  });

  if (!owningClient) {
    return NextResponse.json({ success: true, processed: false, reason: 'unmapped_agent' });
  }

  const clientEmail = owningClient.email;
  const clientPhone = owningClient.personalPhone;
  let agentTwilioData = owningClient.twilioNumber;

  if (owningClient.agents && owningClient.agents.length > 0) {
    const specificAgent = owningClient.agents.find((a: any) => a.vapiAgentId === assistantId);
    if (specificAgent && specificAgent.twilioNumber) {
      agentTwilioData = specificAgent.twilioNumber;
    }
  }

  const callerNumber = message.call?.customer?.number || 'Unknown Caller';
  const durationMins = Math.max(1, Math.round((message.duration || 0) / 60));

  // ── Nova Voice Intelligence: ingest call into memory pipeline ──────────────
  try {
    await ingestVoiceEvent({
      source:      'vapi',
      tenantId:    String(owningClient._id),
      callId:      message.call?.id || message.id,
      conversationId: message.call?.conversationId,
      from:        callerNumber,
      to:          agentTwilioData || owningClient.twilioNumber,
      startedAt:   message.startedAt || message.call?.startedAt,
      endedAt:     message.endedAt   || message.call?.endedAt,
      durationSec: message.duration  || 0,
      transcript:  message.transcript || '',
      metadata:    { summary: message.summary, assistantId },
    });
  } catch (ingestErr: any) {
    // Non-fatal — don't block email/SMS delivery
    console.error('[WEBHOOK] Nova ingest failed:', ingestErr.message);
  }

  try {
    const emailService = new EmailService();
    const dashboardUrl = emailService.generateMagicLink(
      owningClient.email, 
      owningClient.name || 'Client', 
      assistantId, 
      agentTwilioData || 'Pending'
    );
    await emailService.sendEndOfCallTranscript(clientEmail, callerNumber, durationMins, message.summary, message.recordingUrl, message.transcript, dashboardUrl);
  } catch (err) {
    console.error("[WEBHOOK] Email dispatch error:", err);
  }

  const shortSummary = message.summary ? message.summary.substring(0, 90) : 'Check dashboard for details.';
  const alertMsg = `AI Pilots Alert: Call completed with ${callerNumber} (${durationMins}m). \n\nSummary: ${shortSummary}... \n\nCheck email for full transcript!`;

  let whatsappStatus = 'skipped';

  // WHATSAPP META GRAPH DISPATCH
  try {
    const activeAccessToken = owningClient.metaAccessToken || process.env.META_SYSTEM_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || owningClient.metaAccountId || owningClient.whatsappPhoneNumber; 
    const toPhone = owningClient.personalPhone || owningClient.whatsappPhoneNumber; // Where to natively dispatch the text
    
    if (activeAccessToken && phoneNumberId && toPhone) {
        const axios = require('axios'); // Dynamic import if needed, or rely on global
        await axios.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          type: "text",
          to: toPhone.replace(/[^0-9]/g, ''), // Ensure clean numeric string for WhatsApp
          text: { preview_url: false, body: alertMsg }
        }, {
          headers: { Authorization: `Bearer ${activeAccessToken}` }
        });
        console.log(`[WEBHOOK] WhatsApp Notification dispatched successfully to ${toPhone}`);
        whatsappStatus = 'success';
      } else {
        whatsappStatus = 'missing_auth_or_phone_id';
      }
    } catch (waErr: any) {
      console.error(`[WEBHOOK] WhatsApp Dispatch Failed:`, waErr.response?.data || waErr.message);
      whatsappStatus = `error: ${JSON.stringify(waErr.response?.data || waErr.message)}`;
    }
  // TWILIO SMS DISPATCH (Fallback or concurrent if desired)
  if (clientPhone && agentTwilioData && agentTwilioData !== 'Pending') {
    try {
      const twilio = new TwilioService();
      await twilio.sendSms(
        clientPhone, 
        agentTwilioData, 
        alertMsg
      );
      console.log(`[WEBHOOK] Twilio SMS dispatched successfully to ${clientPhone}`);
    } catch (e: any) {
      console.error(`[WEBHOOK] SMS Dispatch Failed: ${e.message}`);
    }
  }

  return NextResponse.json({ success: true, processed: true, whatsappStatus });
}

function generateErrorResponse(toolList: any[], errorMessage: string) {
  const results = toolList.map(item => ({
    toolCallId: item.toolCall.id,
    result: errorMessage
  }));
  return NextResponse.json({ results }, { status: 200 });
}
