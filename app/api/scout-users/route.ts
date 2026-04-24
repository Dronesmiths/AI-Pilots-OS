import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

// Minimum queued items before auto-refuel fires (≈ 14 days of content)
const REFUEL_THRESHOLDS: Record<string, number> = {
    qa: 42, location: 7, blog: 7, cornerstone: 2
};

export async function GET(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await connectToDatabase();
        
        const usersData = await User.find({ seoAutomation: true })
            .select('_id name targetDomain brandTheme targetServiceAreas seoClusters onboardingConfig adsBaseServices githubOwner githubRepo')
            .lean();

        const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.aipilots.site';

        const users = await Promise.all(usersData.map(async (u: any) => {
            const queued = (u.seoClusters || []).filter((c: any) => c.status === 'queued');

            // Count queued items per category
            const fuel: Record<string, number> = { qa: 0, location: 0, blog: 0, cornerstone: 0 };
            for (const c of queued) {
                const cat = c.category || '';
                if (c.isLlmQA || ['qa', 'llm', 'paa'].includes(cat)) fuel.qa++;
                else if (['location', 'service'].includes(cat)) fuel.location++;
                else if (cat === 'blog') fuel.blog++;
                else if (cat === 'cornerstone') fuel.cornerstone++;
            }

            // Auto-refuel any low categories (fire-and-forget — doesn't block scout response)
            const lowCategories = Object.entries(REFUEL_THRESHOLDS)
                .filter(([cat, threshold]) => fuel[cat] < threshold)
                .map(([cat]) => cat);

            if (lowCategories.length > 0) {
                console.log(`[Scout] Low fuel for ${u.targetDomain}: ${lowCategories.join(', ')} — auto-refueling`);
                // Fire-and-forget: don't await, let it run in background
                fetch(`${baseUrl}/api/admin/seo/auto-refuel`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ secret: process.env.SCOUT_SECRET, userId: u._id.toString() })
                }).catch(err => console.error(`[Scout AutoRefuel Error] ${u.targetDomain}:`, err));
            }

            const seed = u.onboardingConfig?.seedKeywords || u.adsBaseServices || 'Local Services';
            const niche = Array.isArray(seed) ? seed[0] : (typeof seed === 'string' ? seed.split(',')[0] : 'Local Services');

            return {
                _id: u._id,
                name: u.name,
                targetDomain: u.targetDomain,
                targetServiceAreas: u.targetServiceAreas,
                githubOwner: u.githubOwner,
                githubRepo: u.githubRepo,
                niche,
                queueCount: queued.length,
                fuel,
                low_fuel: lowCategories,
                auto_refueling: lowCategories.length > 0
            };
        }));

        return NextResponse.json({ success: true, count: users.length, users });
    } catch (e: any) {
        console.error("DRONE SCOUT ERROR:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
