import fs from 'node:fs';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import { NextResponse } from 'next/server';
import { OG_COPY, clampOgText, parseOgPage } from '../../../lib/og';
import { clientIp, rateLimit } from '../../../lib/rate-limit';

export const runtime = 'nodejs';

// Palette lifted from app/globals.css: satori renders outside the DOM, so the
// CSS variables are not available here and the hex values are inlined.
const CANVAS = '#F2F0E9';
const BONE = '#E5E2DB';
const INK_MARK = '#262524';
const INK_2 = '#615D59';

// Vendored Geist statics (assets/fonts, SIL OFL 1.1: see assets/fonts/OFL.txt).
// Literal process.cwd() joins so Next's output file tracing copies the files
// into the standalone build. If a read ever fails we render with the
// ImageResponse built-in default font instead of breaking the route.
let geistRegular: Buffer | null = null;
let geistSemiBold: Buffer | null = null;
try {
  geistRegular = fs.readFileSync(path.join(process.cwd(), 'assets/fonts/Geist-Regular.ttf'));
  geistSemiBold = fs.readFileSync(path.join(process.cwd(), 'assets/fonts/Geist-SemiBold.ttf'));
} catch {
  geistRegular = null;
  geistSemiBold = null;
}

export function GET(req: Request): Response {
  // Same gate order as the POST routes: rate limit first, then validation.
  // A GET carries no body, so the Content-Length and byte-cap stages have
  // nothing to check here. The og: prefix gives card renders their own token
  // bucket so crawler fetches never drain an IP's Caesar-backed API budget.
  const limit = rateLimit(`og:${clientIp(req)}`);
  if (!limit.ok) {
    const retryAfterSeconds = limit.retryAfterSeconds ?? 60;
    return NextResponse.json(
      { error: 'rate_limited', retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(req.url);
  const page = parseOgPage(searchParams.get('page'));
  const q = clampOgText(searchParams.get('q'));
  const copy = OG_COPY[page];
  const headline = q || copy.title;
  const headlineSize = headline.length > 90 ? 46 : headline.length > 50 ? 56 : 66;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: CANVAS,
          padding: '64px 72px',
          fontFamily: 'Geist',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              display: 'flex',
              width: 18,
              height: 18,
              borderRadius: 9999,
              backgroundColor: copy.accent,
            }}
          />
          <div style={{ display: 'flex', fontSize: 27, letterSpacing: '0.08em', color: INK_2 }}>
            {`CAESAR DEMOS · ${copy.label.toUpperCase()}`}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            maxWidth: 1010,
            fontSize: headlineSize,
            fontWeight: 600,
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: INK_MARK,
          }}
        >
          {headline}
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `2px solid ${BONE}`,
            paddingTop: 30,
          }}
        >
          <div style={{ display: 'flex', fontSize: 27, color: INK_2 }}>
            live demos · free to try · web search with receipts
          </div>
          <div style={{ display: 'flex', fontSize: 27, color: INK_2 }}>caesar-demo.fly.dev</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts:
        geistRegular && geistSemiBold
          ? [
              { name: 'Geist', data: geistRegular, weight: 400, style: 'normal' },
              { name: 'Geist', data: geistSemiBold, weight: 600, style: 'normal' },
            ]
          : undefined,
    },
  );
}
