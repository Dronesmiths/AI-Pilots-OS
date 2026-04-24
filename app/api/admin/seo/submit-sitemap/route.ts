import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import User from '@/models/User';
import connectToDatabase from '@/lib/mongodb';

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized. Drone API Key required.' }, { status: 401 });
        }
        
        const token = authHeader.split(' ')[1];
        if (token !== process.env.DRONE_API_KEY) {
            return NextResponse.json({ error: 'Invalid Drone Authorization Signature.' }, { status: 401 });
        }

        const { userId, sitemapUrl } = await req.json();
        if (!userId || !sitemapUrl) {
            return NextResponse.json({ error: 'Missing userId or sitemapUrl parameter' }, { status: 400 });
        }

        await connectToDatabase();
        const user = await User.findById(userId).lean();
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        let targetDomain = user.targetDomain;
        if (!targetDomain && typeof user.seoEngine === 'string' && user.seoEngine !== 'true' && user.seoEngine !== 'false') {
            targetDomain = user.seoEngine;
        }

        if (!targetDomain) {
            return NextResponse.json({ error: 'No target domain set for this client in the CRM' }, { status: 400 });
        }

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
        } catch (e) {
            return NextResponse.json({ error: "Could not parse GOOGLE_CREDENTIALS_JSON in CRM." }, { status: 500 });
        }

        if (!credentialsObj.client_email || !credentialsObj.private_key) {
            return NextResponse.json({ error: "Missing valid GOOGLE_CREDENTIALS_JSON payload in CRM backend." }, { status: 500 });
        }

        const auth = new google.auth.GoogleAuth({
            credentials: credentialsObj,
            scopes: ['https://www.googleapis.com/auth/webmasters']
        });
        
        const searchconsole = google.searchconsole({ version: 'v1', auth });

        const cleanedDomain = targetDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
        const siteUrl = `sc-domain:${cleanedDomain}`;

        console.log(`[GSC] Forcing Google to ingest sitemap: ${sitemapUrl} for Property ${siteUrl}`);

        const response = await searchconsole.sitemaps.submit({
            siteUrl: siteUrl,
            feedpath: sitemapUrl
        });

        return NextResponse.json({
            success: true,
            message: `Sitemap successfully submitted to Google Search Console for ${siteUrl}`,
            statusPhase: response.status
        });

    } catch (error: any) {
        console.error("[GSC AUTO-INDEX ERROR]", error);
        return NextResponse.json({ error: `Sitemap Submission Failed: ${error.message}` }, { status: 500 });
    }
}
