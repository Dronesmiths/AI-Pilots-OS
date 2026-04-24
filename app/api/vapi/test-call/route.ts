/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
const VAPI_API_KEY = process.env.VAPI_API_KEY;

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    const vapiAgentId = decoded.vapiAgentId;
    const twilioNumber = decoded.twilioNumber; // e.g. "+13187129189"

    if (!vapiAgentId || !twilioNumber) {
      return NextResponse.json({ error: 'Account missing Agent ID or Phone Number.' }, { status: 400 });
    }

    const { personalPhone } = await req.json();

    if (!personalPhone) {
      return NextResponse.json({ error: 'Destination phone number is required.' }, { status: 400 });
    }

    // Format the personal phone strictly to E.164 (+1...)
    const cleanDigits = personalPhone.replace(/\D/g, '');
    const formattedCustomerNumber = cleanDigits.length === 10 ? `+1${cleanDigits}` : `+${cleanDigits}`;

    console.log(`[TEST CALL] Outbound dialing ${formattedCustomerNumber} from Agent ${vapiAgentId}...`);

    // Trigger Vapi Outbound Call using the Master Outbound Line
    const callResponse = await axios.post('https://api.vapi.ai/call', {
      assistantId: vapiAgentId,
      phoneNumberId: 'b0364f78-767d-4fe2-8f9f-258db0085808', // Master Unbound Test Number
      customer: {
        number: formattedCustomerNumber
      }
    }, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
    });

    console.log(`[TEST CALL] Triggered successfully! Call ID: ${callResponse.data.id}`);

    return NextResponse.json({ success: true, message: 'Test call initiated! Your phone should ring in a few seconds.' });

  } catch (error) {
    const err = error as any;
    const errorTrace = err?.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("[TEST CALL ERROR]", errorTrace);
    return NextResponse.json({ error: `Vapi Rejected Call: ${errorTrace}` }, { status: 500 });
  }
}
