import { NextResponse } from 'next/server';
import { runVerification } from '../../../lib/orchestrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
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
