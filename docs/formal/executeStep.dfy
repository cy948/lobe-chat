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
include "obs.dfy"
include "runtimeStep.dfy"

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
// L3 Cut Point: Redis step lock
//
// obs 决定黑盒结果:
//   - TryClaimStep 直接返回 obs.claimed
// ============================================================
method TryClaimStep(obs: ExecuteStepObs, operationId: string, stepIndex: int) returns (result: FResult<bool>)
  ensures result == obs.claimed
{
  result := obs.claimed;
}

// ============================================================
// L3 Cut Point: coordinator.loadAgentState
//
// obs 决定黑盒结果:
//   - LoadAgentState 直接返回 obs.stateResult
// ============================================================
method LoadAgentState(obs: ExecuteStepObs, operationId: string) returns (result: FResult<ExecuteStepState>)
  ensures result == obs.stateResult
{
  result := obs.stateResult;
}

// ============================================================
// L3 Cut Point: runtime.handleHumanIntervention
//
// obs 决定黑盒结果:
//   - HandleHumanIntervention 直接返回 obs.interventionResult
// ============================================================
method HandleHumanIntervention(obs: ExecuteStepObs, state: AgentState, input: ExecuteStepInput)
  returns (result: FResult<RuntimeStepResult>)
  ensures result == obs.interventionResult
{
  result := obs.interventionResult;
}

function ShouldContinueExecution(state: AgentState, nextContext: RuntimeContext): bool
{
  if state.status == StatusDone then false
  else if state.status == StatusInterrupted then false
  else if state.status == StatusError then false
  else if state.status == StatusWaitingForHuman then false
  else if state.hasCostLimit && state.totalCostExceeded && state.costLimitPolicy == CostLimitStop then false
  else nextContext.present
}

// ============================================================
// L2: ExecuteStep 最小状态机骨架
//
// 对应 TS 主干:
//   tryClaimStep
//   -> loadAgentState
//   -> stale retry guard
//   -> terminal-state guard
//   -> runtime.step
//   -> shouldContinueExecution
//
// 当前版本选择弱规格:
//   - method 本身只定义控制流过程
//   - 具体可证明分支性质留给后续 lemma 单独表达
// ============================================================
method ExecuteStep(obs: ExecuteStepObs, input: ExecuteStepInput)
  returns (result: FResult<ExecuteStepResult>)
{
  var claimed := TryClaimStep(obs, input.operationId, input.stepIndex);
  match claimed {
    case Err(_) => {
      result := Err("claim step failed");
      return;
    }
    case Ok(false) => {
      result := Ok(ExecuteStepResult(
        true,
        false,
        AgentState(StatusRunning, 0, false, false, CostLimitContinue, "", ""),
        false,
        false
      ));
      return;
    }
    case Ok(true) => {}
  }

  var stateResult := LoadAgentState(obs, input.operationId);
  var state: ExecuteStepState;
  match stateResult {
    case Err(_) => {
      result := Err("load state failed");
      return;
    }
    case Ok(s) => state := s;
  }

  if state.stepCount > input.stepIndex {
    result := Ok(ExecuteStepResult(
      false,
      false,
      AgentState(
        state.status,
        state.stepCount,
        state.hasCostLimit,
        state.totalCostExceeded,
        state.costLimitPolicy,
        state.operationToolSource,
        state.fallbackToolSource
      ),
      false,
      true
    ));
    return;
  }

  if state.status == StatusInterrupted || state.status == StatusDone || state.status == StatusError {
    result := Ok(ExecuteStepResult(
      false,
      false,
      AgentState(
        state.status,
        state.stepCount,
        state.hasCostLimit,
        state.totalCostExceeded,
        state.costLimitPolicy,
        state.operationToolSource,
        state.fallbackToolSource
      ),
      false,
      true
    ));
    return;
  }

  var currentState := AgentState(
    state.status,
    state.stepCount,
    state.hasCostLimit,
    state.totalCostExceeded,
    state.costLimitPolicy,
    state.operationToolSource,
    state.fallbackToolSource
  );
  var currentContext := input.context;
  if input.hasHumanInput || input.hasApprovedToolCall || input.hasRejectionReason {
    var intervention := HandleHumanIntervention(obs, state, input);
    match intervention {
      case Err(_) => {
        result := Err("human intervention failed");
        return;
      }
      case Ok(interventionResult) => {
        currentState := interventionResult.newState;
        currentContext := interventionResult.nextContext;
      }
    }
  }

  var stepped := RuntimeStep(
    obs.runtimeStep,
    RuntimeStepInput(
      RuntimeStepState(
        state.status,
        state.stepCount,
        state.hasMaxSteps,
        state.maxSteps,
        state.forceFinish,
        currentState.hasCostLimit,
        currentState.totalCostExceeded,
        currentState.costLimitPolicy,
        currentState.operationToolSource,
        currentState.fallbackToolSource
      ),
      currentContext
    )
  );
  match stepped {
    case Err(_) => {
      result := Err("runtime step failed");
      return;
    }
    case Ok(stepResult) => {
      if ShouldContinueExecution(stepResult.newState, stepResult.nextContext) {
        result := Ok(ExecuteStepResult(
          false,
          true,
          stepResult.newState,
          true,
          true
        ));
      } else {
        result := Ok(ExecuteStepResult(
          false,
          false,
          stepResult.newState,
          true,
          true
        ));
      }
      return;
    }
  }
}

// 单次运行版本：
//   这里只证明一次 ExecuteStep 调用能把控制流推进到一次满足条件的 RuntimeStep，
//   不讨论后续调度、下一 step、或状态机归纳。
lemma ExecuteStepOnceRunCanReachRuntimeStepDispatch(
  obs: ExecuteStepObs,
  input: ExecuteStepInput
)
  requires obs.claimed == Ok(true)
  requires obs.stateResult.Ok?
  requires obs.stateResult.value.stepCount <= input.stepIndex
  requires obs.stateResult.value.status != StatusInterrupted
  requires obs.stateResult.value.status != StatusDone
  requires obs.stateResult.value.status != StatusError
  requires !input.hasHumanInput
  requires !input.hasApprovedToolCall
  requires !input.hasRejectionReason
  requires RuntimeStepCallsToolAtIndex(obs.runtimeStep, 0)
  requires PCallToolGatewaySucceeded(
    obs.runtimeStep.callToolCtx,
    obs.runtimeStep.callToolInstruction,
    AgentState(
      obs.stateResult.value.status,
      obs.stateResult.value.stepCount + 1,
      obs.stateResult.value.hasCostLimit,
      obs.stateResult.value.totalCostExceeded,
      obs.stateResult.value.costLimitPolicy,
      obs.stateResult.value.operationToolSource,
      obs.stateResult.value.fallbackToolSource
    ),
    obs.runtimeStep.callTool
  )
  ensures QDispatchCalled(
    obs.runtimeStep.callToolCtx,
    AgentState(
      obs.stateResult.value.status,
      obs.stateResult.value.stepCount + 1,
      obs.stateResult.value.hasCostLimit,
      obs.stateResult.value.totalCostExceeded,
      obs.stateResult.value.costLimitPolicy,
      obs.stateResult.value.operationToolSource,
      obs.stateResult.value.fallbackToolSource
    ),
    obs.runtimeStep.callToolInstruction,
    obs.runtimeStep.callTool
  )
{
  RuntimeStepOnceRunCallToolAtIndexCanDispatch(
    obs.runtimeStep,
    RuntimeStepInput(
      RuntimeStepState(
        obs.stateResult.value.status,
        obs.stateResult.value.stepCount,
        obs.stateResult.value.hasMaxSteps,
        obs.stateResult.value.maxSteps,
        obs.stateResult.value.forceFinish,
        obs.stateResult.value.hasCostLimit,
        obs.stateResult.value.totalCostExceeded,
        obs.stateResult.value.costLimitPolicy,
        obs.stateResult.value.operationToolSource,
        obs.stateResult.value.fallbackToolSource
      ),
      input.context
    ),
    0
  );
}

// ============================================================
// Lemmas
//
// 原则:
//   - Modeling 定义在前
//   - Lemma 放在文件后部
//   - 先覆盖单条分支性质，再逐步扩展到更多路径
// ============================================================
// TODO: 等 runtimeStep 也迁移为同样的依赖输入风格后，
// 再补真正连接 ExecuteStep 与下层 black-box 的 theorem / proof method。
