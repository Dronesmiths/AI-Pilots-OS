import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import User from '@/models/User';

export const maxDuration = 60;

/**
 * POST /api/admin/seo/save-image-to-library
 * Saves an approved image from Replicate CDN to GitHub drone-images/
 * and logs it in the user's imageLibrary with ImageObject JSON-LD.
 *
 * Body: { userId, imageUrl, keyword, slug }
 */
export async function POST(req: NextRequest) {
    try {
        await dbConnect();
        const { userId, imageUrl, keyword, slug } = await req.json();
        if (!userId || !imageUrl) return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });

        const user = await User.findById(userId).select('githubOwner githubRepo targetDomain imageLibrary');
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const githubOwner = user.githubOwner || 'Dronesmiths';
        const githubRepo  = user.githubRepo  || 'Urban-Design';
        const domain      = user.targetDomain || 'urbanhomeremodel.com';
        const imageSlug   = slug || keyword?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `seo-image-${Date.now()}`;
        const filePath    = `public/drone-images/${imageSlug}.webp`;
        const githubUrl   = `https://${domain}/drone-images/${imageSlug}.webp`;

        // 1. Download image from Replicate CDN
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
        const buffer = Buffer.from(await imgRes.arrayBuffer());

        // 2. Push to GitHub via Tree API
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error('GITHUB_TOKEN not configured');

        // Get current commit SHA
        const refRes = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/ref/heads/main`,
            { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'AI-Pilots-CRM' } }
        );
        const refData = await refRes.json();
        const baseTreeSha = refData?.object?.sha;

        // Create blob
        const blobRes = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/blobs`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Pilots-CRM' },
                body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' })
            }
        );
        const blobData = await blobRes.json();

        // Get base tree SHA
        const commitRes = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/commits/${baseTreeSha}`,
            { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'AI-Pilots-CRM' } }
        );
        const commitData = await commitRes.json();

        // Create tree
        const treeRes = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/trees`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Pilots-CRM' },
                body: JSON.stringify({
                    base_tree: commitData.tree?.sha,
                    tree: [{ path: filePath, mode: '100644', type: 'blob', sha: blobData.sha }]
                })
            }
        );
        const treeData = await treeRes.json();

        // Create commit
        const newCommitRes = await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/commits`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Pilots-CRM' },
                body: JSON.stringify({
                    message: `feat(images): add SEO image "${keyword}" to library`,
                    tree: treeData.sha,
                    parents: [baseTreeSha]
                })
            }
        );
        const newCommit = await newCommitRes.json();

        // Update HEAD
        await fetch(
            `https://api.github.com/repos/${githubOwner}/${githubRepo}/git/refs/heads/main`,
            {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'AI-Pilots-CRM' },
                body: JSON.stringify({ sha: newCommit.sha })
            }
        );

        // 3. Build ImageObject JSON-LD for SEO indexing
        const imageSchema = {
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            'name': keyword || imageSlug,
            'url': githubUrl,
            'contentUrl': githubUrl,
            'description': `Professional SEO image for "${keyword}" — ${domain}`,
            'encodingFormat': 'image/webp',
            'license': `https://${domain}`,
            'creator': { '@type': 'Organization', 'name': domain },
            'dateCreated': new Date().toISOString().split('T')[0],
            'keywords': keyword
        };

        // 4. Save to user.imageLibrary in MongoDB
        const libraryEntry = {
            slug: imageSlug,
            keyword,
            githubUrl,
            replicateUrl: imageUrl,
            schema: imageSchema,
            savedAt: new Date(),
            status: 'library'
        };

        await User.findByIdAndUpdate(userId, {
            $push: { imageLibrary: libraryEntry }
        });

        return NextResponse.json({
            success: true,
            slug: imageSlug,
            githubUrl,
            schema: imageSchema,
            message: `✅ Image saved to library: /drone-images/${imageSlug}.webp`
        });

    } catch (err: any) {
        console.error('[SaveImageToLibrary Error]:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

/**
 * GET /api/admin/seo/save-image-to-library?userId=xxx
 * Fetch the user's saved image library
 */
export async function GET(req: NextRequest) {
    try {
        await dbConnect();
        const userId = req.nextUrl.searchParams.get('userId');
        if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

        const user = await User.findById(userId).select('imageLibrary');
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        return NextResponse.json({ success: true, library: user.imageLibrary || [] });
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
