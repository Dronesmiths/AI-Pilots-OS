import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import User from '@/models/User';

// Helper to sanitize XML strings
const escapeXml = (unsafe: string) => {
    return unsafe.replace(/[<>&'"]/g, (c: string) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: return c;
        }
    });
};

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const userId = searchParams.get('userId');
        const type = searchParams.get('type') || 'index';

        if (!userId) {
            return new NextResponse('Missing userId parameter', { status: 400 });
        }

        if (!mongoose.connections[0].readyState) {
            await mongoose.connect(process.env.MONGODB_URI as string);
        }

        const user = await User.findById(userId).lean();
        if (!user) {
            return new NextResponse('User not found', { status: 404 });
        }

        const liveDomain = (user.targetDomain || user.seoEngine || '').replace(/^https?:\/\//i, '').replace(/\/$/, '');
        if (!liveDomain) {
            return new NextResponse('User domain not configured', { status: 400 });
        }
        const baseUrl = `https://${liveDomain}`;

        const ghostOnly = searchParams.get('ghostOnly') === 'true';

        // Get all live CRM nodes that match the requested state (Google VS QA)
        const activeNodes = (user.seoClusters || []).filter((c: any) => 
            (c.status === 'live' || c.status === 'Live' || c.status === 'published' || c.status === 'generated') && 
            (ghostOnly ? c.isLlmQA : true)
        );

        // ============================================
        // 1. GENERATE THE ROOT SITEMAP INDEX
        // ============================================
        if (type === 'index') {
            // Google loves partitioned sitemaps. We divide by our architectural matrices.
            const sitemapIndexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=core${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=service${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=location${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=cornerstone${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=authority${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=blog${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
    <sitemap>
        <loc>${baseUrl}/api/public/seo/sitemap?userId=${userId}&amp;type=image${ghostOnly ? '&amp;ghostOnly=true' : ''}</loc>
        <lastmod>${new Date().toISOString()}</lastmod>
    </sitemap>
</sitemapindex>`;

            return new NextResponse(sitemapIndexXml, {
                status: 200,
                headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
            });
        }

        // ============================================
        // 2. GENERATE IMAGE SITEMAP
        // ============================================
        if (type === 'image') {
            let imgBlocks = '';
            for (const node of activeNodes) {
                if (!node.heroImage && !node.midImage) continue;

                const slug = (node.keyword || node.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                const locUrl = `${baseUrl}/${slug}`;
                
                let imagesXml = '';
                if (node.heroImage) {
                    imagesXml += `
        <image:image>
            <image:loc>${escapeXml(node.heroImage)}</image:loc>
            <image:title>${escapeXml(node.heroAlt || node.keyword || 'Hero Image')}</image:title>
        </image:image>`;
                }
                if (node.midImage) {
                    imagesXml += `
        <image:image>
            <image:loc>${escapeXml(node.midImage)}</image:loc>
            <image:title>${escapeXml(node.midAlt || node.keyword || 'Context Image')}</image:title>
        </image:image>`;
                }

                imgBlocks += `
    <url>
        <loc>${escapeXml(locUrl)}</loc>${imagesXml}
    </url>`;
            }

            const imgSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${imgBlocks}
</urlset>`;

            return new NextResponse(imgSitemapXml, {
                status: 200,
                headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
            });
        }

        // ============================================
        // 2. GENERATE CATEGORIZED SUB-SITEMAPS
        // ============================================
        const validCategories = ['core', 'service', 'location', 'cornerstone', 'blog', 'gmb', 'authority', 'qa'];
        if (!validCategories.includes(type)) {
            return new NextResponse('Invalid sitemap type requested', { status: 400 });
        }

        // Filter nodes for the requested partition
        const partitionNodes = activeNodes.filter((c: any) => 
            (type === 'authority' ? (c.authorityMetadata?.status === 'published' || c.category === 'authority') : (c.category === type || (!c.category && type === 'service')))
        );

        let urlBlocks = '';
        const now = new Date().toISOString();

        for (const node of partitionNodes) {
            const slug = (node.keyword || node.target || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const locUrl = `${baseUrl}/${slug}`;
            
            // Priority logic based on Google best practices
            let priority = '0.7';
            if (type === 'core') priority = '1.0';
            if (type === 'authority' || type === 'cornerstone') priority = '0.9';
            if (type === 'service') priority = '0.8';

            urlBlocks += `
    <url>
        <loc>${escapeXml(locUrl)}</loc>
        <lastmod>${node.pushedAt ? new Date(node.pushedAt).toISOString() : now}</lastmod>
        <changefreq>${type === 'blog' ? 'weekly' : 'monthly'}</changefreq>
        <priority>${priority}</priority>
    </url>`;
        }

        const subSitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlBlocks}
</urlset>`;

        return new NextResponse(subSitemapXml, {
            status: 200,
            headers: { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=3600' }
        });

    } catch (e: any) {
        return new NextResponse(`Internal Sitemap Generation Error: ${e.message}`, { status: 500 });
    }
}
