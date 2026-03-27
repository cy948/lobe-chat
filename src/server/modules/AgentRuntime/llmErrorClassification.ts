type LLMErrorKind = 'replan' | 'retry' | 'stop';

interface ClassifiedLLMError {
  code?: string;
  kind: LLMErrorKind;
  message: string;
}

interface LLMErrorSignal {
  code?: string;
  errorType?: string;
  message: string;
  status?: number;
}

const RETRY_ERROR_TYPES = new Set([
  'AgentRuntimeError',
  'OllamaServiceUnavailable',
  'ProviderBizError',
  'QuotaLimitReached',
  'StreamChunkError',
]);
const REPLAN_ERROR_TYPES = new Set(['ExceededContextWindow', 'ModelNotFound']);
const STOP_ERROR_TYPES = new Set([
  'InsufficientQuota',
  'InvalidBedrockCredentials',
  'InvalidGithubCopilotToken',
  'InvalidGithubToken',
  'InvalidOllamaArgs',
  'InvalidProviderAPIKey',
  'InvalidVertexCredentials',
  'PermissionDenied',
  'Unauthorized',
]);

const RETRY_KEYWORDS = [
  '429',
  'connection',
  'econn',
  'network',
  'rate limit',
  'timeout',
  'timed out',
  'temporarily unavailable',
];
const REPLAN_KEYWORDS = [
  'context window',
  'invalid request',
  'maximum context length',
  'model not found',
  'payload',
  'too many tokens',
];
const STOP_KEYWORDS = [
  '403',
  'api key',
  'billing',
  'forbidden',
  'insufficient quota',
  'permission denied',
  'unauthorized',
];

const hasAnyKeyword = (text: string, keywords: string[]) =>
  keywords.some((keyword) => text.includes(keyword));

const normalizeCode = (value?: string) => {
  if (!value) return;

  return value
    .trim()
    .toUpperCase()
    .replaceAll(/[\s-]+/g, '_');
};

const normalizeErrorType = (value?: string) => value?.trim();

const tryExtractStatus = (message: string) => {
  const matches = message.match(/\b([45]\d{2})\b/);
  if (!matches) return;

  const status = Number(matches[1]);
  return Number.isNaN(status) ? undefined : status;
};

const normalizeSignal = (error: unknown): LLMErrorSignal => {
  if (typeof error === 'string') {
    const message = error.toLowerCase();
    return { message, status: tryExtractStatus(message) };
  }

  if (error instanceof Error) {
    const raw = error as Error & {
      code?: string;
      errorType?: string;
      status?: number;
      statusCode?: number;
      type?: string;
    };
    const message = (raw.message || raw.name || 'unknown error').toLowerCase();

    return {
      code: normalizeCode(raw.code),
      errorType: normalizeErrorType(raw.errorType || raw.type),
      message,
      status:
        typeof raw.status === 'number'
          ? raw.status
          : typeof raw.statusCode === 'number'
            ? raw.statusCode
            : tryExtractStatus(message),
    };
  }

  if (error && typeof error === 'object') {
    const raw = error as {
      code?: string;
      error?: { code?: string; message?: string; status?: number; type?: string };
      errorType?: string;
      message?: string;
      status?: number;
      statusCode?: number;
      type?: string;
    };
    const nested = raw.error;
    const message = (raw.message || nested?.message || 'unknown error').toLowerCase();

    return {
      code: normalizeCode(raw.code || nested?.code),
      errorType: normalizeErrorType(raw.errorType || raw.type || nested?.type),
      message,
      status:
        typeof raw.status === 'number'
          ? raw.status
          : typeof raw.statusCode === 'number'
            ? raw.statusCode
            : nested?.status,
    };
  }

  return { message: 'unknown error' };
};

const classifyKind = ({ code, errorType, message, status }: LLMErrorSignal): LLMErrorKind => {
  if (errorType) {
    if (STOP_ERROR_TYPES.has(errorType)) return 'stop';
    if (REPLAN_ERROR_TYPES.has(errorType)) return 'replan';
    if (RETRY_ERROR_TYPES.has(errorType)) return 'retry';
  }

  if (code) {
    if (code.includes('UNAUTHORIZED') || code.includes('FORBIDDEN')) return 'stop';
    if (code.includes('MODEL_NOT_FOUND')) return 'replan';
    if (code.includes('RATE_LIMIT') || code.includes('TIMEOUT')) return 'retry';
  }

  if (status !== undefined) {
    if (status === 401 || status === 403) return 'stop';
    if (status === 400 || status === 404 || status === 409 || status === 422) return 'replan';
    if (status === 408 || status === 425 || status === 429 || status >= 500) return 'retry';
  }

  if (hasAnyKeyword(message, STOP_KEYWORDS)) return 'stop';
  if (hasAnyKeyword(message, REPLAN_KEYWORDS)) return 'replan';
  if (hasAnyKeyword(message, RETRY_KEYWORDS)) return 'retry';

  return 'retry';
};

export const classifyLLMError = (error: unknown): ClassifiedLLMError => {
  const signal = normalizeSignal(error);

  return {
    code: signal.code || signal.errorType,
    kind: classifyKind(signal),
    message: signal.message,
  };
};

export type { ClassifiedLLMError, LLMErrorKind };
