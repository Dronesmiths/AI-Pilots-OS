import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { userId, url } = body;

        if (!userId || !url) {
            return NextResponse.json({ error: 'Missing core telemetry parameters' }, { status: 400, headers: corsHeaders });
        }

        await connectToDatabase();

        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ error: 'User mapping failed' }, { status: 404, headers: corsHeaders });
        }

        // Clean trailing slashes or queries from the requested URL to match slugs cleanly
        const parsedUrl = new URL(url, 'https://dummy.com'); // We just need the path
        const lookupSlug = parsedUrl.pathname.replace(/\/$/, ""); 

        // Cross-reference SEO Clusters
        let matchedCluster = null;
        if (user.seoClusters && user.seoClusters.length > 0) {
            // Find a cluster holding this exact slug/url
            matchedCluster = user.seoClusters.find((cluster: any) => {
                if (!cluster.slug) return false;
                // e.g. client hits "/roofing-services", we look for "roofing-services" or "/roofing-services"
                const cleanClusterSlug = typeof cluster.slug === 'string' ? cluster.slug.replace(/\/$/, "") : "";
                return cleanClusterSlug === lookupSlug || `/${cleanClusterSlug}` === lookupSlug;
            });
        }

        // Construct Data Payload for the Frontend Stick
        const payload: any = {};

        // If we found a cluster matched to this exact page, see if we need to drop schema
        if (matchedCluster) {
            if (matchedCluster.faqSchema) {
                payload.faqSchema = matchedCluster.faqSchema;
            }
            
            // Increment telemetry logs (Analytics Engine)
            // Save time, clicks, impressions? That would be advanced, but for now we note session hits!
            matchedCluster.sessions = (matchedCluster.sessions || 0) + 1;
            
            // Fire-and-forget save the user so we track live metrics over time
            user.save().catch((e: any) => console.error("Failed to track telemetry stats:", e));
        }

        // Return universal configs (Things applied to every page on the site)
        if (user.vapiAgentId) {
             payload.agentId = user.vapiAgentId;
        }

        // Contextual Internal Linking payload broadcast
        // Sends mapping keywords to the Frontend Stick so it can dynamically interconnect the website content
        if (user.seoClusters && user.seoClusters.length > 0) {
            payload.internalLinks = user.seoClusters
                .filter((c: any) => c.keyword && c.slug)
                .map((c: any) => ({ 
                    keyword: c.keyword, 
                    target: typeof c.slug === 'string' && c.slug.startsWith('/') ? c.slug : `/${c.slug}`
                }));
        }

        return NextResponse.json({ success: true, payload }, { status: 200, headers: corsHeaders });

    } catch (error: any) {
        console.error('Stick Telemetry Handshake Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders });
    }
}
