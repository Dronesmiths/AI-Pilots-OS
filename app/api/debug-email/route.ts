import { NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = 'force-dynamic';

export async function GET() {
    // Email notifications: PERMANENTLY DISABLED
    return NextResponse.json({ success: true, message: 'Email disabled' });
}
