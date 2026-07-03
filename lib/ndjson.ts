/**
 * Incremental NDJSON (one JSON object per line) parser for streamed fetch
 * bodies. Pure and dependency-free: feed it decoded text chunks as they
 * arrive; it buffers partial lines across chunk boundaries and returns each
 * completed object exactly once. Call flush() after the stream ends to drain
 * a trailing object that arrived without a final newline.
 *
 * Lines that fail to parse (usually a line truncated by a dropped
 * connection) are skipped, not thrown: the caller decides what a missing
 * event means. The generic is a convenience cast, not validation; callers
 * must still narrow each object before trusting it.
 */
export interface NdjsonParser<T> {
  /** Feed one decoded chunk; returns every object completed by this chunk. */
  push(chunk: string): T[];
  /** Drain the trailing unterminated line, if any, after the stream ends. */
  flush(): T[];
}

export function createNdjsonParser<T = unknown>(): NdjsonParser<T> {
  let buffer = '';

  function parseLine(line: string): T[] {
    const trimmed = line.trim(); // tolerates CRLF endings and blank keep-alive lines
    if (!trimmed) return [];
    try {
      return [JSON.parse(trimmed) as T];
    } catch {
      return []; // malformed (usually truncated) line: skip it, keep the stream alive
    }
  }

  return {
    push(chunk: string): T[] {
      buffer += chunk;
      const out: T[] = [];
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        out.push(...parseLine(buffer.slice(0, newline)));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
      }
      return out;
    },
    flush(): T[] {
      const rest = buffer;
      buffer = '';
      return parseLine(rest);
    },
  };
}
