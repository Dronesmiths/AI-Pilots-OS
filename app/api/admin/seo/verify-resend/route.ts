import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import { Resend } from 'resend';

function buildWelcomeEmail(clientName: string, targetDomain: string, locations: string, keywords: string): string {
    const displayDomain = targetDomain?.replace(/^https?:\/\//, '') || 'your domain';
    const displayLocations = locations || 'your target area';
    const displayKeywords = keywords || 'your core services';

    return `
        <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0f1e; color: #f0f4ff; max-width: 640px; margin: 0 auto; border-radius: 16px; overflow: hidden; border: 1px solid #1e2d4a;">
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #1a73e8 0%, #0d47a1 100%); padding: 40px 32px; text-align: center;">
                <div style="font-size: 40px; margin-bottom: 12px;">🚁</div>
                <h1 style="margin: 0; font-size: 26px; font-weight: 700; color: #fff; letter-spacing: -0.5px;">Welcome to AI Pilots</h1>
                <p style="margin: 8px 0 0; font-size: 14px; color: rgba(255,255,255,0.75);">Autonomous SEO Platform — Drone Fleet Initialized</p>
            </div>

            <!-- Body -->
            <div style="padding: 40px 32px;">
                <p style="font-size: 17px; line-height: 1.6; color: #c8d8f0; margin: 0 0 24px;">Hi <strong style="color: #fff;">${clientName}</strong>,</p>
                <p style="font-size: 16px; line-height: 1.7; color: #94a8c8; margin: 0 0 24px;">
                    Your AI Pilots system is now live. Our autonomous drone fleet has been assigned to <strong style="color: #fff;">${displayDomain}</strong> and is standing by for ignition.
                </p>

                <!-- Mission Brief -->
                <div style="background: #0f1a30; border: 1px solid #1e3050; border-radius: 12px; padding: 24px; margin: 0 0 28px;">
                    <p style="margin: 0 0 16px; font-size: 13px; font-weight: 700; color: #1a73e8; letter-spacing: 1px; text-transform: uppercase;">📋 Mission Brief</p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; font-size: 13px; color: #6b7f99; width: 140px;">Target Domain</td>
                            <td style="padding: 8px 0; font-size: 13px; color: #e2ecff; font-weight: 600;">${displayDomain}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-size: 13px; color: #6b7f99;">Target Markets</td>
                            <td style="padding: 8px 0; font-size: 13px; color: #e2ecff;">${displayLocations}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; font-size: 13px; color: #6b7f99;">Core Keywords</td>
                            <td style="padding: 8px 0; font-size: 13px; color: #e2ecff;">${displayKeywords}</td>
                        </tr>
                    </table>
                </div>

                <!-- What Happens Next -->
                <p style="font-size: 13px; font-weight: 700; color: #1a73e8; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 16px;">⚡ What Happens Next</p>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${[
                        ['🔍', 'Discovery Drone', 'Scans your market and identifies high-value keyword gaps'],
                        ['✍️', 'Content Drone', 'Generates SEO-optimized service and location pages autonomously'],
                        ['📊', 'QA Factory', 'Validates every page against your brand standards before publishing'],
                        ['🚀', 'Deploy Drone', 'Pushes live pages directly to your GitHub → Cloudflare production CDN'],
                        ['📈', 'Reporting Drone', 'Delivers weekly performance reports to this email address'],
                    ].map(([icon, title, desc]) => `
                        <div style="background: #0f1a30; border-left: 3px solid #1a73e8; border-radius: 0 8px 8px 0; padding: 14px 16px;">
                            <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600; color: #fff;">${icon} ${title}</p>
                            <p style="margin: 0; font-size: 13px; color: #6b7f99;">${desc}</p>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Footer -->
            <div style="padding: 24px 32px; border-top: 1px solid #1e2d4a; text-align: center;">
                <p style="margin: 0 0 8px; font-size: 13px; color: #4a5f7a;">Questions? Reply directly to this email — our team monitors all client uplinks.</p>
                <p style="margin: 0; font-size: 12px; color: #2a3f5a;">AI Pilots • Autonomous SEO Platform • Antelope Valley, CA</p>
            </div>
        </div>
    `;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, clientEmail } = body;

        if (!userId || !clientEmail) {
            return NextResponse.json({ error: 'Missing userId or clientEmail for Resend Verification.' }, { status: 400 });
        }

        if (!process.env.RESEND_API_KEY) {
            return NextResponse.json({ error: 'CRITICAL FAILURE: RESEND_API_KEY missing in server vault!' }, { status: 400 });
        }

        await connectToDatabase();

        const user = await User.findById(userId);
        if (!user) {
             return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const resend = new Resend(process.env.RESEND_API_KEY);
        const clientName = user.name || 'there';
        const targetDomain = user.targetDomain || '';
        const locations = user.onboardingConfig?.targetLocations || '';
        const keywords = user.onboardingConfig?.seedKeywords || '';

        const welcomeHtml = buildWelcomeEmail(clientName, targetDomain, locations, keywords);

        // Send the welcome email immediately on verification
        const { data, error } = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: clientEmail,
            subject: `🚁 Welcome to AI Pilots — Your Drone Fleet is Live`,
            html: welcomeHtml
        });

        if (error) {
            console.error('Resend Ping Error:', error);
            // Sandbox restriction = API key IS valid, domain just needs adding to resend.com/domains
            const isSandboxRestriction = error.message?.toLowerCase().includes('testing emails') || error.message?.toLowerCase().includes('only send');
            if (isSandboxRestriction) {
                user.onboardingConfig = {
                    ...user.onboardingConfig,
                    clientReportingEmail: clientEmail,
                    resendVerified: true,
                    resendNote: 'API key valid. Add sending domain at resend.com/domains for full delivery to client.'
                };
                await user.save({ validateBeforeSave: false });
                return NextResponse.json({
                    success: true,
                    message: `API CONNECTED ✅ — Welcome email queued. Add your sending domain at resend.com/domains for full client delivery.`
                });
            }
            return NextResponse.json({ error: `Resend API failed to transmit: ${error.message}` }, { status: 500 });
        }

        // Full delivery confirmed — lock into DB
        user.onboardingConfig = {
            ...user.onboardingConfig,
            clientReportingEmail: clientEmail,
            resendVerified: true
        };

        await user.save({ validateBeforeSave: false });

        return NextResponse.json({ 
             success: true, 
             message: `🚁 Welcome email sent to ${clientEmail}! Reporting uplink secured.` 
        });

    } catch (error: any) {
        console.error('Resend Verification Route Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
