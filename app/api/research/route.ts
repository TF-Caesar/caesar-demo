import { NextResponse } from 'next/server';
import { runResearch } from '../../../lib/api-research';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a research question is tiny; reject abuse early

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ question: '', summary: [], sources: [], degraded: false }, { status: 413 });
  }
  let input = '';
  try {
    input = (await req.json())?.input ?? '';
  } catch {
    input = '';
  }
  if (typeof input !== 'string' || input.trim().length === 0) {
    return NextResponse.json({ question: '', summary: [], sources: [], degraded: false }, { status: 200 });
  }
  try {
    const result = await runResearch(input.slice(0, 4000));
    return NextResponse.json(result, { status: 200 });
  } catch {
    // runResearch already returns a baked demo on internal failure; this is a
    // last-resort guard so the route never 500s under throttling.
    const result = await runResearch('');
    return NextResponse.json(result, { status: 200 });
  }
}
