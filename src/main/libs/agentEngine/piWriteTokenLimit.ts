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
  Edit: 'edit',
  Write: 'write',
} as const;

export const PiContentBlockType = {
  Text: 'text',
  ToolCall: 'toolCall',
} as const;

/**
 * Why a file mutation call needs chunked-write guidance.
 *
 * `IncompleteArguments` covers the silent case that a stop reason cannot
 * express: the upstream stream ended (a clean `stop`, or a proxy that
 * synthesized one after the connection dropped) while the tool arguments were
 * still incomplete. The tool never ran, and retrying the same full payload only
 * burns another output budget.
 */
export const PiFileMutationRecoveryCause = {
  OutputLimit: 'output_limit',
  Transport: 'transport',
  IncompleteArguments: 'incomplete_arguments',
} as const;

export type PiFileMutationRecoveryCause =
  (typeof PiFileMutationRecoveryCause)[keyof typeof PiFileMutationRecoveryCause];

const DEFAULT_MAX_OUTPUT_TOKENS = 4096;
const DEFAULT_WRITE_CHUNK_CHARACTERS = 4000;
const RECOVERY_WRITE_CHUNK_CHARACTERS = [2000, 1000] as const;
const CHUNK_CHARACTERS_PER_OUTPUT_TOKEN = 1;
// Silent truncation adds a second trigger source on top of the output token
// limit and transport failures, so a two-attempt budget exhausts almost
// immediately. Four attempts keep the guidance alive long enough to converge
// while still bounding a model that refuses to chunk.
const MAX_FILE_MUTATION_RECOVERY_ATTEMPTS = 4;
const UNKNOWN_WRITE_CALL_KEY = '__unknown_write_call__';

const FILE_MUTATION_TOOL_NAMES: ReadonlySet<string> = new Set<string>([
  PiBuiltinFileToolName.Edit,
  PiBuiltinFileToolName.Write,
]);

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

const isTransportInterruptedWrite = (message: PiWriteRecoveryMessage): boolean =>
  message.stopReason === PiAssistantStopReason.Error &&
  looksLikeTransportErrorText(message.errorMessage || '');

const isFileMutationToolCall = (block: PiMessageContentBlock): boolean =>
  block.type === PiContentBlockType.ToolCall &&
  typeof block.name === 'string' &&
  FILE_MUTATION_TOOL_NAMES.has(block.name.toLowerCase());

const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * A write call is only executable with a string `content`, so anything else
 * means the arguments were lost before they arrived.
 */
const hasIncompleteWriteArguments = (args: Record<string, unknown>): boolean =>
  typeof args.content !== 'string';

/**
 * Mirror the built-in edit tool's own argument preparation: it folds legacy
 * top-level `oldText`/`newText` and JSON-string `edits` into `edits[]`, so only
 * the shapes it cannot repair count as lost. An empty string is a legitimate
 * `newText` (deletion), so the check is `typeof !== 'string'`, never falsiness.
 */
const hasIncompleteEditArguments = (args: Record<string, unknown>): boolean => {
  if (typeof args.oldText === 'string' && typeof args.newText === 'string') return false;
  if (typeof args.edits === 'string') return false;
  if (!Array.isArray(args.edits) || args.edits.length === 0) return true;

  return args.edits.some(entry => {
    const edit = toRecord(entry);
    return typeof edit.oldText !== 'string' || typeof edit.newText !== 'string';
  });
};

const hasIncompleteFileMutationArguments = (block: PiMessageContentBlock): boolean => {
  const args = block.arguments;
  if (!args || typeof args !== 'object') return true;

  switch (block.name?.toLowerCase()) {
    case PiBuiltinFileToolName.Write:
      return hasIncompleteWriteArguments(args);
    case PiBuiltinFileToolName.Edit:
      return hasIncompleteEditArguments(args);
    default:
      return false;
  }
};

const getFileMutationRecoveryCause = (
  message: PiWriteRecoveryMessage,
): PiFileMutationRecoveryCause | null => {
  if (message.stopReason === PiAssistantStopReason.Length) {
    return PiFileMutationRecoveryCause.OutputLimit;
  }
  if (message.stopReason === PiAssistantStopReason.Error && isTransportInterruptedWrite(message)) {
    return PiFileMutationRecoveryCause.Transport;
  }
  // A completed stop or tool-use turn is the only way a truncated payload can
  // reach the runtime without an explicit failure signal.
  if (
    message.stopReason === PiAssistantStopReason.Stop ||
    message.stopReason === PiAssistantStopReason.ToolUse
  ) {
    return PiFileMutationRecoveryCause.IncompleteArguments;
  }
  return null;
};

const getRecoveryChunkCharacterLimit = (recoveryAttempt: number): number =>
  RECOVERY_WRITE_CHUNK_CHARACTERS[recoveryAttempt] ??
  RECOVERY_WRITE_CHUNK_CHARACTERS[RECOVERY_WRITE_CHUNK_CHARACTERS.length - 1];

const buildFileMutationRecoveryOpener = (cause: PiFileMutationRecoveryCause): string => {
  switch (cause) {
    case PiFileMutationRecoveryCause.Transport:
      return 'The previous built-in file mutation call was interrupted by a transport failure and was not executed.';
    case PiFileMutationRecoveryCause.IncompleteArguments:
      return 'The previous built-in file mutation call ended before its payload arrived, so the tool did not run.';
    default:
      return 'The previous built-in file mutation call hit the output token limit and was not executed.';
  }
};

const getFileMutationCallKey = (block: PiMessageContentBlock): string => {
  if (block.id?.trim()) return `call:${block.id.trim()}`;

  const rawPath = block.arguments?.path ?? block.arguments?.file_path;
  if (typeof rawPath === 'string' && rawPath.trim()) {
    return `path:${rawPath.trim().replace(/\\/g, '/')}`;
  }
  return UNKNOWN_WRITE_CALL_KEY;
};

export type PiFileMutationRecoveryTrigger = {
  cause: PiFileMutationRecoveryCause;
  callKeys: string[];
};

export type PiWriteTokenLimitRecoveryHooks = {
  /**
   * Called when a truncated file mutation cannot be steered any further because
   * the recovery budget is gone. Without this the run ends with a payload the
   * tool never received and nothing user-visible to show for it.
   */
  onBudgetExhausted?: (trigger: PiFileMutationRecoveryTrigger) => void;
};

const getFileMutationRecoveryTrigger = (
  message: PiWriteRecoveryMessage,
): PiFileMutationRecoveryTrigger | null => {
  const cause = getFileMutationRecoveryCause(message);
  if (!cause || !Array.isArray(message.content)) return null;

  const callKeys = message.content
    .filter(isFileMutationToolCall)
    // A token-limit or transport failure can cut a payload that still looks
    // complete, so every call is suspect. A turn that merely stopped early is
    // only suspicious when the payload the tool needs is actually missing.
    .filter(
      block =>
        cause !== PiFileMutationRecoveryCause.IncompleteArguments ||
        hasIncompleteFileMutationArguments(block),
    )
    .map(getFileMutationCallKey);

  return callKeys.length > 0 ? { cause, callKeys: [...new Set(callKeys)] } : null;
};

export class PiWriteTokenLimitRecovery {
  private readonly recoveredWriteCalls = new Set<string>();
  private readonly defaultChunkCharacterLimit: number;
  private recoveryAttempts = 0;
  private generation = 0;

  constructor(
    maxOutputTokens: number,
    private readonly hooks: PiWriteTokenLimitRecoveryHooks = {},
  ) {
    this.defaultChunkCharacterLimit = calculatePiWriteChunkCharacterLimit(maxOutputTokens);
  }

  reset(): void {
    this.generation += 1;
    this.recoveredWriteCalls.clear();
    this.recoveryAttempts = 0;
  }

  queueIfNeeded(message: PiWriteRecoveryMessage, session: PiSteeringSession): boolean {
    const trigger = getFileMutationRecoveryTrigger(message);
    if (!trigger) return false;

    const newKeys = trigger.callKeys.filter(key => !this.recoveredWriteCalls.has(key));
    if (newKeys.length === 0) return false;
    // A key already steered once needs no second prompt; a turn whose guidance
    // budget is spent needs a visible failure instead of a silent one.
    if (this.recoveryAttempts >= MAX_FILE_MUTATION_RECOVERY_ATTEMPTS) {
      this.hooks.onBudgetExhausted?.(trigger);
      return false;
    }

    const queuedGeneration = this.generation;
    const chunkCharacterLimit = Math.min(
      this.defaultChunkCharacterLimit,
      getRecoveryChunkCharacterLimit(this.recoveryAttempts),
    );
    for (const key of newKeys) this.recoveredWriteCalls.add(key);
    this.recoveryAttempts += 1;
    const prompt = [
      buildFileMutationRecoveryOpener(trigger.cause),
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
