import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";
import mongoose from "mongoose";

export const dynamic = 'force-dynamic';

/**
 * GET /api/seo-clusters/queue
 *
 * Scale-safe aggregation queue for all drones.
 *
 * Params:
 *   status          comma-separated statuses to match
 *   category        comma-separated categories
 *   limit           max results per page (default 10, hard-cap 200)
 *   skip            cursor offset for pagination (default 0) ← NEW
 *   requireAssets   true = only clusters with all pre-gen flags set
 *   requireSync     true = only clusters with githubSyncRequired = true
 *   userId          filter to a single tenant
 *   keywordTokens   comma-separated tokens for server-side overlap matching ← NEW
 *                   when provided, only returns clusters containing ≥1 token
 *                   avoids loading ALL 500 pages for internal link scoring
 *
 * Pagination example (repair drone internal links):
 *   page 1: ?status=published,Live&limit=100&skip=0
 *   page 2: ?status=published,Live&limit=100&skip=100
 *   ...until count < limit (done)
 */
export async function GET(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await connectToDatabase();
        
        const url  = new URL(req.url);
        const statuses       = url.searchParams.get("status")?.split(',') || [];
        const categories     = url.searchParams.get("category")?.split(',') || [];
        const rawLimit       = parseInt(url.searchParams.get("limit") || "10", 10);
        const limit          = Math.min(rawLimit, 200); // hard-cap at 200 — never pull unbounded
        const skip           = parseInt(url.searchParams.get("skip") || "0", 10);
        const requireAssets  = url.searchParams.get("requireAssets") === 'true';
        const requireSync    = url.searchParams.get("requireSync") === 'true';
        const targetUserId   = url.searchParams.get("userId");
        // keywordTokens: server-side overlap match — avoids loading full pool client-side
        const keywordTokens  = url.searchParams.get("keywordTokens")?.split(',').filter(t => t.length > 3) || [];

        // Build the match query dynamically for the unwound cluster array
        const clusterMatch: any = {};
        
        if (statuses.length > 0) {
            clusterMatch["seoClusters.status"] = { $in: statuses };
        }
        
        if (categories.length > 0) {
            clusterMatch["seoClusters.category"] = { $in: categories };
        }

        if (requireAssets) {
             clusterMatch["seoClusters.schemaPreGenerated"] = true;
             clusterMatch["seoClusters.imagesPreGenerated"] = true;
             clusterMatch["seoClusters.faqsPreGenerated"] = true;
             clusterMatch["seoClusters.internalLinksPreGenerated"] = true;
             clusterMatch["seoClusters.backlinksPreGenerated"] = true;
        }

        if (requireSync) {
            clusterMatch["seoClusters.githubSyncRequired"] = true;
            
            // STRICT CRM LOGIC: Stop Publisher from auto-publishing fresh drafts
            // until their mathematically calculated delay has elapsed.
            clusterMatch["$or"] = [
                 { "seoClusters.scheduledTime": { $lte: new Date().toISOString() } },
                 { "seoClusters.scheduledTime": { $exists: false } },
                 { "seoClusters.scheduledTime": null },
                 { "seoClusters.scheduledTime": "" }
            ];
        }

        // Server-side keyword token match — avoids client-side pool scan at scale
        // Used by repair drone Phase 1 to find related pages without loading all 500
        if (keywordTokens.length > 0) {
            clusterMatch["seoClusters.keywordTokens"] = { $in: keywordTokens };
        }

        // MongoDB Aggregation Pipeline
        const initialMatch: any = { seoAutomation: true };
        if (targetUserId && mongoose.Types.ObjectId.isValid(targetUserId)) {
            initialMatch._id = new mongoose.Types.ObjectId(targetUserId);
        }

        const pipeline: any[] = [
            { $match: initialMatch },
            // If checking sync, ensure user has GitHub keys
            ...(requireSync ? [{ $match: { githubOwner: { $exists: true, $ne: "" }, githubRepo: { $exists: true, $ne: "" } } }] : []),
            { $unwind: "$seoClusters" },
            { $match: clusterMatch }
        ];

        if (requireSync) {
            pipeline.push({ $match: { "seoClusters.htmlContent": { $exists: true, $type: "string", $ne: "" } } });
        }

        // Project exactly what the Drones expect, cutting RAM payload
        pipeline.push({
            $project: {
                _id: 0,
                userId: "$_id",
                clusterId: "$seoClusters._id",
                slug: "$seoClusters.slug",
                keyword: "$seoClusters.keyword",
                target: "$seoClusters.target",
                category: "$seoClusters.category",
                status: "$seoClusters.status",
                htmlContent: "$seoClusters.htmlContent",
                schemaPayload: "$seoClusters.schemaPayload",
                faqsPayload: "$seoClusters.faqsPayload",
                internalLinksPayload: "$seoClusters.internalLinksPayload",
                backlinksPayload: "$seoClusters.backlinksPayload",
                schemaPreGenerated: "$seoClusters.schemaPreGenerated",
                imagesPreGenerated: "$seoClusters.imagesPreGenerated",
                faqsPreGenerated: "$seoClusters.faqsPreGenerated",
                internalLinksPreGenerated: "$seoClusters.internalLinksPreGenerated",
                backlinksPreGenerated: "$seoClusters.backlinksPreGenerated",
                githubSyncRequired: "$seoClusters.githubSyncRequired",
                githubOwner: "$githubOwner",
                githubRepo: "$githubRepo",
                targetDomain: "$targetDomain",
                cloudflareApiToken: "$cloudflareApiToken",
                cloudflareAccountId: "$cloudflareAccountId",
                location: "$seoClusters.location",
                pushedAt: "$seoClusters.pushedAt",
                scheduledTime: "$seoClusters.scheduledTime",
                keywordTokens: "$seoClusters.keywordTokens",  // returned so drones can use for overlap scoring
                dailyLimit: { $ifNull: ["$dailyPageProductionLimit", 5] },
                // ── Repair Bay fields ─────────────────────────────────────
                repairStatus:    "$seoClusters.repairStatus",
                repairIssue:     "$seoClusters.repairIssue",
                imageHealth:     "$seoClusters.imageHealth",
                metaTitle:       "$seoClusters.metaTitle",
                metaDescription: "$seoClusters.metaDescription",
                pageMetrics:     "$seoClusters.pageMetrics",
                // ── Template skeleton — required by blog/cornerstone drones for full-page wrapping ─
                pageBuilderTemplates: "$pageBuilderTemplates",
                brandName:       "$businessInfo.businessName",
                brandColor:      "$businessInfo.brandColor",
            }
        });

        // Pagination: skip before limit
        // Hard-cap at 200 per page — never pull unbounded
        if (skip > 0) pipeline.push({ $skip: skip });
        pipeline.push({ $limit: limit });

        const payload = await User.aggregate(pipeline);

        return NextResponse.json({
            success: true,
            count:   payload.length,
            skip,
            limit,
            hasMore: payload.length === limit, // true = caller should fetch next page
            clusters: payload,
        });
    } catch (e: any) {
        console.error("[GET seo-clusters/queue] Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
