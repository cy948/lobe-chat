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
method ExecuteStep(deps: ExecuteStepDeps, req: RunStepRequest)
  returns (result: FResult<ExecuteStepResult>)
  requires req.operationId != ""
{
  var claimed := TryClaimStep(deps, req.operationId, req.stepIndex);
  match claimed {
    case Err(_) => {
      result := Err("claim step failed");
      return;
    }
    case Ok(false) => {
      result := Ok(ExecuteStepResult(
        true,
        false,
        AgentState(StatusRunning, 0, false, false, CostLimitContinue),
        false,
        false
      ));
      return;
    }
    case Ok(true) => {}
  }

  var stateResult := LoadAgentState(deps, req.operationId);
  var state: AgentState;
  match stateResult {
    case Err(_) => {
      result := Err("load state failed");
      return;
    }
    case Ok(s) => state := s;
  }

  if state.stepCount > req.stepIndex {
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

  var stepped := RuntimeStep(deps.runtimeStep, RuntimeStepInput(state, RuntimeContext(false, PhaseNone)));
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
