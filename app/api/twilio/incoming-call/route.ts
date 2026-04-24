/* eslint-disable */
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const from = formData.get('From') || 'Unknown User';
    const to = formData.get('To') || 'AI Pilots Number';

    console.log(`Incoming call received from: ${from}`);

    // Generate TwiML response
    // For now, this is a basic greeting. In the next step, we will use <Connect><Stream> 
    // to pipe this audio to the OpenAI Realtime API.
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna-Neural" language="en-US">
    Hi! You have reached Brian's AI Pilot assistant. 
  </Say>
  <Pause length="1"/>
  <Say voice="Polly.Joanna-Neural" language="en-US">
    I am currently being wired up to my main artificial intelligence software. Please check back later!
  </Say>
</Response>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error) {
    console.error('Error processing Twilio webhook:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
