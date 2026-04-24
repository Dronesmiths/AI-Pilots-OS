import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');

        if (!userId) return new NextResponse('Missing userId parameter', { status: 400 });

        if (!mongoose.connections[0].readyState) {
            await mongoose.connect(process.env.MONGODB_URI as string);
        }

        const user = await User.findById(userId).lean();
        if (!user) return new NextResponse('User not found', { status: 404 });

        const liveDomain = (user.targetDomain || user.seoEngine || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
        if (!liveDomain) return new NextResponse('User domain not configured', { status: 400 });
        const baseUrl = `https://${liveDomain}`;

        const ghostOnly = searchParams.get('ghostOnly') === 'true';

        const activeNodes = (user.seoClusters || []).filter((c: any) => 
            (c.status === 'live' || c.status === 'Live' || c.status === 'published' || c.status === 'generated') && 
            (!ghostOnly || c.isLlmQA)
        );

        let markdown = `# ${user.firstName || 'Client'} - Semantic Knowledge Graph\n\n`;
        if (ghostOnly) {
           markdown += `> 👻 **[GHOST MODE ISOLATION ACTIVE]** This feed explicitly exposes ONLY the hyper-niche nodes designed specifically for AI-RAG agents while concurrently hidden from Search Engines.\n\n`;
        } else {
           markdown += `> This \`llms.txt\` document provides a machine-readable structural map of the entire knowledge base architecture designed specifically for autonomous web crawlers, OpenAI GPTBots, and RAG vector ingestion.\n\n`;
        }

        const grouped: Record<string, any[]> = { core: [], service: [], location: [], cornerstone: [], blog: [], gmb: [] };
        
        for (const node of activeNodes) {
             const cat = node.category || 'service';
             if (grouped[cat]) grouped[cat].push(node);
        }

        for (const [cat, nodes] of Object.entries(grouped)) {
             if (nodes.length === 0) continue;
             markdown += `## ${cat.toUpperCase()} NETWORK MATRIX\n`;
             for (const node of nodes) {
                 const slug = (node.keyword || node.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                 markdown += `- [${node.keyword || node.target}](${baseUrl}/${slug})\n`;
             }
             markdown += `\n`;
        }

        return new NextResponse(markdown.trim(), {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
        });

    } catch (e: any) {
        return new NextResponse(`Internal LLM Generation Error: ${e.message}`, { status: 500 });
    }
}
