export interface GenerateObjectPayload {
  messages: { content: string; role: 'system' | 'user' }[];
  model: string;
  provider?: string;
  schema: Record<string, unknown>;
}

export interface MatchContext {
  // TODO: 这里的 LLM 返回值和 Judge Prompt Template 是耦合的，未来可以考虑抽象成更通用的接口
  generateObject?: (
    payload: GenerateObjectPayload,
  ) => Promise<{ reason: string; score?: number; correct?: boolean }>;
  judgeModel?: string;
}

export interface MatchResult {
  passed: boolean;
  reason?: string;
  score: number;
}
