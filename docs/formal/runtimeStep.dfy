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
datatype RuntimeStepState = RuntimeStepState(
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

datatype RuntimeStepInput = RuntimeStepInput(
  state: RuntimeStepState,
  context: RuntimeContext
)

function HumanInstructionFree(raw: RawInstructionsObs): bool
{
  (raw.single.kind == InstrCallLlm ||
   raw.single.kind == InstrCallTool ||
   raw.single.kind == InstrFinish ||
   raw.single.kind == InstrCallToolsBatch) &&
  (forall i :: 0 <= i < |raw.items| ==>
    (raw.items[i].kind == InstrCallLlm ||
     raw.items[i].kind == InstrCallTool ||
     raw.items[i].kind == InstrFinish ||
     raw.items[i].kind == InstrCallToolsBatch))
}

method CreateErrorResult(state: RuntimeStepState) returns (result: FResult<RuntimeStepResult>)
  ensures result.Ok?
  ensures result.value.newState.status == StatusError
  ensures result.value.newState.stepCount == state.stepCount
{
  result := Ok(RuntimeStepResult(
    AgentState(
      StatusError,
      state.stepCount,
      state.hasCostLimit,
      state.totalCostExceeded,
      state.costLimitPolicy,
      state.operationToolSource,
      state.fallbackToolSource
    ),
    EmptyRuntimeContext()
  ));
}

// ============================================================
// L2: runtime.step 骨架
// ============================================================
method RuntimeStep(obs: RuntimeStepObs, input: RuntimeStepInput)
  returns (result: FResult<RuntimeStepResult>, ghost executeCallToolSucceeded: bool)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Err? || HumanInstructionFree(obs.runnerResult.value)
  ensures obs.runnerResult.Err? ==>
    result.Ok? && result.value.newState.status == StatusError
  ensures (obs.runnerResult.Ok? &&
    !obs.runnerResult.value.isArray &&
    obs.runnerResult.value.single.kind == InstrCallTool &&
    |obs.instructionResults| > 0 &&
    ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
    obs.callToolInstruction.toolCalling.executor == "client" &&
    obs.callToolCtx.streamManagerCanSendToolExecute &&
    obs.callTool.dispatched.Ok? &&
    obs.callTool.persisted.Ok?) ==>
    result.Ok?
  ensures executeCallToolSucceeded ==> obs.runnerResult.Ok?
{
  executeCallToolSucceeded := false;
  ghost var expectExecuteCallToolSuccess :=
    obs.runnerResult.Ok? &&
    !obs.runnerResult.value.isArray &&
    obs.runnerResult.value.single.kind == InstrCallTool &&
    |obs.instructionResults| > 0 &&
    ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
    obs.callToolInstruction.toolCalling.executor == "client" &&
    obs.callToolCtx.streamManagerCanSendToolExecute &&
    obs.callTool.dispatched.Ok? &&
    obs.callTool.persisted.Ok?;
  var preparedState :=
    RuntimeStepState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasMaxSteps,
      input.state.maxSteps,
      input.state.forceFinish,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    );

  var forceFinish := preparedState.forceFinish;
  if preparedState.hasMaxSteps && preparedState.stepCount > preparedState.maxSteps {
    if forceFinish {
      // Already in forceFinish flow, skip maxSteps check and continue execution
    } else {
      // First time exceeding: set forceFinish flag
      forceFinish := true;
    }
  }

  preparedState := RuntimeStepState(
    preparedState.status,
    preparedState.stepCount,
    preparedState.hasMaxSteps,
    preparedState.maxSteps,
    forceFinish,
    preparedState.hasCostLimit,
    preparedState.totalCostExceeded,
    preparedState.costLimitPolicy,
    preparedState.operationToolSource,
    preparedState.fallbackToolSource
  );

  var runtimeContext: RuntimeContext;
  if input.context.present {
    runtimeContext := input.context;
  } else {
    runtimeContext := obs.initialContext;
  }
  assert runtimeContext.phase != PhaseHumanApprovedTool;

  var rawInstructionsResult := obs.runnerResult;
  match rawInstructionsResult {
    case Err(_) => {
      result := CreateErrorResult(preparedState);
      return;
    }
    case Ok(plan) => {
      assert HumanInstructionFree(plan);
    }
  }

  var rawInstructions := rawInstructionsResult.value;
  var normalizedKinds: seq<InstructionKind>;
  if rawInstructions.isArray {
    normalizedKinds := [];
    var normalizeIndex := 0;
    while normalizeIndex < |rawInstructions.items|
      invariant 0 <= normalizeIndex <= |rawInstructions.items|
      invariant |normalizedKinds| == normalizeIndex
    {
      var instruction := rawInstructions.items[normalizeIndex];
      if instruction.kind == InstrCallToolsBatch {
        if instruction.payloadIsOldToolsArray {
          normalizedKinds := normalizedKinds + [InstrCallToolsBatch];
        } else {
          normalizedKinds := normalizedKinds + [InstrCallToolsBatch];
        }
      } else {
        normalizedKinds := normalizedKinds + [instruction.kind];
      }
      normalizeIndex := normalizeIndex + 1;
    }
  } else {
    if rawInstructions.single.kind == InstrCallToolsBatch {
      if rawInstructions.single.payloadIsOldToolsArray {
        normalizedKinds := [InstrCallToolsBatch];
      } else {
        normalizedKinds := [InstrCallToolsBatch];
      }
    } else {
      normalizedKinds := [rawInstructions.single.kind];
    }
  }
  var currentState := AgentState(
    preparedState.status,
    preparedState.stepCount,
    preparedState.hasCostLimit,
    preparedState.totalCostExceeded,
    preparedState.costLimitPolicy,
    preparedState.operationToolSource,
    preparedState.fallbackToolSource
  );
  var finalContext := EmptyRuntimeContext();
  var hasFinishInstruction := false;
  var i := 0;

  while i < |normalizedKinds|
    invariant 0 <= i <= |normalizedKinds|
  {
    if i >= |obs.instructionResults| {
      result := CreateErrorResult(preparedState);
      return;
    }

    if normalizedKinds[i] == InstrFinish {
      hasFinishInstruction := true;
    }

    var exec: FResult<RuntimeStepResult>;
    if normalizedKinds[i] == InstrCallLlm {
      if i >= |obs.llmResults| {
        result := CreateErrorResult(preparedState);
        return;
      }
      exec := obs.llmResults[i];
    } else if normalizedKinds[i] == InstrCallTool {
      exec := ExecuteCallTool(
        obs.callTool,
        obs.callToolCtx,
        obs.callToolInstruction,
        currentState
      );
      match exec {
        case Err(_) => {
          if expectExecuteCallToolSuccess {
            assert false;
          }
          result := CreateErrorResult(preparedState);
          return;
        }
        case Ok(r) => {
          executeCallToolSucceeded := true;
        }
      }
    } else if normalizedKinds[i] == InstrCallToolsBatch {
      if i >= |obs.batchCustomExecutorPresent| {
        result := CreateErrorResult(preparedState);
        return;
      }

      if obs.batchCustomExecutorPresent[i] {
        if i >= |obs.batchCustomResults| {
          result := CreateErrorResult(preparedState);
          return;
        }
        exec := obs.batchCustomResults[i];
      } else {
        if i >= |obs.batchBuiltinResults| {
          result := CreateErrorResult(preparedState);
          return;
        }
        exec := obs.batchBuiltinResults[i];
      }
    } else if normalizedKinds[i] == InstrFinish {
      exec := Ok(obs.finishResult);
    } else {
      exec := obs.instructionResults[i];
    }

    var instructionResult: RuntimeStepResult;
    match exec {
      case Err(_) => {
        result := CreateErrorResult(preparedState);
        return;
      }
      case Ok(r) => {
        instructionResult := r;
      }
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

predicate PRuntimeStepSingleCallToolSuccess(obs: RuntimeStepObs, input: RuntimeStepInput)
{
  (!input.context.present || input.context.phase != PhaseHumanApprovedTool) &&
  obs.initialContext.phase != PhaseHumanApprovedTool &&
  obs.runnerResult.Ok? &&
  HumanInstructionFree(obs.runnerResult.value) &&
  !obs.runnerResult.value.isArray &&
  obs.runnerResult.value.single.kind == InstrCallTool &&
  |obs.instructionResults| > 0 &&
  ((if input.state.operationToolSource != "" then input.state.operationToolSource else input.state.fallbackToolSource) != "client") &&
  obs.callToolInstruction.toolCalling.executor == "client" &&
  obs.callToolCtx.streamManagerCanSendToolExecute &&
  obs.callTool.dispatched.Ok? &&
  obs.callTool.persisted.Ok?
}

method RuntimeStepSingleCallToolSuccessProof(obs: RuntimeStepObs, input: RuntimeStepInput)
  returns (callToolResult: FResult<RuntimeStepResult>, ghost executeCallToolSucceeded: bool)
  requires PRuntimeStepSingleCallToolSuccess(obs, input)
  ensures executeCallToolSucceeded
  ensures callToolResult.Ok?
{
  callToolResult := ExecuteCallTool(
    obs.callTool,
    obs.callToolCtx,
    obs.callToolInstruction,
    AgentState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    )
  );
  assert callToolResult.Ok?;
  executeCallToolSucceeded := true;
  var runtimeStepResult: FResult<RuntimeStepResult>;
  ghost var runtimeStepGhost: bool;
  runtimeStepResult, runtimeStepGhost := RuntimeStep(obs, input);
}
