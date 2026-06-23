import { NextResponse } from 'next/server';
import { runVerification } from '../../../lib/orchestrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BODY_BYTES = 32_000; // a claim/paragraph/URL is tiny; reject abuse early

export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ claims: [], degraded: false }, { status: 413 });
  }
  let input = '';
  try {
    input = (await req.json())?.input ?? '';
  } catch {
    input = '';
  }
  if (typeof input !== 'string' || input.trim().length === 0) {
    return NextResponse.json({ claims: [], degraded: false }, { status: 200 });
  }
  const result = await runVerification(input.slice(0, 8000));
  return NextResponse.json(result, { status: 200 });
}
