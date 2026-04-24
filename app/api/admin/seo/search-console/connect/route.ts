import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('admin_token')?.value;
    if (!token) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

    const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-for-local-dev';
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;
      if (decoded.role !== 'superadmin') throw new Error('Insufficient privileges');
    } catch (e) {
      return NextResponse.json({ error: 'Invalid master key signature.' }, { status: 401 });
    }

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId).lean();
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let rawCreds = process.env.GOOGLE_CREDENTIALS_JSON || '{}';
    rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, (match) => {
        if (match === '\n') return '\\n';
        if (match === '\r') return '';
        if (match === '\t') return '\\t';
        return '';
    });
    
    let credentialsObj: any = {};
    try {
        credentialsObj = JSON.parse(rawCreds);
        if (credentialsObj.private_key) {
            credentialsObj.private_key = credentialsObj.private_key.replace(/\\n/g, '\n');
        }
    } catch (e) {
        return NextResponse.json({ error: 'System missing valid GOOGLE_CREDENTIALS_JSON' }, { status: 500 });
    }

    if (!credentialsObj.client_email || !credentialsObj.private_key) {
        return NextResponse.json({ error: 'GOOGLE_CREDENTIALS_JSON missing vital keys' }, { status: 500 });
    }

    let targetDomain = user.targetDomain;
    if (!targetDomain && typeof user.seoEngine === 'string' && user.seoEngine !== 'true' && user.seoEngine !== 'false') {
        targetDomain = user.seoEngine;
    }
    if (!targetDomain) {
      return NextResponse.json({ error: 'No Target Domain configured for this client.' }, { status: 400 });
    }

    // Force https URL-Prefix property per user's strict requirement
    const cleanedDomain = targetDomain.trim().replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
    const siteUrl = `https://${cleanedDomain}/`;

    // Crucially requires the full webmasters scope to inject new sites
    const auth = new google.auth.GoogleAuth({
      credentials: credentialsObj,
      scopes: ['https://www.googleapis.com/auth/webmasters']
    });
    
    const searchconsole = google.searchconsole({ version: 'v1', auth });

    try {
      await searchconsole.sites.add({ siteUrl });
    } catch (e: any) {
      console.warn(`[GSC CONNECT FAILED] ${e.message}`);
      return NextResponse.json({ error: `GSC Connect Failed: ${e.message}` }, { status: 500 });
    }

    return NextResponse.json({
       success: true,
       message: `Successfully bound URL property: ${siteUrl}`,
       siteUrl
    });
    
  } catch (error: any) {
    console.error("[GSC CONNECT ERROR]", error);
    return NextResponse.json({ error: `Connection execution failed: ${error.message}` }, { status: 500 });
  }
}
