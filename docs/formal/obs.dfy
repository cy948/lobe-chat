// ============================================================
// Global observation inputs shared across formal modules
//
// 设计原则:
//   - obs 决定黑盒结果
//   - obs 类型本身不承载控制流
//   - obs 只依赖基础投影类型，避免 include 循环
// ============================================================

include "types.dfy"

// ============================================================
// localSystemTool black-box observations
// ============================================================
datatype LocalSystemObs = LocalSystemObs(
  gatewayResult: bool
)

// ============================================================
// runtimeStep local projections shared with obs
// ============================================================
datatype InstructionKind =
  | InstrCallLlm
  | InstrCallTool
  | InstrCallToolsBatch
  | InstrFinish
  | InstrRequestHumanApprove
  | InstrRequestHumanPrompt
  | InstrRequestHumanSelect
  | InstrUnknown

datatype ObservedInstruction = ObservedInstruction(
  kind: InstructionKind,
  payloadIsOldToolsArray: bool
)

datatype RawInstructionsObs = RawInstructionsObs(
  isArray: bool,
  single: ObservedInstruction,
  items: seq<ObservedInstruction>
)

// ============================================================
// runtimeStep black-box observations
// ============================================================
datatype RuntimeStepObs = RuntimeStepObs(
  initialContext: RuntimeContext,
  runnerResult: FResult<RawInstructionsObs>,
  llmResults: seq<FResult<RuntimeStepResult>>,
  callTool: CallToolObs,
  callToolCtx: CallToolCtx,
  callToolInstruction: CallToolInstruction,
  finishResult: RuntimeStepResult,
  batchCustomExecutorPresent: seq<bool>,
  batchCustomResults: seq<FResult<RuntimeStepResult>>,
  batchBuiltinResults: seq<FResult<RuntimeStepResult>>,
  instructionResults: seq<FResult<RuntimeStepResult>>
)

// ============================================================
// builtinToolExecution black-box observations
// ============================================================
datatype BuiltinToolExecutionObs = BuiltinToolExecutionObs(
  builtinSpecialResult: ToolExecutionOutcome,
  builtinRuntimeCallResult: ToolExecutionOutcome,
  localSystem: LocalSystemObs
)

// ============================================================
// toolExecution black-box observations
// ============================================================
datatype ToolExecutionObs = ToolExecutionObs(
  mcpResult: FResult<ToolExecutionOutcome>,
  builtin: BuiltinToolExecutionObs
)

// ============================================================
// callTool black-box observations
// ============================================================
datatype CallToolObs = CallToolObs(
  dispatched: FResult<bool>,
  persisted: FResult<string>,
  toolExecution: ToolExecutionObs
)

datatype RunStepObs = RunStepObs(
  parsed: FResult<RunStepRequest>,
  coordinatorReady: bool,
  meta: FResult<string>
)

datatype ExecuteStepState = ExecuteStepState(
  status: AgentStatus,
  stepCount: int,
  hasMaxSteps: bool,
  maxSteps: int,
  forceFinish: bool,
  hasCostLimit: bool,
  totalCostExceeded: bool,
  costLimitPolicy: CostLimitPolicy,
  operationToolSource: string,
  fallbackToolSource: string
)

// ============================================================
// Global observation bundle
//
// runStep 可以一次接收整条调用链的观测输入；
// 以后 runtimeStep / toolExecution 迁移完成后，继续往这里扩。
// ============================================================
datatype ExecuteStepObs = ExecuteStepObs(
  claimed: FResult<bool>,
  stateResult: FResult<ExecuteStepState>,
  interventionResult: FResult<RuntimeStepResult>,
  runtimeStep: RuntimeStepObs
)

datatype GlobalObs = GlobalObs(
  runStep: RunStepObs,
  executeStep: ExecuteStepObs
)
