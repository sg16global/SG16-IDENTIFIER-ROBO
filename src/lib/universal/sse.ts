/**
 * Server-sent events, both directions: reading provider streams and writing
 * the OpenAI-style `data: {...}` / `data: [DONE]` stream the gateway returns.
 */

export interface SseEvent {
  event?: string;
  data: string;
}

// A lone "\r" at the very end of the buffer may be the first half of "\r\n".
const LINE_END = /\r\n|\n|\r(?!$)/;

/** Parses a text/event-stream body (WHATWG rules) and cancels it if the consumer stops early. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const take = (line: string): SseEvent | null => {
    if (line === "") {
      const ready = data.length ? { event, data: data.join("\n") } : null;
      event = undefined;
      data = [];
      return ready;
    }
    if (line.startsWith(":")) return null;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
    else if (field === "event") event = value;
    return null;
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      // stream: true keeps a multi-byte character split across chunks intact.
      buffer += decoder.decode(value, { stream: true });
      let match: RegExpExecArray | null;
      while ((match = LINE_END.exec(buffer))) {
        const line = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const ready = take(line);
        if (ready) yield ready;
      }
    }
    buffer += decoder.decode();
    for (const line of buffer.split(/\r\n|\n|\r/)) {
      const ready = take(line);
      if (ready) yield ready;
    }
    const last = take("");
    if (last) yield last;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

const encoder = new TextEncoder();

export function sseData(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`);
}

/**
 * Turns an async sequence of JSON payloads into an SSE body terminated by
 * `data: [DONE]`. A failure mid-stream is reported as a final error event,
 * since the HTTP status has already been sent.
 */
export function sseStream(payloads: AsyncIterator<unknown>): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await payloads.next();
        if (done) {
          controller.enqueue(sseData("[DONE]"));
          controller.close();
          return;
        }
        controller.enqueue(sseData(value));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(sseData({ error: { message, type: "upstream_error" } }));
        controller.close();
      }
    },
    async cancel() {
      await payloads.return?.();
    },
  });
}
