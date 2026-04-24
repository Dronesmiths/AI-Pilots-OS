import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized. Emergency lock engaged.' }, { status: 401 });
    }

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    
    // Verify master admin signature
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') {
        throw new Error('Insufficient privileges');
      }
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    const body = await req.json();
    const { name, domain, email, notes } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: 'Client Name and Domain are strictly required.' }, { status: 400 });
    }

    await connectToDatabase();

    // Fallback email if omitted (UserSchema requires email)
    const finalEmail = email?.trim() || `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now()}@shadow-client.local`;

    // Check if user somehow already exists
    const existing = await User.findOne({ email: finalEmail.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: 'A client with this email already exists in MongoDB.' }, { status: 400 });
    }

    const newClient = await User.create({
      name: name.trim(),
      email: finalEmail.toLowerCase(),
      targetDomain: domain.trim(),
      clientArchitectureNotes: notes?.trim() || '',
      referralCode: `AIP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      seoClusters: [],
      seoAutomation: false,
      seoEngine: 'idle',
      onboardingConfig: {
        status: 'created',
        updatedAt: new Date()
      }
    });

    return NextResponse.json({ success: true, client: newClient });

  } catch (error: any) {
    console.error("[ADMIN CREATE CLIENT ERROR]", error.message);
    return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 });
  }
}
