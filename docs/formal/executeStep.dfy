// ============================================================
// executeStep — formal module for AgentRuntimeService.executeStep
//
// 对应 TS: src/server/services/agentRuntime/AgentRuntimeService.ts:428 executeStep()
//
// 遵循 formal-modeling-plan 的约定:
//   P1: 三层信任归约 (L1=TS/V8, L2=Dafny, L3=公理)
//   P2: 外部调用即 cut point
//   P4: Pre-Condition 驱动日志埋点
// ============================================================

include "types.dfy"
include "runtimeStep.dfy"

// ============================================================
// ExecuteStep input projection
//
// TS: AgentExecutionParams
// 这是 ExecuteStep 私有的入参投影，因此放在当前文件内。
//
// V1 只保留当前控制流骨架需要的字段:
//   operationId → lock/state lookup
//   stepIndex   → lock key / stale retry guard
// 其余字段（context / humanInput / approvedToolCall / ...）
// 先留待后续展开 human-intervention / runtime.step 语义时补入。
// ============================================================
datatype ExecuteStepParams = ExecuteStepParams(operationId: string, stepIndex: int)

// ============================================================
// Ghost datatype: 追踪 ExecuteStep 停在哪一步
//
// 用于 ensures 子句将"停在哪"映射到"返回什么结果"。
// 每个 constructor 对应 executeStep TS 实现中的一条关键 early-exit
// 或收尾路径。
// ============================================================
datatype ExecuteStepStage =
  | ClaimFailed          // AgentRuntimeService.ts:442-443/外部失败
  | LockConflict         // AgentRuntimeService.ts:443-455
  | LoadStateFailed      // AgentRuntimeService.ts:474-478
  | StaleRetrySkipped    // AgentRuntimeService.ts:486-499
  | TerminalStateSkipped // AgentRuntimeService.ts:503-528
  | RuntimeStepFailed    // AgentRuntimeService.ts:616-617/外部失败
  | StepContinues        // AgentRuntimeService.ts:636-640, shouldContinue=true
  | StepCompletes        // AgentRuntimeService.ts:636-640, shouldContinue=false

// ============================================================
// L3 Cut Points: ExecuteStep 依赖的外部调用
//
// 第一阶段只切出控制流真正依赖的几个外部点：
//   lock acquire / state load / runtime step / continue decision
// 其他 hook、trace、stream、device-context 等先不建模。
// ============================================================

// Trust Base: Redis step lock
// 假设: true 表示本实例获得该 step 的执行权；false 表示别人已持有
// 失败模式: Redis / 网络异常 → Err
method TryClaimStep(operationId: string, stepIndex: int) returns (result: FResult<bool>)
{
  assume {:axiom} false;
}

// Trust Base: AgentRuntimeCoordinator.loadAgentState
// 假设: operation 存在时返回 AgentState；不存在或底层异常时返回 Err
method LoadAgentState(operationId: string) returns (result: FResult<AgentState>)
{
  assume {:axiom} false;
}

// ============================================================
// L2 helper: 统一 cut point 失败时的返回形状
//
// 作用:
//   - 保留 "失败停在哪个 stage" 的可追踪性
//   - 收紧方法体里的重复 Err 分支样板
// ============================================================
method FailAt(stageValue: ExecuteStepStage) returns (result: FResult<ExecuteStepResult>, ghost stage: ExecuteStepStage)
  requires stageValue.ClaimFailed? || stageValue.LoadStateFailed? || stageValue.RuntimeStepFailed?
  ensures result.Err?
  ensures stage == stageValue
{
  stage := stageValue;
  result := Err("cut point failed");
}

// ============================================================
// L2: ExecuteStep 最小状态机骨架
//
// 完整路径（V1）:
//   TryClaimStep → LoadAgentState → stale-retry guard
//                → terminal-state guard → RuntimeStep → ShouldContinue
//
// 每个 ghost stage 对应 TS 中的一段关键 return / early-exit 路径。
//
// 对应 TS 主干：
//   src/server/services/agentRuntime/AgentRuntimeService.ts:441
//   src/server/services/agentRuntime/AgentRuntimeService.ts:474
//   src/server/services/agentRuntime/AgentRuntimeService.ts:485
//   src/server/services/agentRuntime/AgentRuntimeService.ts:501
//   src/server/services/agentRuntime/AgentRuntimeService.ts:615
//   src/server/services/agentRuntime/AgentRuntimeService.ts:635
// ============================================================
method ExecuteStep(params: ExecuteStepParams)
  returns (result: FResult<ExecuteStepResult>, ghost stage: ExecuteStepStage)
  requires params.operationId != ""
  ensures stage.ClaimFailed? ==> result.Err?
  ensures stage.LockConflict? ==> result.Ok? && result.value.locked && !result.value.success
  ensures stage.LockConflict? ==> !result.value.nextStepScheduled && !result.value.hasStepResult
  ensures stage.LoadStateFailed? ==> result.Err?
  ensures stage.StaleRetrySkipped? ==> result.Ok? && !result.value.locked && result.value.success
  ensures stage.StaleRetrySkipped? ==> !result.value.nextStepScheduled && !result.value.hasStepResult
  ensures stage.TerminalStateSkipped? ==> result.Ok? && !result.value.locked && result.value.success
  ensures stage.TerminalStateSkipped? ==> !result.value.nextStepScheduled && !result.value.hasStepResult
  ensures stage.RuntimeStepFailed? ==> result.Err?
  ensures stage.StepContinues? ==> result.Ok? && !result.value.locked && result.value.success
  ensures stage.StepContinues? ==> result.value.nextStepScheduled && result.value.hasStepResult
  ensures stage.StepCompletes? ==> result.Ok? && !result.value.locked && result.value.success
  ensures stage.StepCompletes? ==> !result.value.nextStepScheduled && result.value.hasStepResult
{
  // Stage 1: claim step lock — AgentRuntimeService.ts:442-455
  var claimed := TryClaimStep(params.operationId, params.stepIndex);
  match claimed {
    case Err(_) => {
      result, stage := FailAt(ClaimFailed);
      return;
    }
    case Ok(false) => {
      stage := LockConflict;
      result := Ok(ExecuteStepResult(true, false, AgentState(StatusRunning, 0, false, false, CostLimitContinue), false, false));
      return;
    }
    case Ok(true) => {}
  }

  // Stage 2: load state — AgentRuntimeService.ts:474-478
  var stateResult := LoadAgentState(params.operationId);
  var state: AgentState;
  match stateResult {
    case Err(_) => {
      result, stage := FailAt(LoadStateFailed);
      return;
    }
    case Ok(s) => state := s;
  }

  // Stage 3: stale retry guard — AgentRuntimeService.ts:486-499
  if state.stepCount > params.stepIndex {
    stage := StaleRetrySkipped;
    result := Ok(ExecuteStepResult(false, false, state, false, true));
    return;
  }

  // Stage 4: terminal state guard — AgentRuntimeService.ts:503-528
  if state.status == StatusInterrupted || state.status == StatusDone || state.status == StatusError {
    stage := TerminalStateSkipped;
    result := Ok(ExecuteStepResult(false, false, state, false, true));
    return;
  }

  // Stage 5: runtime.step — AgentRuntimeService.ts:616-617
  var stepped, _ := RuntimeStep(RuntimeStepInput(state, RuntimeContext(false, PhaseNone)));
  var stepResult: RuntimeStepResult;
  match stepped {
    case Err(_) => {
      result, stage := FailAt(RuntimeStepFailed);
      return;
    }
    case Ok(s) => stepResult := s;
  }

  // Stage 6: continue vs complete — AgentRuntimeService.ts:636-640
  var shouldContinue := ShouldContinueExecution(stepResult.newState, stepResult.nextContext);
  if shouldContinue {
    stage := StepContinues;
    result := Ok(ExecuteStepResult(false, true, stepResult.newState, true, true));
  } else {
    stage := StepCompletes;
    result := Ok(ExecuteStepResult(false, false, stepResult.newState, true, true));
  }
}
