import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { userId, reviewId } = await req.json();
    if (!userId || !reviewId) return NextResponse.json({ error: 'Missing core routing anchors (userId or reviewId)' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User unavailable' }, { status: 404 });

    const { gmbAccountId, gmbLocationId } = user;
    if (!gmbAccountId || !gmbLocationId) return NextResponse.json({ error: 'Missing GMB Account/Location binding.' }, { status: 400 });

    const reviewTarget = user.gmbReviews?.find((r: any) => r.reviewId === reviewId);
    if (!reviewTarget) return NextResponse.json({ error: 'Target review block not found in local cache' }, { status: 404 });

    if (reviewTarget.reply) {
       return NextResponse.json({ error: 'Review actively retains an existing response.' }, { status: 400 });
    }

    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
       return NextResponse.json({ error: 'Missing Master Service Account JSON.' }, { status: 500 });
    }

    // Generate AI Reply
    const systemInstruction = `You are the owner of ${user.targetDomain || 'this local business'}. Respond professionally, courteously, and thoughtfully to this customer review. Naturally weave in exact local SEO keywords implicitly to boost semantic relevance on Google Maps local search. Keep it under 3 sentences.`;
    const gptCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Reviewer: ${reviewTarget.reviewerName}\nRating: ${reviewTarget.starRating}\nComment: "${reviewTarget.comment}"` }
        ]
    });
    
    const aiReplyText = gptCompletion.choices[0].message.content || 'Thank you so much for your valuable feedback!';

    const credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    const auth = new google.auth.GoogleAuth({
        credentials: { client_email: credentialsObj.client_email, private_key: credentialsObj.private_key },
        scopes: ['https://www.googleapis.com/auth/business.manage'],
    });

    const authClient = await auth.getClient() as any;
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;

    // parent path for the reply is the review name
    const parentResponseName = `accounts/${gmbAccountId}/locations/${gmbLocationId}/reviews/${reviewId}`;
    const replyEndpoint = `https://mybusinessreviews.googleapis.com/v1/${parentResponseName}/reply`;

    const response = await fetch(replyEndpoint, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ comment: aiReplyText })
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Neural deployment failure to Google Maps edge');
    }

    // Update Local Cache
    reviewTarget.reply = {
        comment: aiReplyText,
        updateTime: new Date()
    };
    reviewTarget.isAiReplied = true;
    user.markModified('gmbReviews');
    await user.save();

    return NextResponse.json({ 
        success: true, 
        message: 'Successfully deployed Autojack Reply to Google Business Network',
        updatedReview: reviewTarget 
    });

  } catch (error: any) {
    console.error('[GMB AI REPLY EXECUTION ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error executing AI Autojack sequence' }, { status: 500 });
  }
}
