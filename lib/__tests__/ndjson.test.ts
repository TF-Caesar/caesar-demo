import { describe, it, expect } from 'vitest';
import { createNdjsonParser } from '../ndjson';

describe('createNdjsonParser', () => {
  it('parses a complete line into one object', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"type":"done","degraded":false}\n')).toEqual([{ type: 'done', degraded: false }]);
  });

  it('holds a partial chunk until its newline arrives (no duplicates, no loss)', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"type":"claims","cl')).toEqual([]);
    expect(parser.push('aims":["a"]}')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ type: 'claims', claims: ['a'] }]);
    expect(parser.flush()).toEqual([]);
  });

  it('returns multiple objects when one chunk carries several lines', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"a":1}\n{"b":2}\n{"c":3}\n')).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('splits a chunk that ends mid-object across pushes', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"a":1}\n{"b"')).toEqual([{ a: 1 }]);
    expect(parser.push(':2}\n')).toEqual([{ b: 2 }]);
  });

  it('flush() drains a trailing object that arrived without a final newline', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"a":1}\n{"b":2}')).toEqual([{ a: 1 }]);
    expect(parser.flush()).toEqual([{ b: 2 }]);
  });

  it('flush() is empty when the stream ended cleanly on a newline', () => {
    const parser = createNdjsonParser();
    parser.push('{"a":1}\n');
    expect(parser.flush()).toEqual([]);
  });

  it('flush() resets the buffer: a second flush returns nothing', () => {
    const parser = createNdjsonParser();
    parser.push('{"a":1}');
    expect(parser.flush()).toEqual([{ a: 1 }]);
    expect(parser.flush()).toEqual([]);
  });

  it('skips blank lines and tolerates CRLF endings', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{"a":1}\r\n\n  \n{"b":2}\r\n')).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips a malformed line without losing the ones after it', () => {
    const parser = createNdjsonParser();
    expect(parser.push('{oops\n{"ok":true}\n')).toEqual([{ ok: true }]);
  });

  it('narrows through the generic without validating (caller must check)', () => {
    const parser = createNdjsonParser<{ type: string }>();
    const events = parser.push('{"type":"claim"}\n');
    expect(events[0].type).toBe('claim');
  });
});
