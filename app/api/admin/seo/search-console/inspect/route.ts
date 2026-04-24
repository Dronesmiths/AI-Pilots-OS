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

        const { userId, inspectionUrl } = await req.json();
        if (!userId || !inspectionUrl) {
            return NextResponse.json({ error: 'Missing userId or inspectionUrl parameter' }, { status: 400 });
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
        // Strip surrounding quotes Vercel may add
        rawCreds = rawCreds.trim();
        if ((rawCreds.startsWith("'") && rawCreds.endsWith("'")) || 
            (rawCreds.startsWith('"') && rawCreds.endsWith('"') && !rawCreds.startsWith('{"'))) {
            rawCreds = rawCreds.slice(1, -1);
        }
        // Sanitize control characters
        rawCreds = rawCreds.replace(/[\u0000-\u001F]/g, (match) => {
            if (match === '\n') return '\\n';
            if (match === '\r') return '';
            if (match === '\t') return '\\t';
            return '';
        });
        // Handle double-escaped newlines from Vercel env
        rawCreds = rawCreds.replace(/\\\\n/g, '\\n');
        
        let credentialsObj: any = {};
        try {
            credentialsObj = JSON.parse(rawCreds);
        } catch (e: any) {
            console.error("[GSC] GOOGLE_CREDENTIALS_JSON parse error:", e.message, "| first 100 chars:", rawCreds.slice(0, 100));
            return NextResponse.json({ error: "Could not parse GOOGLE_CREDENTIALS_JSON in CRM.", detail: e.message }, { status: 500 });
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
        
        // Try sc-domain first, then fall back to https:// URL prefix
        const propertiesToTry = [
            `sc-domain:${cleanedDomain}`,
            `https://${cleanedDomain}/`,
            `https://www.${cleanedDomain}/`,
        ];

        let lastError: any = null;
        for (const siteUrlProp of propertiesToTry) {
            try {
                console.log(`[GSC INSPECT] Trying property: ${siteUrlProp} for URL: ${inspectionUrl}`);

                const response = await searchconsole.urlInspection.index.inspect({
                    requestBody: {
                        inspectionUrl: inspectionUrl,
                        siteUrl: siteUrlProp,
                        languageCode: "en-US"
                    }
                });

                const indexStatus = response.data?.inspectionResult?.indexStatusResult;
                const coverage = indexStatus?.coverageState || '';
                const verdict = indexStatus?.verdict || '';
                const isIndexed = verdict === 'PASS' || coverage.toLowerCase().includes('indexed');

                return NextResponse.json({
                    success: true,
                    inspectionUrl: inspectionUrl,
                    isIndexed: isIndexed,
                    verdict: verdict,
                    coverageState: coverage,
                    propertyUsed: siteUrlProp
                });
            } catch (err: any) {
                lastError = err;
                const msg = err?.response?.data?.error?.message || err.message || '';
                console.warn(`[GSC INSPECT] Property ${siteUrlProp} failed: ${msg}`);
                // If it's a permissions error, try the next property format
                if (msg.includes('do not own') || msg.includes('not part of')) {
                    continue;
                }
                // For other errors (rate limit, etc.), don't retry
                break;
            }
        }

        // All properties failed
        if (lastError?.response?.status === 429) {
            return NextResponse.json({ error: 'Google URL Inspection API Quota Exceeded (Max 2000/day).', quotaExceeded: true }, { status: 429 });
        }
        
        const errMsg = lastError?.response?.data?.error?.message || lastError?.message || 'Unknown error';
        console.error(`[GSC INSPECT] All property formats failed for ${cleanedDomain}: ${errMsg}`);
        return NextResponse.json({ 
            error: `URL Inspection Failed: ${errMsg}`,
            propertiesTried: propertiesToTry 
        }, { status: 500 });
    } catch (error: any) {
        console.error("[GSC INSPECT ERROR]", error?.response?.data || error.message);
        
        // Check for common quota errors
        if (error?.response?.status === 429) {
             return NextResponse.json({ error: 'Google URL Inspection API Quota Exceeded (Max 2000/day).', quotaExceeded: true }, { status: 429 });
        }
        
        return NextResponse.json({ error: `URL Inspection Failed: ${error.message}` }, { status: 500 });
    }
}
