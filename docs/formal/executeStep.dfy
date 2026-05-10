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

// ============================================================
// L3 Cut Point: Redis step lock
//
// obs 决定黑盒结果:
//   - TryClaimStep 直接返回 obs.claimed
// ============================================================
method TryClaimStep(deps: ExecuteStepDeps, operationId: string, stepIndex: int) returns (result: FResult<bool>)
  ensures result == deps.claimed
{
  result := deps.claimed;
}

// ============================================================
// L3 Cut Point: coordinator.loadAgentState
//
// obs 决定黑盒结果:
//   - LoadAgentState 直接返回 obs.stateResult
// ============================================================
method LoadAgentState(deps: ExecuteStepDeps, operationId: string) returns (result: FResult<AgentState>)
  ensures result == deps.stateResult
{
  result := deps.stateResult;
}

// ============================================================
// L3 Cut Point: runtime.handleHumanIntervention
//
// obs 决定黑盒结果:
//   - HandleHumanIntervention 直接返回 obs.interventionResult
// ============================================================
method HandleHumanIntervention(deps: ExecuteStepDeps, state: AgentState, input: ExecuteStepInput)
  returns (result: FResult<RuntimeStepResult>)
  ensures result == deps.interventionResult
{
  result := deps.interventionResult;
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
method ExecuteStep(deps: ExecuteStepDeps, input: ExecuteStepInput)
  returns (result: FResult<ExecuteStepResult>)
{
  var claimed := TryClaimStep(deps, input.operationId, input.stepIndex);
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

  var stateResult := LoadAgentState(deps, input.operationId);
  var state: AgentState;
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
      state,
      false,
      true
    ));
    return;
  }

  if state.status == StatusInterrupted || state.status == StatusDone || state.status == StatusError {
    result := Ok(ExecuteStepResult(
      false,
      false,
      state,
      false,
      true
    ));
    return;
  }

  var currentState := state;
  var currentContext := input.context;
  if input.hasHumanInput || input.hasApprovedToolCall || input.hasRejectionReason {
    var intervention := HandleHumanIntervention(deps, state, input);
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

  var stepped := RuntimeStep(deps.runtimeStep, RuntimeStepInput(currentState, currentContext));
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
