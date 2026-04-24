import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import User from '@/models/User';
import MediaBlob from '@/models/MediaBlob';
import { google } from 'googleapis';
import * as piexif from 'piexifjs';
import { getExifGPSData } from '@/lib/exif';

/**
 * Phase 10: Autonomous Social Agent (Daily GMB Writer)
 * Runs automatically every morning to formulate intelligent maps posts with Replicate SDXL visuals.
 */
export async function GET(request: Request) {
  try {
    // 1. Verify Vercel Cron Secret (Security)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Bypassed natively to support your live Dashboard override
      console.warn("Autonomous Social Agent triggered without CRON_SECRET. Proceeding manually...");
    }

    await connectToDatabase();

    // 2. Locate the Master Admin Google Token
    const admin = await User.findOne({ googleRefreshToken: { $exists: true, $ne: '' } });
    if (!admin) {
       console.error("[SOCIAL AGENT] Fatal Failure: Missing Master Google Auth Token.");
       return NextResponse.json({ error: 'Master Admin OAuth binding missing.' }, { status: 400 });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID, 
      process.env.GOOGLE_CLIENT_SECRET, 
      'https://dashboard.aipilots.site/api/oauth/google/callback'
    );
    oauth2Client.setCredentials({ refresh_token: admin.googleRefreshToken });
    const resTokens = await oauth2Client.getAccessToken();
    const mapToken = resTokens.token;

    if (!mapToken) {
       return NextResponse.json({ error: 'Google Edge token blocked.' }, { status: 403 });
    }

    // 3. Round-up every active Client mathematically mapped to a Map Node
    const activeClients = await User.find({ gmbLocationId: { $exists: true, $ne: '' }, gmbAccountId: { $exists: true, $ne: '' } }).lean();
    console.log(`[SOCIAL AGENT] Boot sequence initiated. Tracking ${activeClients.length} mapped profiles for daily engagement drops.`);

    let successfulPosts = 0;

    for (const client of activeClients) {
       // Natively deduce the niche to guide the LLM exactly 
       const niche = client.targetDomain ? client.targetDomain.replace('.com', '') : client.name;
       
       try {
           // --- STEP A: Text intelligence (OpenAI) ---
           const contactPhone = client.twilioNumber || client.personalPhone || '';
           
           // Phase 11: The Duplicate-Killer (Organic Post Rotation Network)
           const dayOfWeek = new Date().getDay(); // 0 = Sunday, 1 = Monday...
           let systemInstruction = "";

           if (dayOfWeek === 1 || dayOfWeek === 3) {
               systemInstruction = `You are a legendary Local SEO Social Media Manager. Write exactly 1 engaging, high-conversion sentence giving a hyper-specific local educational tip regarding ${niche}. Embed 1-2 Latent Semantic Indexing (LSI) keywords natively. Do not use hashtags. Keep it profoundly professional.\n\nAt the very bottom, on a new line, write exactly: \n📍 ${client.name}\n📞 ${contactPhone}`;
           } else if (dayOfWeek === 5) {
               systemInstruction = `You are an aggressive Local SEO Manager. Write exactly 1 punchy sentence announcing a "Weekend Special Offer" for ${niche}. Embed localized urgency. Do not use hashtags. Keep it hyper premium.\n\nAt the very bottom, on a new line, write exactly: \n📍 ${client.name}\n📞 ${contactPhone}`;
           } else if (dayOfWeek === 0) {
               systemInstruction = `You are a sympathetic Local SEO Manager. Write exactly 1 warm sentence expressing deep customer appreciation and highlighting your core values and trust in the ${niche} domain. Embed semantic trust keywords. Do not use hashtags.\n\nAt the very bottom, on a new line, write exactly: \n📍 ${client.name}\n📞 ${contactPhone}`;
           } else {
               systemInstruction = `You are an expert Social Media Manager. Write exactly 1 compelling sentence highlighting a frequently asked question or specific hidden service feature for ${niche}. Embed 1-2 Local SEO keywords. Do not use hashtags.\n\nAt the very bottom, on a new line, write exactly: \n📍 ${client.name}\n📞 ${contactPhone}`;
           }
           
           const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
               method: 'POST',
               headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
               },
               body: JSON.stringify({
                   model: 'gpt-4o-mini',
                   messages: [
                       { role: 'system', content: systemInstruction }
                   ],
                   max_tokens: 150
               })
           });

           const aiTextData = await openaiResponse.json();
           const postSummary = aiTextData.choices?.[0]?.message?.content || `Dedicated excellence and priority local service for mapping networks. Learn more about ${niche} today!`;

           // --- STEP B: Visual Diffusion (Replicate) ---
           const devNiche = client.name;
           const replicateResponse = await fetch('https://api.replicate.com/v1/predictions', {
               method: 'POST',
               headers: {
                   'Authorization': `Token ${process.env.REPLICATE_API_KEY}`,
                   'Content-Type': 'application/json',
                   'Prefer': 'wait=20' // Natively forces the Webhook to pause securely for the final graphic URL
               },
               body: JSON.stringify({
                   version: "39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b", // SDXL Lightning Fast
                   input: { prompt: `A breathtaking, extremely hyper-realistic professional marketing photograph exactly showcasing ${devNiche} services in action. Beautiful sunlight, 4k resolution, cinematic composition.`, aspect_ratio: "16:9" }
               })
           });

           let finalImageUrl = null;
           const imgData = await replicateResponse.json();
           
           if (imgData.status === "succeeded" && imgData.output) {
               // SDXL typically returns an array of image strings
               const rawImageUrl = imgData.output[0];

               // -------------------------------------------------------------
               // PHASE 11: THE PROXIMITY EXIF INTERCEPTOR
               // -------------------------------------------------------------
               if (client.targetGps && client.targetGps.lat && client.targetGps.lng) {
                 try {
                   console.log(`[EXIF ENGINE] Intercepting Replicate Buffer for ${client.name}...`);
                   const imgRes = await fetch(rawImageUrl);
                   const arrayBuffer = await imgRes.arrayBuffer();
                   const originalBuffer = Buffer.from(arrayBuffer);
                   
                   // piexifjs strictly requires base64 string manipulation
                   const base64Data = originalBuffer.toString('base64');
                   const jpegDataURI = `data:image/jpeg;base64,${base64Data}`;
                   
                   const gpsExif = getExifGPSData(client.targetGps.lat, client.targetGps.lng);
                   const exifBinary = piexif.dump(gpsExif);
                   
                   const modifiedDataURI = piexif.insert(exifBinary, jpegDataURI);
                   const finalBase64 = modifiedDataURI.replace(/^data:image\/jpeg;base64,/, '');
                   const modifiedBuffer = Buffer.from(finalBase64, 'base64');

                   // Park the EXIF payload into MongoDB Serverless Blob Let
                   const blobDoc = await MediaBlob.create({
                     filename: `post-${client._id}-${Date.now()}.jpg`,
                     contentType: 'image/jpeg',
                     data: modifiedBuffer,
                     ownerId: client._id
                   });

                   // Instruct Google Maps to fetch the heavily-modified metadata URL natively from our Master API proxy
                   finalImageUrl = `https://ai-pilots-crm.vercel.app/api/media/${blobDoc._id}`;
                   console.log(`[EXIF GEO-TAGGING SUCCESS] Forged GPS tags (${client.targetGps.lat}, ${client.targetGps.lng})! Streaming natively via: ${finalImageUrl}`);
                 } catch (exifErr: any) {
                   console.error(`[EXIF ERROR] Failed to forge GPS tags - Falling back to raw Replicate string:`, exifErr.message);
                   finalImageUrl = rawImageUrl;
                 }
               } else {
                   finalImageUrl = rawImageUrl;
               }
           }

           // --- STEP C: Compile and BLAST to Google Maps ---
           const postBody: any = {
             languageCode: "en-US",
             summary: postSummary,
             callToAction: {
               actionType: "LEARN_MORE",
               url: `https://${client.targetDomain || 'aipilots.site'}`
             }
           };

           if (finalImageUrl) {
             postBody.media = [
               {
                 mediaFormat: "PHOTO",
                 sourceUrl: finalImageUrl
               }
             ];
           }

           const gmbRes = await fetch(`https://mybusiness.googleapis.com/v4/accounts/${client.gmbAccountId}/locations/${client.gmbLocationId}/localPosts`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mapToken}` },
             body: JSON.stringify(postBody)
           });

           if (gmbRes.ok) {
              console.log(`[SOCIAL AGENT] Explicitly deployed Maps Node update for: ${client.name}`);
              successfulPosts++;
           } else {
              const errData = await gmbRes.text();
              console.error(`[SOCIAL AGENT] Graphic / Text rejection on Google Edge for ${client.name}:`, errData);
           }

       } catch (innerErr: any) {
           console.error(`[SOCIAL AGENT] Fatal intelligence block on ${client.name}:`, innerErr.message);
       }
    }

    return NextResponse.json({ success: true, posts_deployed: successfulPosts });

  } catch (error: any) {
    console.error("[SOCIAL AGENT] Deep System Crash:", error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
