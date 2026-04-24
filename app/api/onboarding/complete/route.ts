/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { VapiService } from '@/lib/vapi';
import { allVoices } from '@/voices-array';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized. No active session found.' }, { status: 401 });
    }

    // Verify User Session
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
    
    // 🚀 NEW: Securely fetch from MongoDB
    await connectToDatabase();
    let userProfile = await User.findOne({ email: decoded.email.toLowerCase().trim() });
    
    if (!userProfile && decoded.email && decoded.vapiAgentId) {
      userProfile = await User.create({
        email: decoded.email.toLowerCase().trim(),
        name: decoded.name || 'Legacy Client',
        twilioNumber: decoded.twilioNumber || '+10000000000',
        vapiAgentId: decoded.vapiAgentId
      });
    }

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile missing from Database.' }, { status: 404 });
    }

    let vapiAgentId = userProfile.vapiAgentId;
    
    // 🚀 NEW: Robust Multi-Agent Array Fallback
    if (!vapiAgentId && userProfile.agents && userProfile.agents.length > 0) {
      vapiAgentId = userProfile.agents[0].vapiAgentId;
    }

    const clientName = userProfile.name;

    if (!vapiAgentId) {
      console.error("[ONBOARDING ERROR] No Vapi Agent ID found in both root and agents array!");
      return NextResponse.json({ error: 'No Vapi Agent physically associated with this account.' }, { status: 403 });
    }

    const data = await req.json();
    const { 
      assistantName, language, agentTone, voiceGender, 
      firstMessage, tasks, faqs, closingMessage, personalPhone 
    } = data;

    // Securely map the cell phone directly to MongoDB for SMS routing
    if (personalPhone && userProfile) {
      userProfile.personalPhone = personalPhone.trim();
      await userProfile.save();
      console.log(`[ONBOARDING] Saved secure SMS routing number for ${userProfile.email}`);
    }

    console.log(`[ONBOARDING] Patching Vapi Agent ${vapiAgentId} for ${clientName}...`);

    // 🚀 NEW: Leverage the highly unified `/lib` architecture for fetching & patching
    const vapi = new VapiService();
    
    const existingTools = await vapi.getAgentTools(vapiAgentId);

    // Compile the Master System Prompt
    const masterPrompt = `
# IDENTITY & PERSONA
You are ${assistantName}, an elite AI Voice Receptionist acting as a human employee.
Your conversational tone is strictly: ${agentTone}.
Your primary spoken language is: ${language}.

You are speaking over the phone. You are NOT a text-based chatbot. You must speak exactly like a natural, empathetic human would on a telephone call. 
- NEVER use markdown, formatting, bullet points, or special characters in your speech.
- NEVER speak in long paragraphs. Keep every response to 1-3 short, breathable sentences.
- Use natural filler words occasionally (e.g., "Hmm", "Let me see", "Right", "Got it") to sound human when transitioning thoughts.
- If the caller interrupts you, instantly stop talking and listen to them.

# SMS CAPABILITY (CRITICAL TOOL)
You have a custom tool called 'sendSmsMessage'. The caller's physical cell phone number is dynamically available to you: {{call.customer.number}}. 
If the caller requests a text message, a link, an FAQ, an address, or a prayer, you MUST confidently say: "I see you're calling from {{call.customer.number}}, I can send that over to you in a text right now if you'd like!"
If they agree, trigger the 'sendSmsMessage' tool immediately during the call with the requested information.

# CORE TASKS & DIRECTIVES
The business owner has given you the following primary tasks to accomplish on this call:
${tasks}

# KNOWLEDGE BASE (FAQs)
If the caller asks questions, refer STRICTLY to this knowledge base. Do not invent pricing, services, or facts.
${faqs}
If the caller asks something outside of your knowledge base, do NOT guess. Instead say: "That's a great question, but I actually don't have that specific information in front of me right now. Let me instantly take down your name and number, and I'll have a specialist call you right back with the exact answer."

# CONVERSATIONAL PHYSICS & RULES
1. **Pacing:** Wait for the user to finish speaking before responding. Do not rush.
2. **Voicemail Detection:** If you hear "Please leave a message after the tone" or an automated voicemail greeting, you must instantly say: "Hi this is ${assistantName}. Please call us back at your earliest convenience. Thank you!" and then hang up to save minute costs.
3. **No Looping:** Never endlessly repeat yourself. If a conversation stalls, politely guide it back to the main tasks.
4. **Call Termination:** When the conversation naturally concludes, or the user says goodbye, you MUST say your exact closing message: "${closingMessage}" and then IMMEDIATELY trigger the call termination. Do NOT ask "Is there anything else I can help you with?" after saying the closing piece. Do not loop back to the beginning.
`;

    // Look up dynamic voice configuration
    const matchedVoice = allVoices.find((v: any) => v.id === voiceGender) || allVoices[0];

    // Patch the Vapi Agent securely via the unified proxy
    await vapi.configureAgent(vapiAgentId, {
      name: assistantName,
      firstMessage: firstMessage,
      model: {
        provider: "custom-llm",
        url: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://aipilots.com'}/api/nova/brain`, // Route strictly through the unified CRM brain
        messages: [{ role: "system", content: masterPrompt }],
        tools: existingTools // 🚀 Pass existing tools dynamically back in so Calendar & SMS are visually preserved!
      },
      analysisPlan: {
        structuredDataPlan: {
          schema: {
            type: "object",
            properties: {
              caller_name: { type: "string", description: "The name of the person calling." },
              caller_phone: { type: "string", description: "The caller's phone number if explicitly provided during the call." },
              intent: { type: "string", enum: ["Information", "Booking/Appointment", "Complaint", "Support", "Other"], description: "The primary reason for the call." },
              summary: { type: "string", description: "A concise one sentence summary of what the caller wanted and what the resolution was." },
              is_lead: { type: "boolean", description: "True if the caller seems like a genuine potential customer or high-intent lead that requires immediate follow up." }
            }
          }
        }
      },
      voice: {
        provider: matchedVoice.provider,
        voiceId: matchedVoice.voiceId
      },
      metadata: {
        rawFormState: {
          assistantName, language, agentTone, voiceGender,
          firstMessage, tasks, faqs, closingMessage
        }
      }
    });

    return NextResponse.json({ success: true, message: 'Assistant successfully configured!', agentId: vapiAgentId });

  } catch (error: any) {
    console.error("[ONBOARDING ERROR]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
