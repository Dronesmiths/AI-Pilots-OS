import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: 'Missing userId structure' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const { gmbAccountId, gmbLocationId } = user;
    if (!gmbAccountId || !gmbLocationId) {
       return NextResponse.json({ error: 'Missing GMB mapping credentials (Account ID / Location ID).' }, { status: 400 });
    }

    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
       return NextResponse.json({ error: 'Missing Master Service Account JSON in environmental matrix.' }, { status: 500 });
    }

    const credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    
    // Authenticate via OAuth 2.0
    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: credentialsObj.client_email,
            private_key: credentialsObj.private_key,
        },
        scopes: ['https://www.googleapis.com/auth/business.manage'],
    });

    const authClient = await auth.getClient() as any;
    const tokenObj = await authClient.getAccessToken();
    const accessToken = tokenObj.token;

    // Use raw REST call to mybusinessreviews.googleapis.com
    const reviewsEndpoint = `https://mybusinessreviews.googleapis.com/v1/accounts/${gmbAccountId}/locations/${gmbLocationId}/reviews?pageSize=50`;
    
    const response = await fetch(reviewsEndpoint, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Google Business Graph authorization rejection.');
    }

    const reviews = data.reviews || [];

    // Map the new review objects into MongoDB
    const currentReviews = user.gmbReviews || [];
    let importedCount = 0;

    for (const rev of reviews) {
       const revId = rev.reviewId || rev.name.split('/').pop();
       const existsIndex = currentReviews.findIndex((r: any) => r.reviewId === revId);
       
       const reviewPayload = {
           reviewId: revId,
           reviewerName: rev.reviewer?.displayName || 'Anonymous Responder',
           starRating: rev.starRating || 'STAR_RATING_UNSPECIFIED',
           comment: rev.comment || '',
           createTime: new Date(rev.createTime),
           updateTime: new Date(rev.updateTime),
           reply: rev.reviewReply ? {
               comment: rev.reviewReply.comment,
               updateTime: rev.reviewReply.updateTime ? new Date(rev.reviewReply.updateTime) : new Date()
           } : undefined,
           isAiReplied: !!rev.reviewReply,
           extractedKeywords: extractSeoKeywords(rev.comment || '')
       };

       if (existsIndex > -1) {
           currentReviews[existsIndex] = { ...currentReviews[existsIndex], ...reviewPayload, _id: currentReviews[existsIndex]._id };
       } else {
           currentReviews.push(reviewPayload);
           importedCount++;
       }
    }

    user.gmbReviews = currentReviews;
    user.markModified('gmbReviews');
    await user.save();

    return NextResponse.json({ 
        success: true, 
        message: `Successfully indexed ${importedCount} new local reviews.`, 
        reviews: currentReviews 
    });

  } catch (error: any) {
    console.error('[GMB REVIEW ENGINE ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error crawling Google Business Graph' }, { status: 500 });
  }
}

function extractSeoKeywords(text: string): string[] {
   const stopWords = ['the', 'is', 'in', 'and', 'to', 'a', 'it', 'for', 'of', 'this', 'was', 'with', 'on', 'that', 'i', 'we', 'they', 'you', 'my', 'me', 'our', 'are', 'be', 'have', 'has', 'had', 'do', 'did', 'but', 'by', 'as', 'at', 'so', 'not', 'or', 'from', 'an'];
   const words = text.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ');
   const keywordMap: Record<string, number> = {};
   for (const raw of words) {
       const w = raw.trim();
       if (w.length > 3 && !stopWords.includes(w)) {
           keywordMap[w] = (keywordMap[w] || 0) + 1;
       }
   }
   return Object.keys(keywordMap).sort((a,b) => keywordMap[b] - keywordMap[a]).slice(0, 5);
}
