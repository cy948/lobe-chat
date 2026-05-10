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

method ExecuteCallTool(
  obs: CallToolObs,
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState
)
  returns (result: FResult<RuntimeStepResult>)
  ensures (if state.operationToolSource != "" then state.operationToolSource else state.fallbackToolSource) == "client" ==>
    result.Ok? && result.value.newState.status == StatusInterrupted
  ensures ((if state.operationToolSource != "" then state.operationToolSource else state.fallbackToolSource) != "client" &&
    instruction.toolCalling.executor == "client" &&
    ctx.streamManagerCanSendToolExecute &&
    obs.dispatched.Ok? &&
    obs.persisted.Ok?) ==>
    result.Ok?
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
    if obs.dispatched.Ok? && obs.persisted.Ok? {
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
