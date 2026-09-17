import { looksLikeTransportErrorText } from '../sanitizeForLog';

export const PiAssistantStopReason = {
  Aborted: 'aborted',
  Error: 'error',
  Length: 'length',
  Stop: 'stop',
  ToolUse: 'toolUse',
} as const;

export const PiBuiltinFileToolName = {
  Bash: 'bash',
  Write: 'write',
} as const;

export const PiContentBlockType = {
  Text: 'text',
  ToolCall: 'toolCall',
} as const;

// A write call can be lost by truncation or by a transport failure that
// interrupts its arguments mid-stream, so recovery covers both stop reasons.
const WRITE_RECOVERY_STOP_REASONS: ReadonlySet<string> = new Set<string>([
  PiAssistantStopReason.Length,
  PiAssistantStopReason.Error,
]);

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_WRITE_CHUNK_CHARACTERS = 4000;
const RECOVERY_WRITE_CHUNK_CHARACTERS = [2000, 1000] as const;
const CHUNK_CHARACTERS_PER_OUTPUT_TOKEN = 1;
const MAX_WRITE_RECOVERY_ATTEMPTS = RECOVERY_WRITE_CHUNK_CHARACTERS.length;
const UNKNOWN_WRITE_CALL_KEY = '__unknown_write_call__';

type PiMessageContentBlock = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
};

export type PiWriteRecoveryMessage = {
  stopReason?: string;
  errorMessage?: string;
  content: string | PiMessageContentBlock[];
};

export type PiSteeringSession = {
  steer(text: string): Promise<void>;
};

const normalizeMaxOutputTokens = (maxOutputTokens: number): number =>
  Number.isFinite(maxOutputTokens) && maxOutputTokens > 0
    ? maxOutputTokens
    : DEFAULT_MAX_OUTPUT_TOKENS;

export const calculatePiWriteChunkCharacterLimit = (maxOutputTokens: number): number =>
  Math.min(
    DEFAULT_WRITE_CHUNK_CHARACTERS,
    Math.max(
      1,
      Math.floor(normalizeMaxOutputTokens(maxOutputTokens) * CHUNK_CHARACTERS_PER_OUTPUT_TOKEN),
    ),
  );

export const createPiLargeFileWriteSystemPrompt = (maxOutputTokens: number): string => {
  const chunkCharacterLimit = calculatePiWriteChunkCharacterLimit(maxOutputTokens);
  return [
    '## Large File Writes',
    '',
    '- Use the built-in write tool for new files or complete rewrites that fit one response.',
    `- Limit each write.content or edit.edits[].newText to ${chunkCharacterLimit} characters for large files.`,
    '- For larger files, write a skeleton with a unique continuation marker; use edit to replace it with one chunk plus the marker. Emit only one content-bearing write or edit call per response, waiting for its result before continuing.',
    '- Remove the marker and verify with read or grep before reporting success. For existing-file rewrites, build and verify a sibling temporary file before replacing the target with the built-in bash tool.',
    '- On output token limit or a transport interruption, switch to chunking immediately; never retry the full content.',
  ].join('\n');
};

const isWriteRecoveryStopReason = (stopReason: string | undefined): boolean =>
  stopReason !== undefined && WRITE_RECOVERY_STOP_REASONS.has(stopReason);

const isTransportInterruptedWrite = (message: PiWriteRecoveryMessage): boolean =>
  message.stopReason === PiAssistantStopReason.Error &&
  looksLikeTransportErrorText(message.errorMessage || '');

const getWriteCallKeys = (message: PiWriteRecoveryMessage): string[] => {
  if (
    (!isWriteRecoveryStopReason(message.stopReason) ||
      (message.stopReason === PiAssistantStopReason.Error &&
        !isTransportInterruptedWrite(message))) ||
    !Array.isArray(message.content)
  ) {
    return [];
  }

  const keys = message.content
    .filter(
      block =>
        block.type === PiContentBlockType.ToolCall &&
        block.name?.toLowerCase() === PiBuiltinFileToolName.Write,
    )
    .map(block => {
      if (block.id?.trim()) return `call:${block.id.trim()}`;

      const rawPath = block.arguments?.path ?? block.arguments?.file_path;
      if (typeof rawPath === 'string' && rawPath.trim()) {
        return `path:${rawPath.trim().replace(/\\/g, '/')}`;
      }
      return UNKNOWN_WRITE_CALL_KEY;
    });

  return [...new Set(keys)];
};

const buildWriteRecoveryOpener = (stopReason: string | undefined): string =>
  stopReason === PiAssistantStopReason.Error
    ? 'The previous built-in write call was interrupted by a transport failure and was not executed.'
    : 'The previous built-in write call hit the output token limit and was not executed.';

const getRecoveryChunkCharacterLimit = (recoveryAttempt: number): number =>
  RECOVERY_WRITE_CHUNK_CHARACTERS[recoveryAttempt] ??
  RECOVERY_WRITE_CHUNK_CHARACTERS[RECOVERY_WRITE_CHUNK_CHARACTERS.length - 1];

export class PiWriteTokenLimitRecovery {
  private readonly recoveredWriteCalls = new Set<string>();
  private readonly defaultChunkCharacterLimit: number;
  private recoveryAttempts = 0;
  private generation = 0;

  constructor(maxOutputTokens: number) {
    this.defaultChunkCharacterLimit = calculatePiWriteChunkCharacterLimit(maxOutputTokens);
  }

  reset(): void {
    this.generation += 1;
    this.recoveredWriteCalls.clear();
    this.recoveryAttempts = 0;
  }

  queueIfNeeded(message: PiWriteRecoveryMessage, session: PiSteeringSession): boolean {
    const writeCallKeys = getWriteCallKeys(message);
    const newKeys = writeCallKeys.filter(key => !this.recoveredWriteCalls.has(key));
    if (newKeys.length === 0 || this.recoveryAttempts >= MAX_WRITE_RECOVERY_ATTEMPTS) return false;

    const queuedGeneration = this.generation;
    const chunkCharacterLimit = Math.min(
      this.defaultChunkCharacterLimit,
      getRecoveryChunkCharacterLimit(this.recoveryAttempts),
    );
    for (const key of newKeys) this.recoveredWriteCalls.add(key);
    this.recoveryAttempts += 1;
    const prompt = [
      buildWriteRecoveryOpener(message.stopReason),
      'Do not retry the complete content in one call.',
      'Use write to create a small skeleton with a unique continuation marker, then use edit to replace the marker with one chunk plus the marker on each subsequent model turn.',
      `Keep each write.content or edit.edits[].newText payload at or below ${chunkCharacterLimit} characters and emit only one content-bearing file mutation per response.`,
      'Remove the marker and verify the completed file before reporting success.',
    ].join(' ');

    const rollback = (error: unknown): void => {
      if (queuedGeneration === this.generation) {
        for (const key of newKeys) this.recoveredWriteCalls.delete(key);
        this.recoveryAttempts = Math.max(0, this.recoveryAttempts - 1);
      }
      console.warn('[PiWriteRecovery] failed to queue chunked write guidance:', error);
    };

    try {
      void session.steer(prompt).catch(error => rollback(error));
    } catch (error) {
      rollback(error);
      return false;
    }
    return true;
  }
}
