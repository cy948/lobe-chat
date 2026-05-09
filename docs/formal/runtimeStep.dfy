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
//   - human_approved_tool shortcut
//   - runner / executor / batch-executor 分发
//   - blocked / finish / error 收尾
// ============================================================

include "types.dfy"
include "callTool.dfy"

// ============================================================
// Local projection: runtime.step 的输入/中间值
// ============================================================
datatype RuntimeStepInput = RuntimeStepInput(state: AgentState, context: RuntimeContext)

datatype RuntimeStepStage =
  | Prepared
  | ContextReady
  | ApprovedToolShortcut
  | RunnerPlanned
  | ExecuteFailed
  | Blocked
  | Finished
  | Continued
  | CaughtError

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
// L3 cut points
// ============================================================

// Trust Base: createInitialContext
// 假设: 当调用方未传 context 时，runtime 能根据 state 生成一个合法初始 context
method CreateInitialContext(state: AgentState) returns (context: RuntimeContext)
{
  assume {:axiom} false;
}

// Trust Base: agent.runner(...)
// 假设: 对给定 context/state 返回一组待执行 instruction 的最小投影
method RunnerPlan(context: RuntimeContext, state: AgentState) returns (result: FResult<PlannedInstructions>)
{
  assume {:axiom} false;
}

// Trust Base: single instruction execution
// 假设:
//   - 已完成 instruction.type 到具体 executor 的分发
//   - call_tools_batch 的 custom-executor / built-in fallback 已在该边界内处理
//   - 返回该 instruction 执行后的 newState / nextContext
method ExecuteInstruction(
  kind: InstructionKind,
  state: AgentState,
  context: RuntimeContext
) returns (result: FResult<RuntimeStepResult>)
  ensures result.Ok? ==> result.value.newState.stepCount == state.stepCount
{
  if kind == InstrCallTool {
    var toolResult, _ := CallTool(CallToolInput(
      state,
      false,
      false,
      false,
      false,
      ToolBuiltin,
      BuiltinExecutionInput(
        false,
        true,
        false,
        SourceNone,
        true,
        true,
        true,
        false,
        LocalSystemInput(true, true, true, true, true)
      )
    ));
    result := toolResult;
    return;
  }

  assume {:axiom} false;
}

// ============================================================
// Local helpers
// ============================================================
function PreparedState(state: AgentState): AgentState
{
  AgentState(
    state.status,
    state.stepCount + 1,
    state.hasCostLimit,
    state.totalCostExceeded,
    state.costLimitPolicy
  )
}

function FinalizeStepState(stateAfterExecution: AgentState, preparedState: AgentState, hasFinish: bool): AgentState
{
  AgentState(
    stateAfterExecution.status,
    if hasFinish then
      preparedState.stepCount - 1
    else
      preparedState.stepCount,
    stateAfterExecution.hasCostLimit,
    stateAfterExecution.totalCostExceeded,
    stateAfterExecution.costLimitPolicy
  )
}

function ClearContextWhenBlocked(state: AgentState, nextContext: RuntimeContext): RuntimeContext
{
  if state.status == StatusWaitingForHuman || state.status == StatusInterrupted then
    RuntimeContext(false, PhaseNone)
  else
    nextContext
}

// ============================================================
// L2: execute all normalized instructions sequentially
//
// 对应 TS:
//   packages/agent-runtime/src/core/runtime.ts:150-199
// 关键语义:
//   - instruction 按顺序执行
//   - finalNextContext 取“最后一个 present 的 nextContext”
//   - waiting_for_human / interrupted 会 break
// ============================================================
method ExecuteInstructions(
  plan: PlannedInstructions,
  state: AgentState,
  context: RuntimeContext
) returns (result: FResult<RuntimeStepResult>)
  ensures result.Ok? ==> result.value.newState.stepCount == state.stepCount
{
  var currentState := state;
  var finalContext := RuntimeContext(false, PhaseNone);
  var i := 0;

  while i < |plan.kinds|
    invariant 0 <= i <= |plan.kinds|
    invariant currentState.stepCount == state.stepCount
  {
    var exec := ExecuteInstruction(plan.kinds[i], currentState, context);
    var instructionResult: RuntimeStepResult;
    match exec {
      case Err(_) => {
        result := Err("instruction execution failed");
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

  result := Ok(RuntimeStepResult(currentState, finalContext));
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
// L2: runtime.step 骨架
// ============================================================
method RuntimeStep(input: RuntimeStepInput)
  returns (result: FResult<RuntimeStepResult>, ghost stage: RuntimeStepStage)
  ensures stage.Prepared? ==> input.state.stepCount + 1 > input.state.stepCount
  ensures stage.ContextReady? ==> result.Ok?
  ensures stage.ApprovedToolShortcut? ==> result.Ok?
  ensures stage.RunnerPlanned? ==> result.Ok?
  ensures stage.ExecuteFailed? ==> result.Err?
  ensures stage.CaughtError? ==> result.Ok? && result.value.newState.status == StatusError
  ensures stage.Blocked? ==> result.Ok? && !result.value.nextContext.present
  ensures stage.Finished? ==> result.Ok? && result.value.newState.stepCount == input.state.stepCount
  ensures stage.Continued? ==> result.Ok?
{
  var preparedState := PreparedState(input.state);
  stage := Prepared;

  var runtimeContext: RuntimeContext;
  if input.context.present {
    runtimeContext := input.context;
  } else {
    runtimeContext := CreateInitialContext(preparedState);
  }
  stage := ContextReady;

  var planResult: FResult<PlannedInstructions>;
  if runtimeContext.phase == PhaseHumanApprovedTool {
    stage := ApprovedToolShortcut;
    planResult := Ok(PlannedInstructions([InstrCallTool], false));
  } else {
    planResult := RunnerPlan(runtimeContext, preparedState);
    match planResult {
      case Err(_) => {
        stage := CaughtError;
        result := Ok(RuntimeStepResult(
          AgentState(StatusError, input.state.stepCount + 1, preparedState.hasCostLimit, preparedState.totalCostExceeded, preparedState.costLimitPolicy),
          RuntimeContext(false, PhaseNone)
        ));
        return;
      }
      case Ok(_) => {
        stage := RunnerPlanned;
      }
    }
  }

  var plan := planResult.value;
  var executed := ExecuteInstructions(plan, preparedState, runtimeContext);
  var stepResult: RuntimeStepResult;
  match executed {
    case Err(_) => {
      stage := ExecuteFailed;
      result := Err("instruction execution failed");
      return;
    }
    case Ok(r) => stepResult := r;
  }

  var finalState := FinalizeStepState(stepResult.newState, preparedState, plan.hasFinish);
  var finalContext := ClearContextWhenBlocked(finalState, stepResult.nextContext);
  result := Ok(RuntimeStepResult(finalState, finalContext));

  if finalState.status == StatusWaitingForHuman || finalState.status == StatusInterrupted {
    stage := Blocked;
  } else if plan.hasFinish {
    stage := Finished;
  } else {
    stage := Continued;
  }
}
