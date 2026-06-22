import { NextResponse } from 'next/server';
import { runFreshnessScan } from '../../../lib/monitor';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  let topic = '';
  try {
    topic = (await req.json())?.topic ?? '';
  } catch {
    topic = '';
  }
  if (typeof topic !== 'string' || topic.trim().length === 0) {
    return NextResponse.json({ topic: '', items: [], degraded: false }, { status: 200 });
  }
  try {
    const result = await runFreshnessScan(topic.slice(0, 200));
    return NextResponse.json(result, { status: 200 });
  } catch {
    // runFreshnessScan already returns a baked demo on internal failure; this is
    // a last-resort guard so the route never 500s under throttling.
    const result = await runFreshnessScan('');
    return NextResponse.json(result, { status: 200 });
  }
}
