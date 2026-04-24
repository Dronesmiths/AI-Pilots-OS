import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import User from '@/models/User';

export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const { userId, slug } = await req.json();

        if (!userId || !slug) {
            return NextResponse.json({ error: 'Missing userId or slug' }, { status: 400 });
        }

        const user = await User.findById(userId);
        if (!user) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const imgToDelete = user.imageLibrary?.find((img: any) => img.slug === slug);

        if (imgToDelete) {
            const githubOwner = user.githubOwner || 'Dronesmiths';
            const githubRepo  = user.githubRepo  || 'Urban-Design';
            const token = process.env.GITHUB_TOKEN?.replace(/\\n/g, '').trim();

            if (token) {
                // Fetch sitemap-images.xml from GitHub
                const sitemapPath = 'public/sitemap-images.xml';
                const sitemapRes = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${sitemapPath}`, {
                    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'AI-Pilots-CRM' }
                });

                if (sitemapRes.ok) {
                    const sitemapData = await sitemapRes.json();
                    let xml = Buffer.from(sitemapData.content, 'base64').toString('utf8');

                    // Find the URL to remove
                    const imgUrl = imgToDelete.githubUrl || imgToDelete.replicateUrl;
                    if (imgUrl) {
                        const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const regex = new RegExp(`<url>[\\s\\S]*?<image:loc>${escapeRegex(imgUrl)}<\/image:loc>[\\s\\S]*?<\/url>\\s*`, 'g');
                        
                        if (xml.match(regex)) {
                            xml = xml.replace(regex, '');

                            // Push updated XML back to GitHub
                            await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${sitemapPath}`, {
                                method: 'PUT',
                                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Pilots-CRM' },
                                body: JSON.stringify({
                                    message: `fix(seo): remove deleted image ${slug} from sitemap`,
                                    content: Buffer.from(xml).toString('base64'),
                                    sha: sitemapData.sha
                                })
                            });
                        }
                    }
                }
            }

            // Remove the image from the user's library
            user.imageLibrary = user.imageLibrary.filter((img: any) => img.slug !== slug);
            await user.save();
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
