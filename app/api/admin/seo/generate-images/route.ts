import { NextRequest } from 'next/server';
import dbConnect from '../../../../../lib/mongodb';
import User from '@/models/User';
import Replicate from 'replicate';
import { GoogleGenAI } from '@google/genai';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const userId = req.nextUrl.searchParams.get('userId');
    const count  = Math.min(parseInt(req.nextUrl.searchParams.get('count') || '50'), 50);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object | string) => {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
            };

            try {
                await dbConnect();
                if (!userId) { send({ error: 'Missing userId' }); controller.close(); return; }

                const user = await User.findById(userId).select(
                    'targetDomain seoClusters onboardingConfig adsBaseServices clusterGroups'
                );
                if (!user) { send({ error: 'User not found' }); controller.close(); return; }

                const domain = user.targetDomain || 'the client site';
                const seed   = user.onboardingConfig?.seedKeywords || user.adsBaseServices || 'Local Services';
                const niche  = Array.isArray(seed) ? seed[0] : (typeof seed === 'string' ? seed.split(',')[0] : 'Local Services');

                // Build keyword pool from clusters
                const clusterKws: string[] = (user.seoClusters || [])
                    .filter((c: any) => c.status === 'queued' && c.keyword)
                    .map((c: any) => c.keyword)
                    .slice(0, 80);

                const groupKws: string[] = (user.clusterGroups || [])
                    .map((cg: any) => cg.primaryKeyword || '')
                    .filter(Boolean);

                let keywords = [...new Set([...clusterKws, ...groupKws])].slice(0, count);

                // Fill gaps with Gemini if needed
                if (keywords.length < count) {
                    try {
                        const res = await ai.models.generateContent({
                            model: 'gemini-2.5-flash',
                            contents: `Generate ${count - keywords.length} specific visual keyword phrases for "${niche}" that make excellent SEO images for ${domain}. Physical scenes, finished work, processes. One per line, no numbering.`,
                            config: { temperature: 0.7 }
                        });
                        const parts = res.candidates?.[0]?.content?.parts || [];
                        const text  = parts.filter((p: any) => !p.thought).map((p: any) => p.text).join('');
                        const extras = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
                        keywords = [...keywords, ...extras].slice(0, count);
                    } catch { /* use existing pool */ }
                }

                // Send total count so UI can show progress
                send({ type: 'start', total: keywords.length });

                // Generate in batches of 6, stream each result as it completes
                const BATCH = 6;
                let generated = 0;

                for (let i = 0; i < keywords.length; i += BATCH) {
                    const batch = keywords.slice(i, i + BATCH);

                    await Promise.allSettled(
                        batch.map(async (keyword: string) => {
                            try {
                                // Build visual prompt
                                let prompt = `Professional high quality photo of ${keyword}, architectural photography, natural lighting, no people, no text`;
                                try {
                                    const pRes = await ai.models.generateContent({
                                        model: 'gemini-2.5-flash',
                                        contents: `Write a Stable Diffusion image prompt (under 40 words) for "${keyword}". Physical objects, materials, lighting only. No people, no text. Comma-separated.`,
                                        config: { temperature: 0.3 }
                                    });
                                    const pp = pRes.candidates?.[0]?.content?.parts || [];
                                    prompt = pp.filter((p: any) => !p.thought).map((p: any) => p.text).join('').trim() || prompt;
                                } catch { /* fallback prompt */ }

                                const slug = keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                                const uniqueSlug = `${slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;

                                const output: any = await replicate.run(
                                    'black-forest-labs/flux-schnell',
                                    {
                                        input: {
                                            prompt: `${prompt}. Hyper-detailed, cinematic lighting, 8K, professional photography. No text, no watermarks, no people.`,
                                            num_inference_steps: 4,
                                            aspect_ratio: '16:9',
                                            output_format: 'webp'
                                        }
                                    }
                                );

                                const outputItem = Array.isArray(output) ? output[0] : output;
                                const url = outputItem && typeof outputItem.url === 'function' ? outputItem.url() : outputItem;
                                if (url) {
                                    generated++;
                                    // Stream this image immediately to client
                                    send({ type: 'image', url, keyword, slug: uniqueSlug, prompt, generated });
                                }
                            } catch (e: any) {
                                send({ type: 'error', keyword, message: e.message });
                            }
                        })
                    );
                }

                send({ type: 'done', generated });

            } catch (err: any) {
                send({ type: 'error', message: err.message });
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        }
    });
}
