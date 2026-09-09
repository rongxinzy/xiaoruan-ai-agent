import { i18nService } from './i18n';
import type { WebSearchToolEventHandler } from './webSearchToolEvents';

type Progress = (content: string, reasoning?: string) => void;
interface Result {
  content: string;
  reasoning?: string;
}
interface Request<T extends Result> {
  provider: string;
  model: string;
  config: { baseUrl: string; apiKey: string; apiFormat?: string };
  signal?: AbortSignal;
  onProgress?: Progress;
  onToolEvent?: WebSearchToolEventHandler;
  attempt: (progress: Progress, toolEvent: WebSearchToolEventHandler) => Promise<T>;
  plain: (progress: Progress) => Promise<T>;
}

/** Only explicit endpoint rejections establish lack of tool support. */
export function isToolCapabilityRejection(error: unknown): boolean {
  if (!(error instanceof Error) || !('statusCode' in error)) return false;
  if (![400, 422, 501].includes(Number(error.statusCode))) return false;
  const message = error.message.toLowerCase();
  const tool = '(?:tools?|tool[_ -](?:choice|calling)|function[_ -]calling|functions?)';
  return (
    new RegExp(
      `\\b${tool}\\b["']?\\s+(?:(?:is|are)\\s+)?(?:not supported|unsupported|not available)\\b`,
    ).test(message) ||
    new RegExp(`\\b(?:does not|doesn't|do not|cannot) support\\s+(?:the\\s+)?${tool}\\b`).test(
      message,
    ) ||
    new RegExp(
      `\\b(?:unknown|unrecognized|unsupported) (?:request )?(?:parameter|argument|field)s?(?: supplied)?["' :]+${tool}(?=["'\\s,;:]|$)`,
    ).test(message)
  );
}

export class ChatToolCapabilityPolicy {
  // Session-only evidence: no credentials or endpoint observations are persisted.
  private readonly rejected = new Map<string, number>();
  private generation = 0;

  clear(): void {
    this.rejected.clear();
    this.generation += 1;
  }

  async run<T extends Result>(request: Request<T>): Promise<T> {
    const assertActive = () => {
      if (request.signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');
    };
    assertActive();
    const generation = this.generation;
    const key = JSON.stringify([
      request.provider,
      request.model,
      request.config.baseUrl.trim().replace(/\/+$/, ''),
      request.config.apiFormat,
      request.config.apiKey,
    ]);
    // Catalog metadata and manual capability labels cannot veto a real attempt.
    const cached = (this.rejected.get(key) ?? 0) > Date.now();
    const fallback = async (noticeKey: string): Promise<T> => {
      assertActive();
      const prefix = `${i18nService.t(noticeKey)}\n\n`;
      request.onProgress?.(prefix);
      const result = await request.plain((content, reasoning) =>
        request.onProgress?.(prefix + content, reasoning),
      );
      assertActive();
      return { ...result, content: prefix + result.content };
    };
    if (cached) return fallback('toolCapabilityRejectedFallback');

    let started = false;
    try {
      return await request.attempt(
        (content, reasoning) => {
          if (content || reasoning) started = true;
          request.onProgress?.(content, reasoning);
        },
        event => {
          started = true;
          request.onToolEvent?.(event);
        },
      );
    } catch (error) {
      assertActive();
      if (started || !isToolCapabilityRejection(error)) throw error;
      if (generation === this.generation) {
        // Bounded cache with expiry lets changed server capabilities be tried again.
        if (this.rejected.size >= 256) this.rejected.delete(this.rejected.keys().next().value!);
        this.rejected.set(key, Date.now() + 30 * 60 * 1000);
      }
      return fallback('toolCapabilityRejectedFallback');
    }
  }
}

export const chatToolCapabilityPolicy = new ChatToolCapabilityPolicy();
