// ============================================================
// callTool — formal module for createRuntimeExecutors(ctx).call_tool(...)
//
// 对应 TS:
//   src/server/modules/AgentRuntime/RuntimeExecutors.ts createRuntimeExecutors(...)
//   src/server/modules/AgentRuntime/RuntimeExecutors.ts:1392 call_tool
//
// 当前目标:
//   在不实化 JS 闭包对象的前提下，直接用参数传递表达：
//   createRuntimeExecutors(ctx) 返回的 call_tool(instruction, state)
//
//   当前 formal 选择翻译为：
//   ExecuteCallTool(obs, ctx, instruction, state)
//
//   然后建模 call_tool 的三分支骨架与返回语义:
//   - client-source pause/interrupted
//   - gateway client dispatch
//   - server-side execute
//   - persist failure as fatal error
// ============================================================

include "types.dfy"
include "obs.dfy"
include "toolExecution.dfy"

// ============================================================
// L3 cut points
//
// obs 决定黑盒结果。
// ============================================================
method DispatchClientTool(obs: CallToolObs) returns (result: FResult<bool>)
  ensures result == obs.dispatched
{
  result := obs.dispatched;
}

method PersistToolMessage(obs: CallToolObs, skipCreateToolMessage: bool) returns (result: FResult<string>)
  ensures result == obs.persisted
{
  result := obs.persisted;
}

function NoContext(): RuntimeContext
{
  EmptyRuntimeContext()
}

function ToolResultContext(
  ctx: CallToolCtx,
  state: AgentState,
  instruction: CallToolInstruction,
  toolMessageId: string,
  executionResult: ToolExecutionOutcome
): RuntimeContext
{
  RuntimeContext(
    true,
    PhaseToolResult,
    true,
    ToolResultPayload(
      executionResult,
      executionResult.executionTime,
      executionResult.success,
      toolMessageId,
      instruction.toolCalling,
      instruction.toolCalling.id
    ),
    true,
    RuntimeSession(
      ctx.operationId,
      "running",
      state.stepCount + 1
    )
  )
}

// ============================================================
// Backward proof entry: gateway tool-call dispatch
//
// Q_dispatchCalled:
//   这次 call_tool 执行走到了 gateway client dispatch 分支，
//   因而发生了一次 DispatchClientTool(...) 调用。
//
// P_callToolGateway:
//   从 Q 倒推得到的当前最小前提，只覆盖 gateway dispatch 分支。
// ============================================================
function QDispatchCalled(
  ctx: CallToolCtx,
  state: AgentState,
  instruction: CallToolInstruction,
  obs: CallToolObs
): bool
{
  (if state.operationToolSource != "" then state.operationToolSource else state.fallbackToolSource) != "client" &&
  instruction.toolCalling.executor == "client" &&
  ctx.streamManagerCanSendToolExecute &&
  obs.dispatchCalled
}

function PCallToolGateway(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState,
  obs: CallToolObs
): bool
{
  (if state.operationToolSource != "" then state.operationToolSource else state.fallbackToolSource) != "client" &&
  instruction.toolCalling.executor == "client" &&
  ctx.streamManagerCanSendToolExecute &&
  obs.dispatchCalled
}

function PCallToolGatewaySucceeded(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState,
  obs: CallToolObs
): bool
{
  PCallToolGateway(ctx, instruction, state, obs) &&
  obs.dispatched.Ok? &&
  obs.persisted.Ok?
}

lemma CallToolGatewayBranchSuffices(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState,
  obs: CallToolObs
)
  requires PCallToolGateway(ctx, instruction, state, obs)
  ensures QDispatchCalled(ctx, state, instruction, obs)
{
}

lemma CallToolGatewaySucceededImpliesCalled(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState,
  obs: CallToolObs
)
  requires PCallToolGatewaySucceeded(ctx, instruction, state, obs)
  ensures QDispatchCalled(ctx, state, instruction, obs)
{
}

method ExecuteCallToolGatewayDispatchCalled(
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState,
  obs: CallToolObs
) returns (result: FResult<RuntimeStepResult>)
  requires PCallToolGatewaySucceeded(ctx, instruction, state, obs)
  ensures QDispatchCalled(ctx, state, instruction, obs)
  ensures result.Ok?
{
  CallToolGatewaySucceededImpliesCalled(ctx, instruction, state, obs);
  result := ExecuteCallTool(obs, ctx, instruction, state);
}

method ExecuteCallTool(
  obs: CallToolObs,
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState
)
  returns (result: FResult<RuntimeStepResult>)
  ensures PCallToolGatewaySucceeded(ctx, instruction, state, obs) ==> result.Ok?
{
  var toolCalling := instruction.toolCalling;
  var toolSource :=
    if state.operationToolSource != "" then
      state.operationToolSource
    else
      state.fallbackToolSource;

  if toolSource == "client" {
    result := Ok(RuntimeStepResult(
      AgentState(
        StatusInterrupted,
        state.stepCount,
        state.hasCostLimit,
        state.totalCostExceeded,
        state.costLimitPolicy,
        state.operationToolSource,
        state.fallbackToolSource
      ),
      NoContext()
    ));
    return;
  }

  if toolCalling.executor == "client" &&
      ctx.streamManagerCanSendToolExecute {
    if PCallToolGatewaySucceeded(ctx, instruction, state, obs) {
      assert obs.dispatched.Ok?;
      assert obs.persisted.Ok?;
    }

    var dispatched := DispatchClientTool(obs);
    if dispatched.Err? {
      result := Err("gateway dispatch failed");
      return;
    }

    var persistedGateway := PersistToolMessage(obs, instruction.skipCreateToolMessage);
    if persistedGateway.Err? {
      result := Err("tool message persist failed");
      return;
    }

    result := Ok(RuntimeStepResult(
      state,
      ToolResultContext(
        ctx,
        state,
        instruction,
        persistedGateway.value,
        ToolExecutionOutcome(true, 0)
      )
    ));
    return;
  }

  var executed := ExecuteTool(
    obs.toolExecution,
    ToolExecutionPayload(
      toolCalling.identifier,
      toolCalling.apiName,
      toolCalling.kind,
      toolCalling.source,
      toolCalling.executor,
      toolCalling.builtinContext
    ),
    ToolExecutionContextInput("", "")
  );
  if !executed.success {
    result := Err("server tool execution failed");
    return;
  }

  var persisted := PersistToolMessage(obs, instruction.skipCreateToolMessage);
  if persisted.Err? {
    result := Err("tool message persist failed");
    return;
  }

  result := Ok(RuntimeStepResult(
    state,
    ToolResultContext(ctx, state, instruction, persisted.value, executed)
  ));
}
