import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
const VAPI_API_KEY = process.env.VAPI_API_KEY;

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('ai_pilots_client_session')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    await connectToDatabase();
    const userProfile = await User.findOne({ email: decoded.email?.toLowerCase().trim() });
    
    if (!userProfile) {
      return NextResponse.json({ error: 'User profile missing.' }, { status: 404 });
    }

    const body = await req.json();
    const { agentId, safetySettings } = body;

    if (!agentId || !safetySettings) {
      return NextResponse.json({ error: 'Missing agentId or safetySettings.' }, { status: 400 });
    }

    // 1. Permanently update the specific agent's safety settings inside the MongoDB array
    let agentIndex = -1;
    if (userProfile.agents && userProfile.agents.length > 0) {
      agentIndex = userProfile.agents.findIndex((a: any) => a.vapiAgentId === agentId);
      if (agentIndex > -1) {
        userProfile.agents[agentIndex].safetySettings = safetySettings;
      }
    } else {
      // Legacy fallback
      if (!userProfile.agents) userProfile.agents = [];
      userProfile.agents.push({
        vapiAgentId: agentId,
        safetySettings: safetySettings
      });
      agentIndex = 0;
    }
    await userProfile.save();
    console.log(`[SAFETY OVERRIDE] Saved secure settings to MongoDB for Agent ${agentId}.`);

    // 2. Fetch Live Vapi Agent
    console.log(`[SAFETY OVERRIDE] Fetching live Vapi Agent ${agentId} to patch physical behaviors...`);
    const liveAgentReq = await axios.get(`https://api.vapi.ai/assistant/${agentId}`, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
    });
    
    const liveAgent = liveAgentReq.data;
    if (!liveAgent || !liveAgent.model) {
       throw new Error("Invalid Agent payload from Vapi.");
    }

    let existingTools = liveAgent.model.tools || [];
    let systemPrompt = liveAgent.model.messages?.[0]?.content || '';

    // 3. Dynamically Filter Tools based on Safety Settings
    
    // Always structurally strip them first to prevent duplicates, then selectively re-inject based on rules
    existingTools = existingTools.filter((t: any) => 
      t.function?.name !== 'sendSmsMessage' && 
      t.function?.name !== 'checkAvailability' && 
      t.function?.name !== 'bookAppointment'
    );

    // Re-inject SMS if not disabled
    if (safetySettings.disableSms !== true) {
      existingTools.push({
        type: "function",
        messages: [
          { type: "request-start", content: "I am sending that text message to your phone right now." },
          { type: "request-complete", content: "Okay, the text message has been sent!" },
          { type: "request-failed", content: "I apologize, I wasn't able to send the text message." }
        ],
        function: {
          name: "sendSmsMessage",
          description: "Sends a physical SMS text message natively to the caller's phone number during the active phone call.",
          parameters: {
            type: "object",
            properties: {
              body: { type: "string", description: "The exact literal text message content you want to securely send to the user." }
            },
            required: ["body"]
          }
        },
        server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
      });
    }

    // Re-inject Calendar if not disabled AND the user has authenticated their Google Calendar physically
    if (safetySettings.disableBooking !== true && userProfile.googleCalendarConnected) {
      existingTools.push(
        {
          type: "function",
          messages: [
            { type: "request-start", content: "Let me check our exact calendar schedule for you." },
            { type: "request-complete", content: "" },
            { type: "request-failed", content: "I apologize, I'm having trouble seeing the calendar right now." }
          ],
          function: {
            name: "checkAvailability",
            description: "Checks the business's live secure Google Calendar for exactly which 30-minute intervals are inherently free over the next 5 days. You MUST run this tool FIRST to mathematically guarantee you do not double-book an already busy time block.",
            parameters: { type: "object", properties: {}, required: [] }
          },
          server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
        },
        {
          type: "function",
          messages: [
            { type: "request-start", content: "I am locking in that secure appointment for you right now." },
            { type: "request-complete", content: "Perfect, I have directly securely booked that appointment internally on our master calendar!" },
            { type: "request-failed", content: "I apologize, the appointment booking mechanism failed. We'll have a human follow up." }
          ],
          function: {
            name: "bookAppointment",
            description: "Saves a brand new meeting precisely into the business owner's secure Google Calendar. ONLY call this tool AFTER you explicitly verify the requested time slot is cleanly available using checkAvailability.",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string", description: "The title of the meeting (e.g., 'Consultation with John Doe')" },
                startTime: { type: "string", description: "The strict ISO-8601 start date-time (e.g., '2026-03-24T14:30:00Z')" }
              },
              required: ["summary", "startTime"]
            }
          },
          server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
        }
      );
    }

    // 4. Overhaul the System Prompt for Safety Overrides
    // First, strictly clean up any previous fallback strings so we don't accidentally stack them repeatedly!
    const safetyMarker = "\n\n# --- CLIENT SAFETY OVERRIDES ---";
    if (systemPrompt.includes(safetyMarker)) {
      systemPrompt = systemPrompt.split(safetyMarker)[0];
    }

    const safetyAdditions: string[] = [];

    if (safetySettings.humanFallback === true) {
      safetyAdditions.push(`CRITICAL OVERRIDE: HUMAN FALLBACK MODE ACTIVATED
You must strictly obey this core override: The business owner has enabled Human Fallback mode due to operational constraints. You are strictly mathematically forbidden from attempting to answer questions, solve problems, or perform tasks.
When you speak to the caller, you must immediately state: "I sincerely apologize, but I am an AI assistant and I am currently unable to assist with complex requests. Please hold while I transfer you to a human, or feel free to leave a message and we will call you right back." 
Do NOT deviate from this instruction.`);
    } else {
      // Only apply explicit capability denial prompts if NOT in total fallback
      if (safetySettings.disableBooking === true) {
        safetyAdditions.push(`CRITICAL CAPABILITY UPDATE: Calendar Booking is DISABLED.
If the caller asks to book an appointment, you MUST politely state: "I apologize, but my appointment booking feature has been temporarily disabled by the business. Please call back later or leave a message!" Do not attempt to schedule anything.`);
      }

      if (safetySettings.disableSms === true) {
        safetyAdditions.push(`CRITICAL CAPABILITY UPDATE: SMS Texting is DISABLED.
If the caller asks you to send them a text message or a link, you MUST politely state: "I apologize, but my text messaging feature has been temporarily disabled by the business. I am unable to send messages at this time."`);
      }
    }

    // Safely append all active markers exactly to the end of the AI's core brain
    if (safetyAdditions.length > 0) {
      systemPrompt += safetyMarker + "\n" + safetyAdditions.join("\n\n");
    }

    // 5. Physically Execute the Vapi PATCH over the air!
    console.log(`[SAFETY OVERRIDE] Sending physical PATCH block to Vapi Engine...`);
    await axios.patch(`https://api.vapi.ai/assistant/${agentId}`, {
      model: {
        provider: liveAgent.model.provider || "openai",
        model: liveAgent.model.model || "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        tools: existingTools
      }
    }, {
      headers: { Authorization: `Bearer ${VAPI_API_KEY}` }
    });

    console.log(`[SAFETY OVERRIDE] Successfully constrained Agent ${agentId} over the air.`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    const errorTrace = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error("[SAFETY OVERRIDE FATAL ERROR]", errorTrace);
    return NextResponse.json({ error: 'Failed to securely update safety settings.' }, { status: 500 });
  }
}
