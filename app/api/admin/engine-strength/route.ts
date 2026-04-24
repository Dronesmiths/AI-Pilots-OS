import { NextResponse }    from "next/server";
import connectToDatabase   from "@/lib/mongodb";
import mongoose            from "mongoose";

// ============================================================================
// GET /api/admin/engine-strength?userId=...
//
// Returns the pre-computed engine strength score for a client.
// Score is written by the supervisor every 5min to users.engineStrength.
//
// Response:
//   { strength, label, icon, components, updatedAt, status: "live" | "cold" }
// ============================================================================

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await connectToDatabase();
    const db = mongoose.connection.db!;

    const user = await db.collection("users").findOne(
      { _id: { $toString: userId } as any },
      {
        projection: {
          engineStrength:           1,
          engineStrengthLabel:      1,
          engineStrengthIcon:       1,
          engineStrengthComponents: 1,
          engineStrengthUpdatedAt:  1,
        },
      }
    );

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const strength    = user.engineStrength           ?? 0;
    const label       = user.engineStrengthLabel      ?? "Cold Start";
    const icon        = user.engineStrengthIcon       ?? "⚪";
    const components  = user.engineStrengthComponents ?? { publishScore: 0, outcomeConfidence: 0, activityVelocity: 0 };
    const updatedAt   = user.engineStrengthUpdatedAt  ?? null;
    const isStale     = updatedAt
      ? Date.now() - new Date(updatedAt).getTime() > 15 * 60 * 1000   // stale if not updated in 15min
      : true;

    return NextResponse.json({
      userId,
      strength,
      label,
      icon,
      components,
      updatedAt,
      status: isStale ? "cold" : "live",
      // Breakdown for UI display
      breakdown: [
        { name: "Publishing",    score: components.publishScore,      weight: "30%", description: "Pages published in last 24h" },
        { name: "Learning",      score: components.outcomeConfidence,  weight: "40%", description: "Bandit confidence from outcomes" },
        { name: "Optimization",  score: components.activityVelocity,  weight: "30%", description: "Activity events per hour" },
      ],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
