import { describe, it, expect, vi, afterEach } from 'vitest';
import { runVerification, runVerificationEvents, type VerifyEvent } from '../orchestrate';
import { CaesarClient } from '../caesar';
import { DEMO_RESPONSE } from '../../fixtures/demo';

function fakeClient(over: Partial<CaesarClient>): CaesarClient {
  return Object.assign(Object.create(CaesarClient.prototype), over) as CaesarClient;
}

const NIF_CITATION = {
  rank: 1, title: 'NIF', canonicalUrl: 'https://llnl.gov/a', docId: 'd1',
  captureTime: '2026-06-21T14:03:00Z',
  passage: 'On December 5, 2022 the National Ignition Facility achieved fusion ignition.',
};

const TWO_CLAIMS_INPUT =
  'The National Ignition Facility achieved fusion ignition in 2022. OpenAI released GPT-4 in March 2023.';

async function collect(gen: AsyncGenerator<VerifyEvent>): Promise<VerifyEvent[]> {
  const out: VerifyEvent[] = [];
  for await (const event of gen) out.push(event);
  return out;
}

/** Assert an event's discriminant and hand back the narrowed type. */
function ofType<T extends VerifyEvent['type']>(
  event: VerifyEvent | undefined,
  type: T,
): Extract<VerifyEvent, { type: T }> {
  expect(event?.type).toBe(type);
  return event as Extract<VerifyEvent, { type: T }>;
}

afterEach(() => vi.unstubAllEnvs());

describe('runVerificationEvents', () => {
  it('yields claims first, then one claim event per verdict, then done', async () => {
    const client = fakeClient({
      searchAndRead: vi.fn().mockResolvedValue({
        evidence: 'x', tier: 'anonymous', citations: [NIF_CITATION],
      }),
    });
    const events = await collect(
      runVerificationEvents('The National Ignition Facility achieved fusion ignition in 2022.', { client }),
    );
    expect(events.map((e) => e.type)).toEqual(['claims', 'claim', 'done']);
    const claims = ofType(events[0], 'claims');
    expect(claims.claims).toHaveLength(1);
    const claim = ofType(events[1], 'claim');
    expect(claim.index).toBe(0);
    expect(claim.total).toBe(1);
    expect(claim.result.verdict).toBe('VERIFIED');
    expect(claim.result.claim).toBe(claims.claims[0]);
    const done = ofType(events[2], 'done');
    expect(done.degraded).toBe(false);
    expect(done.tier).toBe('anonymous');
  });

  it('yields an empty claims event and a non-degraded done when nothing is checkable', async () => {
    const searchAndRead = vi.fn();
    const events = await collect(
      runVerificationEvents('hello there. ok bye.', { client: fakeClient({ searchAndRead }) }),
    );
    expect(searchAndRead).not.toHaveBeenCalled();
    expect(events.map((e) => e.type)).toEqual(['claims', 'done']);
    expect(ofType(events[0], 'claims').claims).toEqual([]);
    expect(ofType(events[1], 'done').degraded).toBe(false);
  });

  it('emits claim events in completion order, each carrying its original index', async () => {
    vi.stubEnv('CLAIMS_LLM_KEY', ''); // force deterministic claim extraction
    const resolvers = new Map<string, (value: unknown) => void>();
    const searchAndRead = vi.fn(
      (query: string) => new Promise((resolve) => resolvers.set(/GPT-4/i.test(query) ? 'gpt4' : 'nif', resolve)),
    ) as unknown as CaesarClient['searchAndRead'];
    const gen = runVerificationEvents(TWO_CLAIMS_INPUT, { client: fakeClient({ searchAndRead }) });

    ofType((await gen.next()).value as VerifyEvent, 'claims');
    const secondPull = gen.next(); // starts both workers, then blocks on the queue
    await vi.waitFor(() => expect(resolvers.size).toBe(2));

    // The SECOND claim settles first: its event must arrive first, index intact.
    resolvers.get('gpt4')!({
      evidence: 'x',
      citations: [{ ...NIF_CITATION, title: 'GPT-4', passage: 'OpenAI released GPT-4 on March 14, 2023.' }],
    });
    const second = ofType((await secondPull).value as VerifyEvent, 'claim');
    expect(second.index).toBe(1);
    expect(second.total).toBe(2);

    const thirdPull = gen.next();
    resolvers.get('nif')!({ evidence: 'x', citations: [NIF_CITATION] });
    const third = ofType((await thirdPull).value as VerifyEvent, 'claim');
    expect(third.index).toBe(0);
    expect(third.total).toBe(2);

    const done = ofType((await gen.next()).value as VerifyEvent, 'done');
    expect(done.degraded).toBe(false);
    expect((await gen.next()).done).toBe(true);
  });

  it('one failing claim still yields the others as claim events, plus degraded true', async () => {
    vi.stubEnv('CLAIMS_LLM_KEY', ''); // force deterministic claim extraction
    const searchAndRead = vi.fn().mockImplementation(async (query: string) => {
      if (/GPT-4/i.test(query)) throw new Error('429'); // one claim throttled
      return { evidence: 'x', citations: [NIF_CITATION] };
    });
    const events = await collect(runVerificationEvents(TWO_CLAIMS_INPUT, { client: fakeClient({ searchAndRead }) }));
    // The failing claim produces NO claim event; the surviving one keeps index 0 of 2.
    expect(events.map((e) => e.type)).toEqual(['claims', 'claim', 'done']);
    expect(ofType(events[0], 'claims').claims).toHaveLength(2);
    const claim = ofType(events[1], 'claim');
    expect(claim.index).toBe(0);
    expect(claim.total).toBe(2);
    expect(claim.result.claim).toContain('National Ignition Facility');
    expect(ofType(events[2], 'done').degraded).toBe(true);
  });

  it('demo mode streams the canned claims without touching the engine', async () => {
    vi.stubEnv('VERIFIER_DEMO', '1');
    const searchAndRead = vi.fn();
    const events = await collect(runVerificationEvents('anything at all', { client: fakeClient({ searchAndRead }) }));
    expect(searchAndRead).not.toHaveBeenCalled();
    const claims = ofType(events[0], 'claims');
    const canned = DEMO_RESPONSE.claims;
    expect(claims.claims).toEqual(canned.map((c) => c.claim));
    const claimEvents = events.filter((e): e is Extract<VerifyEvent, { type: 'claim' }> => e.type === 'claim');
    expect(claimEvents.map((e) => e.index)).toEqual([0, 1, 2]);
    expect(claimEvents.every((e) => e.total === canned.length)).toBe(true);
    // Placeholder texts and settled results describe the same claim set.
    expect(claimEvents.map((e) => e.result.claim)).toEqual(claims.claims);
    expect(ofType(events.at(-1), 'done').degraded).toBe(true);
  });

  it('falls back to streaming the canned demo when every claim fails, replacing the claim set', async () => {
    const client = fakeClient({ searchAndRead: vi.fn().mockRejectedValue(new Error('429')) });
    const events = await collect(runVerificationEvents('some claim about Tesla in 2023', { client }));
    const claimsEvents = events.filter((e): e is Extract<VerifyEvent, { type: 'claims' }> => e.type === 'claims');
    // Real claims announced first, then a SECOND claims event swaps in the canned set.
    expect(claimsEvents).toHaveLength(2);
    expect(claimsEvents[1].claims).toEqual(DEMO_RESPONSE.claims.map((c) => c.claim));
    const claimEvents = events.filter((e): e is Extract<VerifyEvent, { type: 'claim' }> => e.type === 'claim');
    expect(claimEvents.map((e) => e.result.claim)).toEqual(claimsEvents[1].claims);
    expect(ofType(events.at(-1), 'done').degraded).toBe(true);
  });

  it('assembles into the same response runVerification returns (regression glue)', async () => {
    vi.stubEnv('CLAIMS_LLM_KEY', ''); // force deterministic claim extraction
    const mkClient = () => fakeClient({
      searchAndRead: vi.fn().mockImplementation(async (query: string) => {
        if (/GPT-4/i.test(query)) throw new Error('429');
        return { evidence: 'x', tier: 'anonymous', citations: [NIF_CITATION] };
      }),
    });
    const events = await collect(runVerificationEvents(TWO_CLAIMS_INPUT, { client: mkClient() }));
    const done = ofType(events.at(-1), 'done');
    const assembled = {
      claims: events
        .filter((e): e is Extract<VerifyEvent, { type: 'claim' }> => e.type === 'claim')
        .sort((a, b) => a.index - b.index)
        .map((e) => e.result),
      degraded: done.degraded,
      ...(done.tier ? { tier: done.tier } : {}),
    };
    const direct = await runVerification(TWO_CLAIMS_INPUT, { client: mkClient() });
    expect(direct).toEqual(assembled);
  });
});
