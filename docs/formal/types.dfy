// ============================================================
// Type definitions for runStep formal model
//
// 遵循 formal-modeling-plan 的约定:
//   C1: 统一 FResult<T> 错误模型
//   P3: Attribute Projection — 只翻译分支条件用到的字段
// ============================================================

// C1: 统一错误模型
// Ok(value) — 正常返回
// Err(error) — 异常（对应 TS throw → return Err(...)）
datatype FResult<T> = Ok(value: T) | Err(error: string)

// ============================================================
// P3: Attribute Projection
//
// 翻译原则: 只投影条件分支中出现的属性 + 传递给下游调用的属性。
// 其余字段投影掉——如果因此导致 JSON parse 失败，由 FResult.Err 兜底。
// ============================================================

// --- Request ---
// TS: AgentExecutionParams (types.ts:117)
// 投影: operationId (分支 + 下游), stepIndex (下游)
// 投影掉: context, humanInput, approvedToolCall, rejectionReason,
//         rejectAndContinue, toolMessageId, externalRetryCount
// 原因: 这些字段直接透传给 executeStep，不在 handler 分支中使用
datatype RunStepRequest = RunStepRequest(operationId: string, stepIndex: int)

// --- ExecuteStep minimal state projection ---
// 只保留 ExecuteStep 第一阶段要证明的控制流字段:
//   status    → terminal-state early exit
//   stepCount → stale retry skip
datatype AgentStatus =
  | StatusIdle
  | StatusRunning
  | StatusWaitingForHuman
  | StatusInterrupted
  | StatusDone
  | StatusError

datatype CostLimitPolicy = CostLimitStop | CostLimitContinue

datatype AgentState = AgentState(
  status: AgentStatus,
  stepCount: int,
  hasCostLimit: bool,
  totalCostExceeded: bool,
  costLimitPolicy: CostLimitPolicy
)

datatype RuntimePhase =
  | PhaseNone
  | PhaseInit
  | PhaseUserInput
  | PhaseHumanApprovedTool
  | PhaseLlmResult
  | PhaseToolResult
  | PhaseToolsBatchResult
  | PhaseError
  | PhaseOther

datatype RuntimeContext = RuntimeContext(present: bool, phase: RuntimePhase)

datatype RuntimeStepResult = RuntimeStepResult(newState: AgentState, nextContext: RuntimeContext)

datatype ToolExecutionOutcome = ToolExecutionOutcome(success: bool)

datatype LocalSystemInput = LocalSystemInput(
  hasUserId: bool,
  hasActiveDeviceId: bool,
  gatewayConfigured: bool
)

datatype ToolKind =
  | ToolBuiltin
  | ToolMcp
  | ToolOther

datatype ToolExecutionInput = ToolExecutionInput(kind: ToolKind)

datatype BuiltinSource =
  | SourceNone
  | SourceLobehubSkill
  | SourceKlavis

datatype BuiltinExecutionInput = BuiltinExecutionInput(
  hasArguments: bool,
  argumentsParseOk: bool,
  argumentsTruncated: bool,
  source: BuiltinSource,
  hasServerRuntime: bool,
  hasApiMethod: bool,
  runtimeCallSucceeds: bool,
  isLocalSystem: bool,
  localSystemInput: LocalSystemInput
)

datatype CallToolCtx = CallToolCtx(
  streamManagerCanSendToolExecute: bool
)

datatype ToolSource =
  | ToolSourceNone
  | ToolSourceClient
  | ToolSourceOther

datatype ToolExecutorMode =
  | ToolExecutorDefault
  | ToolExecutorClient
  | ToolExecutorOther

datatype CallToolInstruction = CallToolInstruction(
  toolSource: ToolSource,
  toolExecutor: ToolExecutorMode,
  skipCreateToolMessage: bool,
  serverToolKind: ToolKind,
  builtinInput: BuiltinExecutionInput
)

datatype CallToolInput = CallToolInput(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState
)

datatype ExecuteStepInput = ExecuteStepInput(
  operationId: string,
  stepIndex: int,
  context: RuntimeContext,
  hasHumanInput: bool,
  hasApprovedToolCall: bool,
  hasRejectionReason: bool,
  rejectAndContinue: bool,
  hasToolMessageId: bool,
  externalRetryCount: int
)

// --- ExecuteStep Return ---
// TS: AgentExecutionResult (types.ts:135)
// 这是 ExecuteStep 自身语义需要的最小完备投影:
//   locked            → lock conflict
//   nextStepScheduled → continue / complete 分类
//   state             → 返回后的可观察状态
//   hasStepResult     → stepResult 是否存在（V1 不展开其内部结构）
//   success           → 方法整体成功/失败语义
datatype ExecuteStepResult = ExecuteStepResult(
  locked: bool,
  nextStepScheduled: bool,
  state: AgentState,
  hasStepResult: bool,
  success: bool
)

// --- HTTP Status ---
// 只建模 handler 实际返回、且影响 QStash 重试行为的状态码:
//   200 → QStash 停止重试
//   400 → QStash 重试（但请求畸形 → 死信）
//   401 → QStash 重试（operation 无效 → 死信）
//   429 → QStash Retry-After 后重试（锁冲突，合理）
//   500 → QStash 指数退避重试（异常，可能恢复）
datatype HttpStatus = Status200 | Status400 | Status401 | Status429 | Status500
