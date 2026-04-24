import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        console.warn(`[DRONE API] Rejecting unauthorized POST /api/publish-status`);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { userId, clusterId, status } = await req.json();
        
        if (!userId || !clusterId || !status) {
             return NextResponse.json({ error: "Missing userId, clusterId, or status" }, { status: 400 });
        }

        // Standardized mapping, tracking either the internal state or validation state
        const validStatuses = ["publishing", "Live", "publish_failed", "queued", "draft"];
        if (!validStatuses.includes(status)) {
             return NextResponse.json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` }, { status: 400 });
        }

        await connectToDatabase();

        // --- STRICT PIPELINE GUARDRAILS ---
        if (status === 'publishing' || status === 'Live') {
             // We MUST verify the payload structurally exists before allowing standard publishing
             const userDoc = await User.findOne({ _id: userId, "seoClusters._id": clusterId }, { "seoClusters.$": 1 }).lean();
             if (!userDoc || !userDoc.seoClusters || userDoc.seoClusters.length === 0) {
                  return NextResponse.json({ error: "Cannot validate status: Cluster not found." }, { status: 404 });
             }
             
             const targetHtml = userDoc.seoClusters[0].htmlContent;
             const category = userDoc.seoClusters[0].category;

             if (category === 'qa') {
                 if (!targetHtml || targetHtml.length < 200) {
                      return NextResponse.json({ 
                          error: "Strict Pipeline Violation: QA snippets must be at least 200 characters natively saved in the database.",
                          providedLength: targetHtml ? targetHtml.length : 0 
                      }, { status: 422 });
                 }
             } else {
                 if (!targetHtml || targetHtml.length <= 1000 || !targetHtml.includes('<section')) {
                      return NextResponse.json({ 
                          error: "Strict Pipeline Violation: Cannot promote status to publishing/Live without absolute structural markup and >1000 char length natively saved in the database.",
                          providedLength: targetHtml ? targetHtml.length : 0 
                      }, { status: 422 });
                 }
             }
        }

        const result = await User.updateOne(
            { _id: userId, "seoClusters._id": clusterId },
            { 
               $set: { 
                   "seoClusters.$.status": status,
                   ...(status === 'Live' ? { "seoClusters.$.pushedAt": new Date() } : {})
               }
            }
        );

        if (result.matchedCount === 0) {
             return NextResponse.json({ error: "User or Cluster not found." }, { status: 404 });
        }
        
        console.log(`[DRONE API] POST /publish-status - Updated [User: ${userId}] / [Cluster: ${clusterId}] to status [${status}] successfully`);

        return NextResponse.json({ success: true, message: `Status updated to ${status}` });
    } catch (e: any) {
        console.error("[POST publish-status] Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
