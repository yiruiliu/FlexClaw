import http from 'http';
import https from 'https';
import { Transform } from 'stream';
import { readEnvFile } from './env.js';
import { logger } from './logger.js';

export interface ModelProxy {
  port: number;
  close(): void;
}

// ── Types ────────────────────────────────────────────────────────────────────

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string } }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | AnthropicContentBlock[] };

type AnthropicMessage = {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
};

type AnthropicRequest = {
  model: string;
  messages: AnthropicMessage[];
  system?: string | Array<{ type: string; text?: string }>;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: Array<{ name: string; description?: string; input_schema?: unknown }>;
  tool_choice?: { type: 'auto' | 'any' | 'tool'; name?: string };
};

type OpenAIResponse = {
  id: string;
  choices: Array<{
    index: number;
    message?: {
      role: string;
      content?: string | null;
      tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>;
    };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

// ── Anthropic → OpenAI request conversion ───────────────────────────────────

function anthropicToOpenAI(body: AnthropicRequest, modelId: string): Record<string, unknown> {
  const messages: unknown[] = [];

  // System prompt
  if (body.system) {
    const text = typeof body.system === 'string'
      ? body.system
      : body.system.filter(b => b.type === 'text').map(b => b.text ?? '').join('');
    if (text) messages.push({ role: 'system', content: text });
  }

  for (const msg of body.messages ?? []) {
    if (msg.role === 'user') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'user', content: msg.content });
      } else {
        const blocks = msg.content as AnthropicContentBlock[];

        // Tool results → individual tool messages
        for (const block of blocks) {
          if (block.type === 'tool_result') {
            const content = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? (block.content as AnthropicContentBlock[])
                    .filter(c => c.type === 'text')
                    .map(c => (c as { text: string }).text)
                    .join('')
                : '';
            messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content });
          }
        }

        // Text + image blocks → user message
        const userParts = blocks.filter(b => b.type === 'text' || b.type === 'image');
        if (userParts.length > 0) {
          const parts = userParts.map(b => {
            if (b.type === 'text') return { type: 'text', text: b.text };
            const src = (b as { source: { type: string; media_type?: string; data?: string; url?: string } }).source;
            const url = src.type === 'base64'
              ? `data:${src.media_type};base64,${src.data}`
              : src.url!;
            return { type: 'image_url', image_url: { url } };
          });
          // Flatten to string if single text part
          messages.push({
            role: 'user',
            content: parts.length === 1 && parts[0].type === 'text' ? (parts[0] as { text: string }).text : parts,
          });
        }
      }
    } else if (msg.role === 'assistant') {
      if (typeof msg.content === 'string') {
        messages.push({ role: 'assistant', content: msg.content });
      } else {
        const blocks = msg.content as AnthropicContentBlock[];
        const textBlocks = blocks.filter(b => b.type === 'text') as Array<{ text: string }>;
        const toolUseBlocks = blocks.filter(b => b.type === 'tool_use') as Array<{ id: string; name: string; input: unknown }>;

        const assistantMsg: Record<string, unknown> = {
          role: 'assistant',
          content: textBlocks.map(b => b.text).join('') || null,
        };
        if (toolUseBlocks.length > 0) {
          assistantMsg.tool_calls = toolUseBlocks.map(b => ({
            id: b.id,
            type: 'function',
            function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
          }));
        }
        messages.push(assistantMsg);
      }
    }
  }

  const result: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: body.max_tokens,
    stream: body.stream,
  };

  if (body.temperature !== undefined) result.temperature = body.temperature;

  if (body.tools?.length) {
    result.tools = body.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }));
  }

  if (body.tool_choice) {
    if (body.tool_choice.type === 'any') result.tool_choice = 'required';
    else if (body.tool_choice.type === 'tool') result.tool_choice = { type: 'function', function: { name: body.tool_choice.name } };
    else result.tool_choice = 'auto';
  }

  return result;
}

// ── OpenAI → Anthropic response conversion (non-streaming) ──────────────────

function openAIToAnthropic(body: OpenAIResponse, modelId: string): Record<string, unknown> {
  const choice = body.choices?.[0];
  const content: unknown[] = [];

  if (choice?.message?.content) {
    content.push({ type: 'text', text: choice.message.content });
  }

  if (choice?.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      let input: unknown = {};
      try { input = JSON.parse(tc.function.arguments); } catch { /* keep {} */ }
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
    }
  }

  const stopReason = choice?.finish_reason === 'tool_calls' ? 'tool_use'
    : choice?.finish_reason === 'length' ? 'max_tokens'
    : 'end_turn';

  return {
    id: `msg_${body.id?.replace(/^chatcmpl-/, '') ?? 'unknown'}`,
    type: 'message',
    role: 'assistant',
    content,
    model: modelId,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: body.usage?.prompt_tokens ?? 0,
      output_tokens: body.usage?.completion_tokens ?? 0,
    },
  };
}

// ── OpenAI SSE → Anthropic SSE stream transform ──────────────────────────────

function createSSETransform(msgId: string, modelId: string): Transform {
  let headerEmitted = false;
  let textBlockOpen = false;
  let textBlockIndex = 0;
  const toolBlocks = new Map<number, { id: string; name: string; blockIndex: number }>();
  let nextBlockIndex = 0;
  let buffer = '';
  let streamDone = false;

  const sseEvent = (event: string, data: unknown): string =>
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      if (streamDone) return cb();
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      let out = '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const raw = line.slice(line.startsWith('data: ') ? 6 : 5).trim();

        if (raw === '[DONE]') {
          if (textBlockOpen) {
            out += sseEvent('content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
            textBlockOpen = false;
          }
          for (const [, tb] of toolBlocks) {
            out += sseEvent('content_block_stop', { type: 'content_block_stop', index: tb.blockIndex });
          }
          toolBlocks.clear();
          out += sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: 0 },
          });
          out += sseEvent('message_stop', { type: 'message_stop' });
          streamDone = true;
          break;
        }

        let parsed: Record<string, unknown>;
        try { parsed = JSON.parse(raw); } catch { continue; }

        // Emit message_start on first real chunk
        if (!headerEmitted) {
          out += sseEvent('message_start', {
            type: 'message_start',
            message: {
              id: msgId, type: 'message', role: 'assistant',
              content: [], model: modelId,
              stop_reason: null, stop_sequence: null,
              usage: { input_tokens: 0, output_tokens: 1 },
            },
          });
          out += sseEvent('ping', { type: 'ping' });
          headerEmitted = true;
        }

        const choices = parsed.choices as Array<{
          index: number;
          delta?: {
            content?: string | null;
            tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>;
          };
          finish_reason?: string | null;
        }>;

        const choice = choices?.[0];
        if (!choice?.delta) continue;
        const delta = choice.delta;

        // Text delta
        if (typeof delta.content === 'string' && delta.content.length > 0) {
          if (!textBlockOpen) {
            textBlockIndex = nextBlockIndex++;
            out += sseEvent('content_block_start', {
              type: 'content_block_start', index: textBlockIndex,
              content_block: { type: 'text', text: '' },
            });
            textBlockOpen = true;
          }
          out += sseEvent('content_block_delta', {
            type: 'content_block_delta', index: textBlockIndex,
            delta: { type: 'text_delta', text: delta.content },
          });
        }

        // Tool call deltas
        if (delta.tool_calls?.length) {
          // Close text block before opening tool blocks
          if (textBlockOpen) {
            out += sseEvent('content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
            textBlockOpen = false;
          }

          for (const tc of delta.tool_calls) {
            if (!toolBlocks.has(tc.index)) {
              const blockIndex = nextBlockIndex++;
              toolBlocks.set(tc.index, { id: tc.id ?? '', name: tc.function?.name ?? '', blockIndex });
              out += sseEvent('content_block_start', {
                type: 'content_block_start', index: blockIndex,
                content_block: { type: 'tool_use', id: tc.id ?? '', name: tc.function?.name ?? '', input: {} },
              });
            }
            if (tc.function?.arguments) {
              const tb = toolBlocks.get(tc.index)!;
              out += sseEvent('content_block_delta', {
                type: 'content_block_delta', index: tb.blockIndex,
                delta: { type: 'input_json_delta', partial_json: tc.function.arguments },
              });
            }
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          if (textBlockOpen) {
            out += sseEvent('content_block_stop', { type: 'content_block_stop', index: textBlockIndex });
            textBlockOpen = false;
          }
          for (const [, tb] of toolBlocks) {
            out += sseEvent('content_block_stop', { type: 'content_block_stop', index: tb.blockIndex });
          }
          toolBlocks.clear();

          const stopReason = choice.finish_reason === 'tool_calls' ? 'tool_use'
            : choice.finish_reason === 'length' ? 'max_tokens'
            : 'end_turn';

          out += sseEvent('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: stopReason, stop_sequence: null },
            usage: { output_tokens: 0 },
          });
          out += sseEvent('message_stop', { type: 'message_stop' });
          streamDone = true;
        }
      }

      cb(null, out);
    },
    flush(cb) {
      cb(null, buffer.length > 0 ? buffer : null);
    },
  });
}

// ── Main proxy ───────────────────────────────────────────────────────────────

export function startModelProxy(): Promise<ModelProxy | null> {
  const { API_BASE_URL, API_KEY, MODEL_ID, API_FORMAT } = readEnvFile([
    'API_BASE_URL', 'API_KEY', 'MODEL_ID', 'API_FORMAT',
  ]);
  if (!API_BASE_URL) return Promise.resolve(null);

  const isOpenAI = API_FORMAT?.toLowerCase() === 'openai';
  const targetUrl = new URL(API_BASE_URL);
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true });
  const proto = targetUrl.protocol === 'https:' ? https : http;
  const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent;
  const targetPort = targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80);
  const targetBase = targetUrl.pathname.replace(/\/$/, '');

  const authHeaders = API_KEY
    ? { authorization: `Bearer ${API_KEY}`, 'x-api-key': API_KEY }
    : {};

  const server = http.createServer((req, res) => {
    const isMessagesPost = req.method === 'POST' && !!req.url?.includes('/messages');

    // ── Anthropic-compatible passthrough (model name substitution only) ──────
    if (!isMessagesPost || !isOpenAI) {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      req.on('end', () => {
        let body = Buffer.concat(chunks);
        if (isMessagesPost && MODEL_ID) {
          try {
            const parsed = JSON.parse(body.toString('utf8'));
            parsed.model = MODEL_ID;
            body = Buffer.from(JSON.stringify(parsed));
          } catch { /* leave unchanged */ }
        }
        const opts = {
          hostname: targetUrl.hostname, port: targetPort,
          path: targetBase + req.url,
          method: req.method,
          headers: { ...req.headers, host: targetUrl.hostname, ...authHeaders, 'content-length': body.byteLength.toString() },
          agent,
        };
        const pr = proto.request(opts, ps => { res.writeHead(ps.statusCode ?? 200, ps.headers); ps.pipe(res); });
        pr.on('error', err => { logger.error({ err }, 'Model proxy forward error'); res.writeHead(502); res.end('Proxy error'); });
        pr.write(body);
        pr.end();
      });
      return;
    }

    // ── OpenAI format: Anthropic ↔ OpenAI conversion ─────────────────────────
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end', () => {
      let anthropicBody: AnthropicRequest;
      try {
        anthropicBody = JSON.parse(Buffer.concat(chunks).toString('utf8')) as AnthropicRequest;
      } catch {
        res.writeHead(400); res.end('Bad request'); return;
      }

      const openAIBody = anthropicToOpenAI(anthropicBody, MODEL_ID ?? anthropicBody.model);
      const openAIBuf = Buffer.from(JSON.stringify(openAIBody));
      const isStreaming = !!anthropicBody.stream;
      const msgId = `msg_proxy_${Date.now()}`;
      const effectiveModel = MODEL_ID ?? anthropicBody.model;

      const opts = {
        hostname: targetUrl.hostname, port: targetPort,
        path: targetBase + '/chat/completions',
        method: 'POST',
        headers: {
          ...req.headers,
          host: targetUrl.hostname,
          ...authHeaders,
          'content-type': 'application/json',
          'content-length': openAIBuf.byteLength.toString(),
        },
        agent,
      };

      const pr = proto.request(opts, ps => {
        // On upstream error, return a proper Anthropic error so the SDK throws
        // cleanly instead of treating the empty/malformed response as a success.
        if (ps.statusCode && ps.statusCode >= 400) {
          const errChunks: Buffer[] = [];
          ps.on('data', c => errChunks.push(c));
          ps.on('end', () => {
            let message = `Upstream API error (HTTP ${ps.statusCode})`;
            try {
              const body = Buffer.concat(errChunks).toString('utf8');
              // Try plain JSON error (standard OpenAI format)
              const json = JSON.parse(body);
              message = json.error?.message || json.message || message;
            } catch {
              // Try SSE error format (DashScope: "data:{...}" with no space)
              const match = Buffer.concat(errChunks).toString('utf8').match(/data:\s*(\{[\s\S]*?\})\s*$/m);
              if (match) {
                try {
                  const d = JSON.parse(match[1]);
                  message = d.message || d.error?.message || message;
                } catch { /* keep default */ }
              }
            }
            const errBuf = Buffer.from(JSON.stringify({
              type: 'error',
              error: { type: 'api_error', message },
            }));
            res.writeHead(ps.statusCode ?? 400, { 'content-type': 'application/json', 'content-length': errBuf.byteLength.toString() });
            res.end(errBuf);
          });
          return;
        }

        if (isStreaming) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
          });
          ps.pipe(createSSETransform(msgId, effectiveModel)).pipe(res);
        } else {
          const respChunks: Buffer[] = [];
          ps.on('data', c => respChunks.push(c));
          ps.on('end', () => {
            try {
              const openAIResp = JSON.parse(Buffer.concat(respChunks).toString('utf8')) as OpenAIResponse;
              const anthropicResp = openAIToAnthropic(openAIResp, effectiveModel);
              const respBuf = Buffer.from(JSON.stringify(anthropicResp));
              res.writeHead(200, {
                'content-type': 'application/json',
                'content-length': respBuf.byteLength.toString(),
              });
              res.end(respBuf);
            } catch (err) {
              logger.error({ err }, 'Failed to convert OpenAI response to Anthropic format');
              res.writeHead(502); res.end('Conversion error');
            }
          });
        }
      });

      pr.on('error', err => { logger.error({ err }, 'Model proxy forward error'); res.writeHead(502); res.end('Proxy error'); });
      pr.write(openAIBuf);
      pr.end();
    });
  });

  return new Promise(resolve => {
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as { port: number }).port;
      logger.info({ port, target: API_BASE_URL, model: MODEL_ID, format: API_FORMAT ?? 'anthropic' }, 'Model proxy started');
      resolve({ port, close: () => server.close() });
    });
  });
}
