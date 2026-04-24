/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (!code || !state) {
      return NextResponse.json({ error: 'OAuth missing critical verification parameters from Google.' }, { status: 400 });
    }

    // 1. Verify exactly WHO this user is securely using the inbound state token
    const decoded = jwt.verify(state, JWT_SECRET) as any;
    const userEmail = decoded.email.toLowerCase().trim();

    // 2. Mathematically exchange the raw Google Code for the highly-secure Refresh Token
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'https://dashboard.aipilots.site/api/oauth/google/callback'
    );

    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      console.warn(`[OAUTH] Google did not return a refresh token for ${userEmail}. They may have previously authorized the app without revoking it.`);
      // If we don't get a refresh token, it means Google thinks we already have one. We can still mark them as connected if everything else passed.
    }

    // 3. Physically store the token into MongoDB permanently
    await connectToDatabase();
    const userProfile = await User.findOne({ email: userEmail });

    if (!userProfile) {
      return NextResponse.json({ error: 'Database User not found during OAuth intercept.' }, { status: 404 });
    }

    // Mark it connected!
    userProfile.googleCalendarConnected = true;
    
    // Only overwrite the refresh token if Google literally gave us a brand new one
    if (tokens.refresh_token) {
      userProfile.googleRefreshToken = tokens.refresh_token;
    }
    
    await userProfile.save();
    console.log(`[OAUTH] Google Calendar API successfully bonded natively to ${userProfile.email}`);

    // --- 3.5 ABSOLUTE AUTOMATION: DYNAMICALLY PATCH THE VAPI AGENT ON THE FLY ---
    // This permanently strictly eliminates ANY need for the platform owner to ever manually log into Vapi to set up client tools!
    if (userProfile.vapiAgentId) {
      try {
        const vapiKey = process.env.VAPI_API_KEY;
        if (vapiKey) {
          console.log(`[OAUTH] Automatically injecting Calendar Custom Tools functionally into Vapi Agent: ${userProfile.vapiAgentId}`);
          await axios.patch(`https://api.vapi.ai/assistant/${userProfile.vapiAgentId}`, {
            tools: [
              {
                type: "function",
                messages: [
                  { type: "request-start", content: "Let me check the calendar right now." },
                  { type: "request-complete", content: "Okay, I've checked the schedule." },
                  { type: "request-failed", content: "I wasn't able to check the calendar." }
                ],
                function: {
                  name: "checkAvailability",
                  description: "Checks the business owner's Google Calendar for booked appointments to determine when they are physically free to take a meeting.",
                  parameters: { type: "object", properties: {}, required: [] }
                },
                server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
              },
              {
                type: "function",
                messages: [
                  { type: "request-start", content: "I am booking that appointment for you right now." },
                  { type: "request-complete", content: "The appointment has been successfully booked." },
                  { type: "request-failed", content: "I couldn't complete the booking." }
                ],
                function: {
                  name: "bookAppointment",
                  description: "Physically books the appointment on the Google Calendar. REQUIRES the customer's name, phone, and strict ISO-8601 start and end datetimes.",
                  parameters: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "The name of the caller" },
                      phone: { type: "string", description: "The phone number of the caller" },
                      startTime: { type: "string", description: "ISO-8601 formatted start datetime" },
                      endTime: { type: "string", description: "ISO-8601 formatted end datetime" }
                    },
                    required: ["startTime", "endTime"]
                  }
                },
                server: { url: "https://dashboard.aipilots.site/api/vapi/webhook" }
              },
              {
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
              }
            ]
          }, {
            headers: { Authorization: `Bearer ${vapiKey}` }
          });
          console.log(`[OAUTH] Success! Custom Tools flawlessly dynamically patched to Vapi Edge array!`);
        }
      } catch (patchErr: any) {
        console.error(`[OAUTH AUTOMATION CRASH] Failed to auto-patch Vapi Tools:`, patchErr.response?.data || patchErr.message);
      }
    }

    // 4. Force Next.js to drop the user gracefully back onto their Completion Bar dashboard!
    return NextResponse.redirect('https://dashboard.aipilots.site/client-dashboard');

  } catch (error: any) {
    console.error('Error in Google OAuth Callback Intercept:', error.message);
    return new NextResponse('Internal Server Error processing Google permissions.', { status: 500 });
  }
}
