import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(req: Request) {
  try {
    const { userId, summary, topicType = 'STANDARD', actionType = 'LEARN_MORE', url } = await req.json();
    if (!userId || !summary) return NextResponse.json({ error: 'Missing core payload structures (summary text required)' }, { status: 400 });

    await connectToDatabase();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: 'User graph node inaccessible' }, { status: 404 });

    const { gmbAccountId, gmbLocationId } = user;
    if (!gmbAccountId || !gmbLocationId) {
       return NextResponse.json({ error: 'Missing GMB Business credentials (Account ID / Location ID).' }, { status: 400 });
    }

    if (!process.env.GOOGLE_CREDENTIALS_JSON) {
       return NextResponse.json({ error: 'Missing Master Service Account JSON.' }, { status: 500 });
    }

    const credentialsObj = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON.replace(/\n/g, '\\n'));
    
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

    // Use raw REST call to mybusiness.googleapis.com for Local Posts
    const parentPath = `accounts/${gmbAccountId}/locations/${gmbLocationId}`;
    const localPostsEndpoint = `https://mybusiness.googleapis.com/v4/${parentPath}/localPosts`;
    
    // Construct Post Body
    const postBody: any = {
        languageCode: 'en-US',
        summary,
        topicType
    };

    if (url) {
        postBody.callToAction = {
            actionType,
            url
        };
    }

    const response = await fetch(localPostsEndpoint, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(postBody)
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error?.message || 'Google Business Local Post rejection.');
    }

    // Register active post onto Master DB
    const newPost = {
        name: data.name,
        topicType: data.topicType || topicType,
        summary: data.summary || summary,
        callToAction: data.callToAction ? {
            actionType: data.callToAction.actionType,
            url: data.callToAction.url
        } : undefined,
        state: data.state || 'LIVE',
        createTime: data.createTime ? new Date(data.createTime) : new Date()
    };

    const currentPosts = user.gmbPosts || [];
    currentPosts.push(newPost);
    user.gmbPosts = currentPosts;

    user.markModified('gmbPosts');
    await user.save();

    return NextResponse.json({ 
        success: true, 
        message: 'Successfully deployed semantic Local Post to Google Context graph!', 
        post: newPost 
    });

  } catch (error: any) {
    console.error('[GMB LOCAL POST EXECUTION ERROR]', error);
    return NextResponse.json({ error: error.message || 'Error transmitting Local Post' }, { status: 500 });
  }
}
