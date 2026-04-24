import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { TwilioService } from '@/lib/twilio';
import { EmailService } from '@/lib/email';
import { CalendarService } from '@/lib/calendar';

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

  const emailService = new EmailService();
  await emailService.sendEndOfCallTranscript(clientEmail, callerNumber, durationMins, message.summary, message.recordingUrl, message.transcript);

  if (clientPhone && agentTwilioData && agentTwilioData !== 'Pending') {
    try {
      const twilio = new TwilioService();
      const shortSummary = message.summary ? message.summary.substring(0, 90) : 'Check dashboard for details.';
      await twilio.sendSms(
        clientPhone, 
        agentTwilioData, 
        `AI Pilots Alert: Call completed with ${callerNumber} (${durationMins}m). \n\nSummary: ${shortSummary}... \n\nCheck email for full transcript!`
      );
    } catch (e: any) {
      console.error(`[WEBHOOK] SMS Dispatch Failed: ${e.message}`);
    }
  }

  return NextResponse.json({ success: true, processed: true });
}

function generateErrorResponse(toolList: any[], errorMessage: string) {
  const results = toolList.map(item => ({
    toolCallId: item.toolCall.id,
    result: errorMessage
  }));
  return NextResponse.json({ results }, { status: 200 });
}
