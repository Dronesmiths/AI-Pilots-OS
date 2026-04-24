import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export async function PATCH(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        console.warn(`[DRONE API] Rejecting unauthorized PATCH /api/update-cluster`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { userId, clusterId, updates } = await req.json();
        
        if (!userId || !clusterId || !updates) {
             return NextResponse.json({ error: "Missing userId, clusterId, or updates object" }, { status: 400 });
        }

        await connectToDatabase();
        
        // --- STRICT PIPELINE GUARDRAILS ---
        if (updates.status === 'completed' || updates.status === 'ready') {
             // 1. We must verify the final resulting htmlContent.
             // If it's not provided in the patch, we fetch the existing db record natively.
             let targetHtml = updates.htmlContent;
             let category = updates.category;
             
             // Fetch cluster document to verify targetHtml or category
             const userDoc = await User.findOne({ _id: userId, "seoClusters._id": clusterId }, { "seoClusters.$": 1 }).lean();
             if (!userDoc || !userDoc.seoClusters || userDoc.seoClusters.length === 0) {
                  return NextResponse.json({ error: "Cannot validate status: Cluster not found." }, { status: 404 });
             }
             
             if (!targetHtml) {
                 targetHtml = userDoc.seoClusters[0].htmlContent;
             }
             if (!category) {
                 category = userDoc.seoClusters[0].category;
             }

             if (category === 'qa') {
                 if (!targetHtml || targetHtml.length < 200) {
                      return NextResponse.json({ 
                          error: "Strict Pipeline Violation: QA snippets must be at least 200 characters.",
                          providedLength: targetHtml ? targetHtml.length : 0 
                      }, { status: 422 });
                 }
             } else {
                 if (!targetHtml || targetHtml.length <= 1000) {
                      return NextResponse.json({ 
                          error: "Strict Pipeline Violation: Cannot promote status to completed without >1000 char length.",
                          providedLength: targetHtml ? targetHtml.length : 0 
                      }, { status: 422 });
                 }
             }
        }
        
        // Dynamically build the $set payload
        const setQuery: any = {};
        for (const [key, value] of Object.entries(updates)) {
            setQuery[`seoClusters.$.${key}`] = value;
        }

        const result = await User.updateOne(
            { _id: userId, "seoClusters._id": clusterId },
            { $set: setQuery },
            { strict: false }
        );

        if (result.matchedCount === 0) {
             return NextResponse.json({ error: "User or Cluster not found." }, { status: 404 });
        }
        
        console.log(`[DRONE API] PATCH /update-cluster - Updated [User: ${userId}] / [Cluster: ${clusterId}] successfully`);

        return NextResponse.json({ success: true, message: "Cluster successfully patched", modifiedCount: result.modifiedCount, updatedFields: Object.keys(updates) });
    } catch (e: any) {
        console.error("[PATCH update-cluster] Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
