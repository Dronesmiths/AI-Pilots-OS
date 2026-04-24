import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, keyword, url, type } = body;

        // User requested tracking ONLY for Location and Blog pages to prevent QA notification floods
        if (type !== 'Location' && type !== 'Blog') {
            console.log(`[notify-publication] Skipping email for type: ${type}`);
            return NextResponse.json({ success: true, message: `Skipped (type=${type})` });
        }

        const user = await User.findById(userId);
        if (!user || (!user.email && !user.onboardingConfig?.adminEmail)) {
            return NextResponse.json({ success: false, error: 'User or email not found' }, { status: 404 });
        }

        const targetEmail = user.email || user.onboardingConfig?.adminEmail;
        const adminEmail = process.env.ADMIN_EMAIL || 'dronesmiths2@gmail.com';

        await resend.emails.send({
            from: 'AI Pilots <onboarding@resend.dev>',
            to: [targetEmail, adminEmail],
            subject: `🚀 New ${type} Page Deployed: ${keyword}`,
            html: `<p>A new <strong>${type}</strong> page for your target keyword <em>${keyword}</em> has been successfully deployed and indexed.</p>
                   <p>You can view it live here: <a href="${url}">${url}</a></p>
                   <br><p>— The AI Pilots Operator Drone</p>`
        });

        console.log(`[notify-publication] Email Sent for ${type} page to ${targetEmail}`);
        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[notify-publication] Email Error:', err.message);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
