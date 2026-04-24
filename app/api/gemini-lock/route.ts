import { NextRequest, NextResponse } from "next/server";
import connectToDatabase from "@/lib/mongodb";
import SystemLock from "@/models/SystemLock";

export const dynamic = 'force-dynamic';

const MAX_CONCURRENCY = 5;

export async function POST(req: NextRequest) {
    if (req.headers.get("Authorization") !== `Bearer ${process.env.DRONE_API_KEY}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await connectToDatabase();
        
        const body = await req.json();
        const { action, processId } = body;

        let lockDoc = await SystemLock.findOne({ lockName: "gemini_global" });
        if (!lockDoc) {
            lockDoc = await SystemLock.create({ lockName: "gemini_global", activeProcesses: [] });
        }

        // Clean stale locks (older than 2 minutes) aggressively just in case a drone dies
        if (Date.now() - lockDoc.lastUpdated.getTime() > 120000) {
             lockDoc.activeProcesses = [];
        }

        if (action === "acquire") {
            if (lockDoc.activeProcesses.includes(processId)) {
                 return NextResponse.json({ success: true, acquired: true, message: "Already holding lock." });
            }

            if (lockDoc.activeProcesses.length >= MAX_CONCURRENCY) {
                return NextResponse.json({ success: true, acquired: false, message: "Concurrency limit reached." });
            }

            lockDoc.activeProcesses.push(processId);
            lockDoc.lastUpdated = new Date();
            await lockDoc.save();
            return NextResponse.json({ success: true, acquired: true });
        }

        if (action === "release") {
            lockDoc.activeProcesses = lockDoc.activeProcesses.filter((id: string) => id !== processId);
            lockDoc.lastUpdated = new Date();
            await lockDoc.save();
            return NextResponse.json({ success: true, released: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (e: any) {
        console.error("[POST gemini-lock] Error:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
