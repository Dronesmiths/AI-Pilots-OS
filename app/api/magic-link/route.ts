import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_fallback_engine_key');

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    if (!email) {
      return NextResponse.json({ error: "Email parameter is required to initialize the payload." }, { status: 400 });
    }

    // Connect to the master Database exactly as configured
    await connectToDatabase();
    const dbUser = await User.findOne({ email: email.toLowerCase().trim() });

    if (!dbUser) {
      // Intentionally hard failure so the client clearly knows they used the wrong billing email natively
      return NextResponse.json({ error: "No active SaaS account physically located under this exact email signature." }, { status: 404 });
    }

    // Embed the telemetry cleanly into the JWT buffer
    const jwtSecret = process.env.JWT_SECRET || 'aipilots-temporary-secure-secret-2026';
    const token = jwt.sign(
      { 
        email: dbUser.email,
        name: dbUser.name,
        twilioNumber: dbUser.twilioNumber,
        vapiAgentId: dbUser.vapiAgentId
      },
      jwtSecret,
      { expiresIn: '7d' } // Secure local expiration timeframe
    );

    // Reconstruct the original Pabbly Endpoint Intercept Router dynamically from the Host
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    const host = request.headers.get('host') || 'dashboard.aipilots.site';
    const baseUrl = `${protocol}://${host}`;
    
    // NATIVE ROUTING: We send the token securely right back to the original client-login endpoint
    const url = `${baseUrl}/client-login?token=${token}`;

    const emailHtml = `
      <div style="font-family: sans-serif; background-color: #f7f9fc; padding: 40px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <div style="background-color: #2563eb; padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">AI Pilots</h1>
          </div>
          <div style="padding: 40px; text-align: center;">
            <h2 style="color: #0f172a; margin-top: 0;">Welcome Back, ${dbUser.name.split(' ')[0]} 👋</h2>
            <p style="color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              Here is the secure login link for your AI Receptionist Dashboard. Click the button below to jump right in.
            </p>
            <a href="${url}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Access My Dashboard
            </a>
            <p style="color: #94a3b8; font-size: 14px; margin-top: 30px; line-height: 1.5;">
              This link expires in 7 days for your security. If you did not request this, you can safely ignore this email.
            </p>
          </div>
        </div>
      </div>
    `;

    // Drop the Resend payload instantly into their inbox
    const resendResult = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Voice-Agent@aipilots.site',
      to: dbUser.email,
      subject: 'Magic Login Link | AI Pilots',
      html: emailHtml,
    });

    if (resendResult.error) {
      console.error("[MAGIC LINK ENGINE] Resend physically rejected the payload:", resendResult.error);
      return NextResponse.json({ error: `Resend Blocked Email: ${resendResult.error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Magic link securely dispatched to client inbox!" });

  } catch (error: any) {
    console.error("[MAGIC LINK ENGINE] Internal API Payload failed:", error);
    return NextResponse.json({ error: "Failed to dispatch Resend validation payload block." }, { status: 500 });
  }
}
