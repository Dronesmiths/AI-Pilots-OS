import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import SeoDraft from '@/models/SeoDraft';
import User from '@/models/User';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    if (!clientId) {
      return NextResponse.json({ error: 'Client ID is required' }, { status: 400 });
    }

    await connectToDatabase();
    
    // Sort strictly by newest drafts first
    const drafts = await SeoDraft.find({ clientId }).sort({ createdAt: -1 }).lean();

    // Mathematically query the User node to see if the Python engine is physically running
    const userNode = await User.findById(clientId).select('seoEngineRunning').lean();

    return NextResponse.json({ success: true, drafts, engineRunning: userNode?.seoEngineRunning || false });
  } catch (error) {
    console.error('Failed to fetch SEO drafts:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = await request.json();
    const { draftId, status, contentMarkdown, pageTitle } = payload;

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
    }

    await connectToDatabase();

    const updateData: any = {};
    if (status) updateData.status = status;
    if (contentMarkdown) updateData.contentMarkdown = contentMarkdown;
    if (pageTitle) updateData.pageTitle = pageTitle;

    const updatedDraft = await SeoDraft.findByIdAndUpdate(
      draftId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedDraft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, draft: updatedDraft });
  } catch (error) {
    console.error('Failed to update SEO draft:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const draftId = searchParams.get('draftId');

    if (!draftId) {
      return NextResponse.json({ error: 'Draft ID is required' }, { status: 400 });
    }

    await connectToDatabase();
    const deletedDraft = await SeoDraft.findByIdAndDelete(draftId);

    if (!deletedDraft) {
      return NextResponse.json({ error: 'Draft not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Draft securely purged.' });
  } catch (error) {
    console.error('Failed to delete SEO draft:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
