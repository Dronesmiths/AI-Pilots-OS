import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SeoDraft from '@/models/SeoDraft';

export async function POST(req: Request) {
  try {
    const { clientId } = await req.json();

    if (!clientId) {
      return NextResponse.json({ error: 'Missing Client ID for Autonomous Inspection' }, { status: 400 });
    }

    // Connect using the same native mongoose bridge as the rest of the CRM!
    await connectToDatabase();

    // Pull all pending Drafts for this specific client
    const drafts = await SeoDraft.find({ clientId, status: 'Draft' });

    if (!drafts || drafts.length === 0) {
      return NextResponse.json({ message: 'No pending blueprints require inspection.', inspected: 0, approved: 0 });
    }

    let approvedCount = 0;
    const bulkOperations = [];

    for (const draft of drafts) {
      const html = draft.contentMarkdown || '';
      
      // 🕵️ JULES AUTONOMOUS QA METRICS
      // 1. Structural Payload Length (Minimum 2,500 chars for a deep 1500 word article)
      const passesLength = html.length > 2500;
      // 2. Semantic Header Injection
      const passesHeaders = html.includes('<h2') || html.includes('<h3');
      // 3. Visual Placeholder Validation
      const passesImages = html.includes('<img');
      // 4. Fundamental Paragraph formatting
      const passesStructure = html.includes('<p>') && html.includes('</p>');

      if (passesLength && passesHeaders && passesImages && passesStructure) {
        bulkOperations.push({
          updateOne: {
            filter: { _id: draft._id },
            update: { status: 'Approved' }
          }
        });
        approvedCount++;
      } else {
        console.log(`[JULES QA] Rejected draft ${draft.targetUrlSlug}. L:${passesLength} H:${passesHeaders} I:${passesImages} S:${passesStructure}`);
      }
    }

    // Execute the bulk mathematical update natively via Mongoose
    if (bulkOperations.length > 0) {
      await SeoDraft.bulkWrite(bulkOperations);
    }
    
    return NextResponse.json({ 
      message: 'Autonomous QA Cycle Complete.',
      inspected: drafts.length,
      approved: approvedCount
    });

  } catch (error: any) {
    console.error('QA Inspector Error:', error);
    return NextResponse.json({ error: 'Internal Server Error during Autonomous Inspection.' }, { status: 500 });
  }
}

