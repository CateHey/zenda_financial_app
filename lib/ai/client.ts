// lib/ai/client.ts — the Anthropic wrapper (D0: "REUSE verbatim").
// Copied verbatim from ../hackathon_uqies/packages/ai/src/client.ts. No import paths to adapt:
// it only imports "@anthropic-ai/sdk", "@anthropic-ai/sdk/helpers/zod" and the "zod" type, all
// already in package.json (D1 manifest). D5's boundary rule: this module (and route handlers,
// scripts/seed.ts) are the only places ANTHROPIC_API_KEY is read.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

/** The one model the product uses. Effort, not model-swapping, is the cost lever. */
export const MODEL = "claude-opus-5";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface SystemBlock {
  type: "text";
  text: string;
  /** Put this on the last block of the stable prefix so it is cached across users. */
  cache_control?: { type: "ephemeral" };
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface StructuredCall<T> {
  system: SystemBlock[];
  user: string;
  schema: z.ZodType<T>;
  effort: Effort;
  maxTokens: number;
}

export interface StructuredResult<T> {
  /** null when the model refused or the output could not be parsed. */
  output: T | null;
  stopReason: string | null;
  usage: Usage;
}

export interface TextCall {
  system: SystemBlock[];
  user: string;
  effort: Effort;
  maxTokens: number;
}

/**
 * The narrow surface the AI engine needs. The Anthropic SDK is wrapped here so
 * everything else can be tested with a fake — see testing/fake-client.ts.
 */
export interface AiClient {
  structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>>;
  streamText(call: TextCall): AsyncIterable<string>;
}

export function zeroUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

export function addUsage(total: Usage, delta: Usage): Usage {
  total.inputTokens += delta.inputTokens;
  total.outputTokens += delta.outputTokens;
  total.cacheReadTokens += delta.cacheReadTokens;
  total.cacheWriteTokens += delta.cacheWriteTokens;
  return total;
}

/** Rough cost in USD at Claude Opus 5 list prices (input $5/M, output $25/M, cache reads $0.50/M, cache writes $6.25/M). */
export function estimateCostUsd(u: Usage): number {
  return (
    (u.inputTokens * 5 + u.outputTokens * 25 + u.cacheReadTokens * 0.5 + u.cacheWriteTokens * 6.25) / 1_000_000
  );
}

/** Server-side only. Reads ANTHROPIC_API_KEY unless a key is passed. */
export function createAnthropicClient(opts: { apiKey?: string } = {}): AiClient {
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});

  return {
    async structured<T>(call: StructuredCall<T>): Promise<StructuredResult<T>> {
      const response = await client.messages.parse({
        model: MODEL,
        max_tokens: call.maxTokens,
        system: call.system,
        messages: [{ role: "user", content: call.user }],
        output_config: { effort: call.effort, format: zodOutputFormat(call.schema) },
      });
      const usage: Usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
      };
      const refused = response.stop_reason === "refusal";
      return {
        output: refused ? null : (response.parsed_output ?? null),
        stopReason: response.stop_reason,
        usage,
      };
    },

    async *streamText(call: TextCall): AsyncIterable<string> {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: call.maxTokens,
        system: call.system,
        messages: [{ role: "user", content: call.user }],
        output_config: { effort: call.effort },
      });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
    },
  };
}
