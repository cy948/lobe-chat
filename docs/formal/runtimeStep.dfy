// ============================================================
// runtimeStep — formal module for AgentRuntime.step(...)
//
// 对应 TS: packages/agent-runtime/src/core/runtime.ts:79 step()
//
// 当前目标:
//   先建模 step() 自身的控制流骨架，不展开各 executor 细节。
//   关注:
//   - pre-step 状态推进
//   - runtimeContext 选择
//   - 非 human 主路径下的 runner / executor 分发
//   - blocked / finish / error 收尾
// ============================================================

include "types.dfy"
include "obs.dfy"
include "callTool.dfy"

// ============================================================
// Local projection: runtime.step 的输入
// ============================================================
datatype RuntimeStepInput = RuntimeStepInput(
  state: AgentState,
  context: RuntimeContext,
  hasMaxSteps: bool,
  maxSteps: int,
  forceFinish: bool
)

function HumanInstructionFree(plan: PlannedInstructions): bool
{
  forall i :: 0 <= i < |plan.kinds| ==>
    (plan.kinds[i] == InstrCallLlm ||
     plan.kinds[i] == InstrCallTool ||
     plan.kinds[i] == InstrFinish)
}

// ============================================================
// L2: runtime.step 骨架
// ============================================================
method RuntimeStep(obs: RuntimeStepObs, input: RuntimeStepInput)
  returns (result: FResult<RuntimeStepResult>)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.planResult.Err? || HumanInstructionFree(obs.planResult.value)
{
  var preparedState :=
    AgentState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    );

  var forceFinish := input.forceFinish;
  if input.hasMaxSteps && preparedState.stepCount > input.maxSteps {
    if forceFinish {
      // Already in forceFinish flow, skip maxSteps check and continue execution
    } else {
      // First time exceeding: set forceFinish flag
      forceFinish := true;
    }
  }

  if forceFinish {
    // RuntimeState projection note:
    // forceFinish is part of the runtime state in TS, but AgentState in types.dfy
    // intentionally stays minimal. We therefore keep the flag as a local runtime-step
    // projection rather than widening the shared type file.
  }

  var runtimeContext: RuntimeContext;
  if input.context.present {
    runtimeContext := input.context;
  } else {
    runtimeContext := obs.initialContext;
  }
  assert runtimeContext.phase != PhaseHumanApprovedTool;

  var planResult := obs.planResult;
  match planResult {
    case Err(_) => {
      result := Ok(RuntimeStepResult(
        AgentState(
          StatusError,
          preparedState.stepCount,
          preparedState.hasCostLimit,
          preparedState.totalCostExceeded,
          preparedState.costLimitPolicy,
          preparedState.operationToolSource,
          preparedState.fallbackToolSource
        ),
        EmptyRuntimeContext()
      ));
      return;
    }
    case Ok(plan) => {
      assert HumanInstructionFree(plan);
    }
  }

  var plan := planResult.value;
  var currentState := preparedState;
  var finalContext := EmptyRuntimeContext();
  var hasFinishInstruction := false;
  var i := 0;

  while i < |plan.kinds|
    invariant 0 <= i <= |plan.kinds|
  {
    if i >= |obs.instructionResults| {
      result := Ok(RuntimeStepResult(
        AgentState(
          StatusError,
          preparedState.stepCount,
          preparedState.hasCostLimit,
          preparedState.totalCostExceeded,
          preparedState.costLimitPolicy,
          preparedState.operationToolSource,
          preparedState.fallbackToolSource
        ),
        EmptyRuntimeContext()
      ));
      return;
    }

    if plan.kinds[i] == InstrFinish {
      hasFinishInstruction := true;
    }

    var exec: FResult<RuntimeStepResult>;
    if plan.kinds[i] == InstrCallLlm {
      if i >= |obs.llmResults| {
        result := Ok(RuntimeStepResult(
          AgentState(
            StatusError,
            preparedState.stepCount,
            preparedState.hasCostLimit,
            preparedState.totalCostExceeded,
            preparedState.costLimitPolicy,
            preparedState.operationToolSource,
            preparedState.fallbackToolSource
          ),
          EmptyRuntimeContext()
        ));
        return;
      }
      exec := obs.llmResults[i];
    } else if plan.kinds[i] == InstrCallTool {
      exec := ExecuteCallTool(
        obs.callTool,
        obs.callToolCtx,
        obs.callToolInstruction,
        currentState
      );
    } else if plan.kinds[i] == InstrFinish {
      exec := Ok(obs.finishResult);
    } else {
      exec := obs.instructionResults[i];
    }

    var instructionResult: RuntimeStepResult;
    match exec {
      case Err(_) => {
        result := Ok(RuntimeStepResult(
          AgentState(
            StatusError,
            preparedState.stepCount,
            preparedState.hasCostLimit,
            preparedState.totalCostExceeded,
            preparedState.costLimitPolicy,
            preparedState.operationToolSource,
            preparedState.fallbackToolSource
          ),
          EmptyRuntimeContext()
        ));
        return;
      }
      case Ok(r) => instructionResult := r;
    }

    currentState := instructionResult.newState;
    if instructionResult.nextContext.present {
      finalContext := instructionResult.nextContext;
    }

    if currentState.status == StatusWaitingForHuman || currentState.status == StatusInterrupted {
      break;
    }

    i := i + 1;
  }

  currentState := AgentState(
    currentState.status,
    preparedState.stepCount,
    currentState.hasCostLimit,
    currentState.totalCostExceeded,
    currentState.costLimitPolicy,
    currentState.operationToolSource,
    currentState.fallbackToolSource
  );

  if hasFinishInstruction {
    currentState := AgentState(
      currentState.status,
      if currentState.stepCount - 1 >= 0 then currentState.stepCount - 1 else 0,
      currentState.hasCostLimit,
      currentState.totalCostExceeded,
      currentState.costLimitPolicy,
      currentState.operationToolSource,
      currentState.fallbackToolSource
    );
  }

  result := Ok(RuntimeStepResult(
    currentState,
    if currentState.status == StatusWaitingForHuman || currentState.status == StatusInterrupted then
      EmptyRuntimeContext()
    else
      finalContext
  ));
}

// ============================================================
// Lemmas
//
// 原则:
//   - Modeling 定义在前
//   - Lemma 放在文件后部
//   - 先覆盖单条分支性质，再逐步扩展到更多路径
// ============================================================
// TODO: 等 callTool / toolExecution 也迁移为同样的 obs-driven 风格后，
// 再补真正连接 RuntimeStep 与下层 black-box 的 lemma，
// 以及顺序推进所需的小步关系 / 归纳不变量。
