import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import User from '@/models/User';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
    try {
        await dbConnect();
        const userId = req.nextUrl.searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

        const user = await User.findById(userId).select('targetDomain imageLibrary');
        if (!user || !user.targetDomain) return NextResponse.json({ error: 'User or targetDomain not found' }, { status: 404 });

        const baseUrl = user.targetDomain.startsWith('http') ? user.targetDomain : `https://${user.targetDomain}`;
        
        let images: any[] = [];
        const existingSlugs = new Set((user.imageLibrary || []).map((img: any) => img.slug));

        // 1. Try Image Sitemap First
        const imageSitemapUrl = `${baseUrl}/sitemap-images.xml`;
        try {
            const imgSitemapRes = await fetch(imageSitemapUrl);
            if (imgSitemapRes.ok) {
                const xml = await imgSitemapRes.text();
                const imageLocs = [...xml.matchAll(/<image:loc>([^<]+)<\/image:loc>/g)].map(m => m[1]);
                
                imageLocs.forEach(src => {
                    if (!src.match(/\.(webp|jpg|jpeg|png)$/i)) return;
                    const slug = `site-${src.split('/').pop()?.split('.')[0]}`;
                    const alt = slug.replace('site-', '').replace(/-/g, ' ');

                    if (!existingSlugs.has(slug)) {
                        images.push({
                            replicateUrl: src,
                            githubUrl: src,
                            keyword: alt,
                            slug: slug,
                            savedAt: new Date(),
                            status: 'library'
                        });
                        existingSlugs.add(slug);
                    }
                });
            }
        } catch { /* proceed to fallback */ }


        if (images.length > 0) {
            if (!user.imageLibrary) user.imageLibrary = [];
            user.imageLibrary.push(...images);
            await user.save();
        }

        return NextResponse.json({ success: true, count: images.length, images });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
