import { NextResponse } from 'next/server';
import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'aipilots_secret_verify_token_2026';
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('[WHATSAPP] Webhook successfully verified by Meta!');
      return new NextResponse(challenge, { status: 200 }); // Meta requires raw string response for GET
    }

    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Verify this is a WhatsApp API webhook event
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.value && change.value.messages && change.value.messages[0]) {
            
            const message = change.value.messages[0];
            const phoneNumberId = change.value.metadata.phone_number_id; // The Meta-assigned Business Phone ID
            const displayPhoneNumber = change.value.metadata.display_phone_number;
            const fromNumber = message.from; // Customer's cell phone
            const msgText = message.text?.body;
            
            if (!msgText) continue;

            console.log(`[WHATSAPP OMNI] Inbound text from ${fromNumber} to ${displayPhoneNumber}: "${msgText}"`);

            // 1. Locate User by phoneNumberId or Display Number
            await connectToDatabase();
            const user = await User.findOne({ 
              $or: [
                { metaAccountId: phoneNumberId }, 
                { whatsappPhoneNumber: phoneNumberId },
                { whatsappPhoneNumber: displayPhoneNumber }
              ] 
            });

            if (!user || (!user.metaAccessToken && !process.env.META_SYSTEM_ACCESS_TOKEN) || !user.vapiAgentId) {
              console.error(`[WHATSAPP OMNI] No matching AI Client Ledger found for Phone ID ${phoneNumberId}`);
              continue; // Do not throw error, always return 200 so Meta doesn't retry infinitely
            }

            const activeAccessToken = user.metaAccessToken || process.env.META_SYSTEM_ACCESS_TOKEN;
            const activeVapiAgentId = user.vapiAgentId; // Default primary agent

            // 2. Fetch Vapi Agent to rip out the master Brain Prompt
            let coreSystemPrompt = "You are a helpful assistant.";
            try {
              const vapiReq = await axios.get(`https://api.vapi.ai/assistant/${activeVapiAgentId}`, {
                headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
              });
              const agent = vapiReq.data;
              coreSystemPrompt = agent?.model?.messages?.[0]?.content || coreSystemPrompt;
            } catch (vapiErr) {
              console.warn("[WHATSAPP OMNI] Could not fetch Vapi prompt. Falling back to default.");
            }

            // 3. Inject Omni-Channel Text Prompts
            const omniPrompt = `${coreSystemPrompt}
             
# CRITICAL OMNI-CHANNEL TEXT OVERRIDE
You are currently communicating with the user via a text-based WhatsApp message. The caller's phone number is ${fromNumber}.
- You MUST format your responses strictly for WhatsApp (short, punchy, explicitly use emojis organically).
- You are physically UNABLE to literally "speak" to them or transfer the call since this is a text chat. Do not ever say "I can transfer you" or "I am putting you on hold."
- If they ask for links or information, just text it directly to them.
- Be concise. Never send a massive wall of text.
`;

            // 4. Generate AI Completion via OpenAI
            let aiReply = "I am currently offline.";
            try {
              const openaiRes = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: omniPrompt },
                  { role: "user", content: msgText }
                ]
              }, {
                headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }
              });

              aiReply = openaiRes.data.choices[0].message.content;
            } catch (openaiErr: any) {
              console.error("[WHATSAPP OMNI] OpenAI API Error:", openaiErr.response?.data || openaiErr.message);
              aiReply = "I apologize, but I am experiencing a temporary system upgrade at the moment. Please try again shortly!";
            }

            // 5. Blast Outbound WhatsApp Reply
            try {
              await axios.post(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
                messaging_product: "whatsapp",
                to: fromNumber,
                text: { body: aiReply }
              }, {
                headers: { Authorization: `Bearer ${activeAccessToken}` }
              });
              console.log(`[WHATSAPP OMNI] Successfully replied physically to ${fromNumber} via Meta Graph!`);
            } catch (metaErr: any) {
              console.error("[WHATSAPP OMNI] Meta Graph API Error:", metaErr.response?.data || metaErr.message);
            }
          }
        }
      }
    }

    // Meta strictly requires a 200 OK fast response, otherwise it will relentlessly re-send the payload!
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err: any) {
    console.error("[WHATSAPP OMNI] Fatal Ingestion Error:", err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
