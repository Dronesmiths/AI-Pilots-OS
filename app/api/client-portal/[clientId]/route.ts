import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function GET(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const params = await context.params;
    await connectToDatabase();
    
    // The MongoDB raw _id acts as a 24-char secure cryptolink for the client 
    const user = await User.findById(params.clientId).lean();
    if (!user) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    // Strip out sensitive info (passwords, JWTs, Vapi Keys) before sending to client UI
    const safeUser = {
      _id: user._id,
      name: user.name,
      targetDomain: user.targetDomain,
      seoEngine: user.seoEngine,
      seoAutomation: user.seoAutomation || false
    };

    return NextResponse.json({ client: safeUser });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ clientId: string }> }) {
  try {
    const params = await context.params;
    const body = await request.json();
    await connectToDatabase();
    
    // Only permit explicit overrides of the seoAutomation switch from client UI
    const updatePayload: any = {};
    if (typeof body.seoAutomation === 'boolean') {
      updatePayload.seoAutomation = body.seoAutomation;
    }

    const updatedUser = await User.findByIdAndUpdate(
      params.clientId, 
      { $set: updatePayload }, 
      { new: true }
    ).lean();
    
    if (!updatedUser) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, seoAutomation: updatedUser.seoAutomation });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
