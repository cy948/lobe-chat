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
method DispatchClientTool(deps: CallToolDeps) returns (result: FResult<bool>)
  ensures result == deps.dispatched
{
  result := deps.dispatched;
}

method PersistToolMessage(deps: CallToolDeps, skipCreateToolMessage: bool) returns (result: FResult<string>)
  ensures result == deps.persisted
{
  result := deps.persisted;
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
  obs: CallToolDeps,
  ctx: CallToolCtx,
  instruction: CallToolInstruction,
  state: AgentState
)
  returns (result: FResult<RuntimeStepResult>)
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
