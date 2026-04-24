import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: Request) {
  try {
    const { userId, accountId, locationId } = await request.json();

    if (!userId || !accountId || !locationId) {
      return NextResponse.json({ error: 'Missing required binding architecture payload' }, { status: 400 });
    }

    await connectToDatabase();
    
    const user = await User.findById(userId);
    if (!user) {
       return NextResponse.json({ error: 'Client ledger logic error: Node not found' }, { status: 404 });
    }

    // Permanently graft the GPS coordinates / Map identifiers to the Client Model
    user.gmbAccountId = accountId;
    user.gmbLocationId = locationId;
    await user.save();

    console.log(`[GMB BINDER] Successfully attached ${locationId} directly to ${user.name}`);

    return NextResponse.json({ success: true, message: 'Google Profile Bonded Successfully' });

  } catch (error: any) {
    console.error("[GMB BINDER] Fatal exception bonding Map Location:", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
