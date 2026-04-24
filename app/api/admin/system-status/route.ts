import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    operational: true,
    services: {
      mongodb: true,
      twilio: true,
      vapi: true
    }
  });
}
