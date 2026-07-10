# Caesar Demos

Four free, no-signup demos of [Caesar](https://trycaesar.com) search, hosted on **one** deployment. Each shows the same idea from a different angle: the answer is a **live source, captured at a moment** — not a model's memory.

The hosted demos are free to use, no signup: the server holds the Caesar API key. Powered by Caesar search.

## The four demos

- **Verifier** (`/verifier`): paste a claim, a paragraph, or a URL; every factual claim is checked against live sources and shown with the exact captured passage and a timestamp.
- **Research** (`/research`): ask anything and get a short briefing: the extracted facts, then a numbered, dated list of where each one came from.
- **Monitor** (`/monitor`): name a topic and see the freshest captured items, newest first, a freshness radar for what's new right now.
- **Finder** (`/find`): name a product or describe the one you're picturing; Caesar identifies it and finds live retailer listings, each with a capture timestamp.

The hub lives at `/` and links to all four.

## Run it locally

```bash
git clone https://github.com/TF-Caesar/caesar-demo
cd caesar-demo
npm install
cp .env.example .env.local   # then add your CAESAR_SEARCH_API_KEY
npm run dev
```

`CAESAR_SEARCH_API_KEY` is **required**: Caesar's API is keyed. Get a key at [trycaesar.com](https://trycaesar.com) (new accounts include $1,000 in credits). Deploying? Set it as a secret, e.g. `fly secrets set CAESAR_SEARCH_API_KEY=<your-key>` for the Fly deployment. Optional env:

- `CLAIMS_LLM_KEY` — an Anthropic key for sharper claim extraction in the Verifier (off by default; deterministic otherwise).
- `VERIFIER_DEMO=1` — force the cached demo responses across all four demos (offline showcase / screenshots).

Every route has a graceful demo fallback, so the hosted demos never error under throttling or a missing key.

## How it works

`search` the query → `read` the top sources → ground the result against the **captured passage** (or the full read text when no structured passage is returned). The entire Caesar integration is one small, dependency-light file you can copy into your own project: [`lib/caesar.ts`](lib/caesar.ts).

## Standalone repos

Each demo also ships on its own:

- [github.com/TF-Caesar/caesar-verifier](https://github.com/TF-Caesar/caesar-verifier)
- [github.com/TF-Caesar/caesar-research](https://github.com/TF-Caesar/caesar-research)
- [github.com/TF-Caesar/caesar-monitor](https://github.com/TF-Caesar/caesar-monitor) — also a CLI + GitHub Action for tracking changes over time.
- [github.com/TF-Caesar/caesar-finder](https://github.com/TF-Caesar/caesar-finder)

## License

MIT.
