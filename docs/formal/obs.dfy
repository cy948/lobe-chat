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

datatype PlannedInstructions = PlannedInstructions(
  kinds: seq<InstructionKind>,
  hasFinish: bool
)

// ============================================================
// runtimeStep black-box observations
// ============================================================
datatype RuntimeStepDeps = RuntimeStepDeps(
  initialContext: RuntimeContext,
  planResult: FResult<PlannedInstructions>,
  callTool: CallToolDeps,
  instructionResults: seq<FResult<RuntimeStepResult>>
)

// ============================================================
// toolExecution black-box observations
// ============================================================
datatype ToolExecutionDeps = ToolExecutionDeps(
  mcpResult: FResult<ToolExecutionOutcome>,
  builtinSpecialResult: ToolExecutionOutcome,
  builtinRuntimeCallResult: ToolExecutionOutcome
)

// ============================================================
// callTool black-box observations
// ============================================================
datatype CallToolDeps = CallToolDeps(
  dispatched: FResult<bool>,
  persisted: FResult<bool>,
  toolExecution: ToolExecutionDeps
)

// ============================================================
// executeStep black-box observations
// ============================================================
datatype ExecuteStepDeps = ExecuteStepDeps(
  claimed: FResult<bool>,
  stateResult: FResult<AgentState>,
  runtimeStep: RuntimeStepDeps
)

// ============================================================
// runStep black-box observations
// ============================================================
datatype RunStepDeps = RunStepDeps(
  parsed: FResult<RunStepRequest>,
  coordinatorReady: bool,
  meta: FResult<string>
)

// ============================================================
// Global observation bundle
//
// runStep 可以一次接收整条调用链的观测输入；
// 以后 runtimeStep / toolExecution 迁移完成后，继续往这里扩。
// ============================================================
datatype GlobalDeps = GlobalDeps(
  runStep: RunStepDeps,
  executeStep: ExecuteStepDeps
)
