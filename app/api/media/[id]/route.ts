import { NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import MediaBlob from '@/models/MediaBlob';

/**
 * Serverless EXIF Media Proxy
 * Steams binary buffers from MongoDB seamlessly directly into Google Business API.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await connectToDatabase();

    const media = await MediaBlob.findById(id).lean();
    
    if (!media || !media.data) {
      return new NextResponse('Media not found', { status: 404 });
    }

    // Pass the raw Binary Buffer physically back to the requestor with public cache headers
    return new NextResponse(media.data.buffer, {
      status: 200,
      headers: {
        'Content-Type': media.contentType,
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error("[MEDIA PROXY GET ERROR]", error.message);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
