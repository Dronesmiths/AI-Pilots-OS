/**
 * app/api/admin/voice/send-dashboard-email/route.ts
 *
 * Sends the client their dashboard magic link so they can manage/setup their agent.
 * POST { userId }
 */
import { NextResponse }  from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User              from '@/models/User';
import { EmailService }  from '@/lib/email';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId).lean() as any;
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!user.email) return NextResponse.json({ error: 'User has no email address' }, { status: 400 });

    const agentId     = user.agents?.[0]?.vapiAgentId || user.vapiAgentId || '';
    const twilioNumber= user.agents?.[0]?.twilioNumber || user.twilioNumber || '';
    const emailSvc    = new EmailService();

    const dashboardUrl = emailSvc.generateMagicLink(user.email, user.name || 'Client', agentId, twilioNumber);
    await emailSvc.sendClientWelcomePayload(user.email, user.name || 'Client', dashboardUrl);

    console.log(`[DASHBOARD-EMAIL] Sent to ${user.email}`);
    return NextResponse.json({ success: true, sentTo: user.email });

  } catch (err: any) {
    console.error('[DASHBOARD-EMAIL ERROR]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
