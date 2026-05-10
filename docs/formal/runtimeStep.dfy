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
  returns (result: FResult<RuntimeStepResult>)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Err? || HumanInstructionFree(obs.runnerResult.value)
{
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

function RuntimeStepCallsToolAtIndex(obs: RuntimeStepObs, k: int): bool
{
  obs.runnerResult.Ok? &&
  (
    (!obs.runnerResult.value.isArray &&
      k == 0 &&
      obs.runnerResult.value.single.kind == InstrCallTool) ||
    (obs.runnerResult.value.isArray &&
      0 <= k < |obs.runnerResult.value.items| &&
      obs.runnerResult.value.items[k].kind == InstrCallTool)
  )
}

// 单次运行版本：
//   这里只证明一次 RuntimeStep 调用内部，若第 k 条 call_tool 被执行到，
//   且该次 call_tool 入口满足 gateway dispatch 的充分前提，
//   则这一次运行中会观测到一次 dispatch called。
lemma RuntimeStepOnceRunCallToolAtIndexCanDispatch(
  obs: RuntimeStepObs,
  input: RuntimeStepInput,
  k: int
)
  requires !input.context.present || input.context.phase != PhaseHumanApprovedTool
  requires obs.initialContext.phase != PhaseHumanApprovedTool
  requires obs.runnerResult.Err? || HumanInstructionFree(obs.runnerResult.value)
  requires RuntimeStepCallsToolAtIndex(obs, k)
  requires obs.runnerResult.value.isArray ==> forall j :: 0 <= j < k ==> obs.runnerResult.value.items[j].kind == InstrCallLlm
  requires forall j :: 0 <= j < k ==>
    j < |obs.llmResults| &&
    obs.llmResults[j].Ok? &&
    obs.llmResults[j].value.newState ==
      AgentState(
        input.state.status,
        input.state.stepCount + 1,
        input.state.hasCostLimit,
        input.state.totalCostExceeded,
        input.state.costLimitPolicy,
        input.state.operationToolSource,
        input.state.fallbackToolSource
      ) &&
    obs.llmResults[j].value.newState.status != StatusWaitingForHuman &&
    obs.llmResults[j].value.newState.status != StatusInterrupted
  requires PCallToolGatewaySucceeded(obs.callToolCtx, obs.callToolInstruction,
    AgentState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    ),
    obs.callTool)
  ensures QDispatchCalled(
    obs.callToolCtx,
    AgentState(
      input.state.status,
      input.state.stepCount + 1,
      input.state.hasCostLimit,
      input.state.totalCostExceeded,
      input.state.costLimitPolicy,
      input.state.operationToolSource,
      input.state.fallbackToolSource
    ),
    obs.callToolInstruction,
    obs.callTool)
{
  CallToolGatewaySucceededImpliesCalled(
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
    ),
    obs.callTool
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
// TODO: 等 callTool / toolExecution 也迁移为同样的 obs-driven 风格后，
// 再补真正连接 RuntimeStep 与下层 black-box 的 lemma，
// 以及顺序推进所需的小步关系 / 归纳不变量。
