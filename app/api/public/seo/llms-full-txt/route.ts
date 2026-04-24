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

        const ghostOnly = searchParams.get('ghostOnly') === 'true';

        const activeNodes = (user.seoClusters || []).filter((c: any) => 
            (c.status === 'live' || c.status === 'Live' || c.status === 'published' || c.status === 'generated') && 
            (!ghostOnly || c.isLlmQA)
        );

        let markdown = `# ${user.firstName || 'Client'} - Unified Knowledge Base (llms-full.txt)\n\n`;
        if (ghostOnly) {
           markdown += `> 👻 **[GHOST MODE ISOLATION ACTIVE]** This master document isolates the massive textual payload of exclusively hidden RAG content designed to bypass Google and inject absolute domain authority strictly into Large Language Models.\n\n---\n\n`;
        } else {
           markdown += `> This master document contains the entire semantic content architecture of the website concatenated into a single stream for zero-shot RAG ingestion by Large Language Models.\n\n---\n\n`;
        }

        for (const node of activeNodes) {
             markdown += `## URL PATH: /${(node.keyword || node.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}\n`;
             markdown += `### ARCHITECTURE HUB: ${node.title || node.target}\n\n`;
             if (node.content) {
                 // Strip basic HTML if stored as HTML to keep it clean readable markdown
                 const cleanContent = node.content.replace(/<[^>]*>?/gm, '');
                 markdown += `${cleanContent}\n\n`;
             } else {
                 markdown += `[Content unavailable or pending generation]\n\n`;
             }
             markdown += `---\n\n`;
        }

        return new NextResponse(markdown.trim(), {
            status: 200,
            headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' }
        });

    } catch (e: any) {
        return new NextResponse(`Internal Full LLM Generation Error: ${e.message}`, { status: 500 });
    }
}
