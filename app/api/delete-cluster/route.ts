import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import User from "@/models/User";

export async function POST(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { userId, clusterId } = body;

        if (!userId || !clusterId) {
            return NextResponse.json({ error: "Missing userId or clusterId" }, { status: 400 });
        }

        await connectToDatabase();
        
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            { $pull: { seoClusters: { _id: clusterId } } },
            { new: true }
        ).lean();

        if (!updatedUser) {
           return NextResponse.json({ error: "Failed to purge cluster" }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: `Orphaned node strictly purged from array.` });

    } catch (e: any) {
        console.error("DRONE PURGE CLUSTER ERROR:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
