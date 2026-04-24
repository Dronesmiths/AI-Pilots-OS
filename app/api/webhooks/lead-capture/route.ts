import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import axios from 'axios';

/**
 * Phase 5: Zero-Latency Lead Outbound Dialer
 * Intercepts form submissions from the Programmatic SEO network and immediately triggers a Vapi Outbound Call back to the lead.
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const { client_id, lead_name, lead_phone, lead_inquiry, test_mode } = payload;

    if (!client_id || !lead_phone) {
      return NextResponse.json({ error: 'Missing client_id or lead_phone' }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(client_id).lean();
    if (!user) return NextResponse.json({ error: 'CRM Client mapping not found.' }, { status: 404 });

    const agentId = user.agents?.[0]?.vapiAgentId || user.vapiAgentId;
    if (!agentId) return NextResponse.json({ error: 'Client does not have an active Voice Agent provisioned to execute an outbound dial.' }, { status: 400 });

    console.log(`[LEAD CAPTURE] Form intercepted for ${user.name}. Triggering zero-latency outbound dial to ${lead_phone}...`);

    // Architectural Safety Guard: Wait for Telecom A2P 10DLC restrictions to clear securely. 
    // Passes the payload flawlessly but halts the ultimate hardware network ping if test_mode is flagged.
    if (test_mode === true || test_mode === 'true') {
      console.log(`[LEAD CAPTURE] [A2P 10DLC STANDBY MODE] -> System successfully mapped payload and would actively dial ${lead_phone} bridging to Agent ${agentId}.`);
      return NextResponse.json({ success: true, message: 'Test mode simulation sequence successful.', details: { lead_phone, agentId, mapped_inquiry: lead_inquiry } });
    }

    // Phase 5: The Hard Network Ping sequence.
    const vapiApiKey = process.env.VAPI_API_KEY;
    if (!vapiApiKey) return NextResponse.json({ error: 'Vapi System Key missing from ENV.' }, { status: 500 });

    try {
      const vapiResponse = await axios.post(
        'https://api.vapi.ai/call/phone',
        {
          assistantId: agentId,
          customer: {
            number: lead_phone,
            name: lead_name || 'VIP Client'
          },
          // The true power of Phase 5: We dynamically inject a completely custom Opening Line to contextualize the instant call perfectly for the bewildered lead.
          assistantOverrides: {
            firstMessage: `Hi ${lead_name ? lead_name.split(' ')[0] : 'there'}, I just received the request you submitted on our website regarding ${lead_inquiry ? lead_inquiry : 'booking an appointment'}. What can I help you with?`
          }
        },
        { headers: { Authorization: `Bearer ${vapiApiKey}` } }
      );
      
      console.log(`[LEAD CAPTURE] Success! Outbound call successfully hardware-spawned! Call ID: ${vapiResponse.data.id}`);
      return NextResponse.json({ success: true, callId: vapiResponse.data.id });

    } catch (vapiErr: any) {
      console.error("[LEAD CAPTURE] Vapi Outbound hardware encountered a catastrophic refusal:", vapiErr.response?.data || vapiErr.message);
      return NextResponse.json({ error: 'Hardware ping failed executing outbound Vapi call via Telecom network.' }, { status: 500 });
    }

  } catch (error: any) {
    console.error("[LEAD CAPTURE] Critical webhook structure failure:", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
