import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        console.warn(`[DRONE API] Rejecting unauthorized GET /api/seo-clusters`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await connectToDatabase();
        
        const users = await User.find({ seoAutomation: true }).lean();
        
        const payload: any[] = [];
        for (const user of users) {
             if (user.seoClusters && Array.isArray(user.seoClusters)) {
                 for (const cluster of user.seoClusters) {
                      payload.push({
                          userId: user._id, 
                          clusterId: cluster._id,
                          slug: cluster.slug,
                          keyword: cluster.keyword,
                          target: cluster.target,
                          clientName: user.name,
                          category: cluster.category,
                          targetLocations: cluster.targetLocations,
                          location: cluster.location,
                          schemaPreGenerated: cluster.schemaPreGenerated,
                          imagesPreGenerated: cluster.imagesPreGenerated,
                          faqsPreGenerated: cluster.faqsPreGenerated,
                          internalLinksPreGenerated: cluster.internalLinksPreGenerated,
                          backlinksPreGenerated: cluster.backlinksPreGenerated,
                          schemaPayload: cluster.schemaPayload,
                          faqsPayload: cluster.faqsPayload,
                          internalLinksPayload: cluster.internalLinksPayload,
                          backlinksPayload: cluster.backlinksPayload,
                          dailyLimit: user.dailyPageProductionLimit || 5,
                          htmlContent: cluster.htmlContent,
                          status: cluster.status,
                          githubOwner: user.githubOwner,
                          githubRepo: user.githubRepo,
                          pushedAt: cluster.pushedAt,
                          lastDeployAttempt: cluster.lastDeployAttempt,
                          authorityMetadata: cluster.authorityMetadata,
                          backlinkMetadata: cluster.backlinkMetadata,
                          pageBuilderTemplates: user.pageBuilderTemplates
                      });
                 }
             }
        }

        return NextResponse.json({ success: true, count: payload.length, clusters: payload });
    } catch (e: any) {
        console.error("[GET seo-clusters] Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
