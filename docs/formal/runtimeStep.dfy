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
include "obs.dfy"
include "callTool.dfy"

// ============================================================
// Local projection: runtime.step 的输入
// ============================================================
datatype RuntimeStepInput = RuntimeStepInput(state: AgentState, context: RuntimeContext)

// ============================================================
// L3 cut points
//
// 关键原则:
//   obs 决定黑盒结果。
//
// RuntimeStep 自身仍然保留源码中的顺序控制流；
// obs 的作用不是直接替代 if/else 判断，而是作为参数传给黑盒函数，
// 由黑盒函数根据 obs 决定返回什么结果；RuntimeStep 再像源码一样，
// 只根据这些黑盒返回值继续做 if/else / loop。
// ============================================================
method CreateInitialContext(deps: RuntimeStepDeps, state: AgentState) returns (context: RuntimeContext)
  ensures context == deps.initialContext
{
  context := deps.initialContext;
}

method RunnerPlan(deps: RuntimeStepDeps, context: RuntimeContext, state: AgentState) returns (result: FResult<PlannedInstructions>)
  ensures result == deps.planResult
{
  result := deps.planResult;
}

method ExecuteInstruction(
  deps: RuntimeStepDeps,
  kind: InstructionKind,
  index: int,
  state: AgentState,
  context: RuntimeContext
) returns (result: FResult<RuntimeStepResult>)
  requires 0 <= index < |deps.instructionResults|
{
  if kind == InstrCallTool {
    result := CallTool(deps.callTool, CallToolInput(
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
    return;
  }

  result := deps.instructionResults[index];
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

function IsBlockingStatus(status: AgentStatus): bool
{
  status == StatusWaitingForHuman || status == StatusInterrupted
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
  deps: RuntimeStepDeps,
  plan: PlannedInstructions,
  state: AgentState,
  context: RuntimeContext
) returns (result: FResult<RuntimeStepResult>)
{
  var currentState := state;
  var finalContext := RuntimeContext(false, PhaseNone);
  var i := 0;

  while i < |plan.kinds|
    invariant 0 <= i <= |plan.kinds|
  {
    if i >= |deps.instructionResults| {
      result := Err("instruction observation missing");
      return;
    }

    var exec := ExecuteInstruction(deps, plan.kinds[i], i, currentState, context);
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

    if IsBlockingStatus(currentState.status) {
      break;
    }

    i := i + 1;
  }

  result := Ok(RuntimeStepResult(currentState, finalContext));
}

// ============================================================
// L2: runtime.step 骨架
// ============================================================
method RuntimeStep(deps: RuntimeStepDeps, input: RuntimeStepInput)
  returns (result: FResult<RuntimeStepResult>)
{
  var preparedState := PreparedState(input.state);

  var runtimeContext: RuntimeContext;
  if input.context.present {
    runtimeContext := input.context;
  } else {
    runtimeContext := CreateInitialContext(deps, preparedState);
  }

  var planResult: FResult<PlannedInstructions>;
  if runtimeContext.phase == PhaseHumanApprovedTool {
    planResult := Ok(PlannedInstructions([InstrCallTool], false));
  } else {
    planResult := RunnerPlan(deps, runtimeContext, preparedState);
    match planResult {
      case Err(_) => {
        result := Ok(RuntimeStepResult(
          AgentState(
            StatusError,
            input.state.stepCount + 1,
            preparedState.hasCostLimit,
            preparedState.totalCostExceeded,
            preparedState.costLimitPolicy
          ),
          RuntimeContext(false, PhaseNone)
        ));
        return;
      }
      case Ok(_) => {}
    }
  }

  var plan := planResult.value;
  var executed := ExecuteInstructions(deps, plan, preparedState, runtimeContext);
  var stepResult: RuntimeStepResult;
  match executed {
    case Err(_) => {
      result := Err("instruction execution failed");
      return;
    }
    case Ok(r) => stepResult := r;
  }

  var finalState := FinalizeStepState(stepResult.newState, preparedState, plan.hasFinish);
  var finalContext := ClearContextWhenBlocked(finalState, stepResult.nextContext);
  result := Ok(RuntimeStepResult(finalState, finalContext));
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
