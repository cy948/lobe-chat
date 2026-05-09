// ============================================================
// callTool — formal module for createRuntimeExecutors(ctx).call_tool(...)
//
// 对应 TS: src/server/modules/AgentRuntime/RuntimeExecutors.ts:1392 call_tool
//
// 当前目标:
//   先建模 call_tool 的三分支骨架与返回语义:
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

method PersistToolMessage(deps: CallToolDeps, skipCreateToolMessage: bool) returns (result: FResult<bool>)
  ensures result == deps.persisted
{
  result := deps.persisted;
}

// ============================================================
// L2: call_tool skeleton
// ============================================================
function CallToolSpec(deps: CallToolDeps, input: CallToolInput): FResult<RuntimeStepResult>
{
  if input.instruction.toolSource == ToolSourceClient then
    Ok(RuntimeStepResult(
      AgentState(
        StatusInterrupted,
        input.state.stepCount,
        input.state.hasCostLimit,
        input.state.totalCostExceeded,
        input.state.costLimitPolicy
      ),
      RuntimeContext(false, PhaseNone)
    ))
  else if input.instruction.toolExecutor == ToolExecutorClient &&
          input.ctx.streamManagerCanSendToolExecute then
    if deps.dispatched.Err? then
      Err("gateway dispatch failed")
    else if deps.persisted.Err? then
      Err("tool message persist failed")
    else
      Ok(RuntimeStepResult(
        input.state,
        RuntimeContext(true, PhaseToolResult)
      ))
  else
    if !ExecuteToolSpec(
      deps.toolExecution,
      ToolExecutionInput(input.instruction.serverToolKind),
      input.instruction.builtinInput
    ).success then
      Err("server tool execution failed")
    else if deps.persisted.Err? then
      Err("tool message persist failed")
    else
      Ok(RuntimeStepResult(
        input.state,
        RuntimeContext(true, PhaseToolResult)
      ))
}

method CallTool(deps: CallToolDeps, input: CallToolInput)
  returns (result: FResult<RuntimeStepResult>)
  ensures result == CallToolSpec(deps, input)
{
  if input.instruction.toolSource == ToolSourceClient {
    result := Ok(RuntimeStepResult(
      AgentState(
        StatusInterrupted,
        input.state.stepCount,
        input.state.hasCostLimit,
        input.state.totalCostExceeded,
        input.state.costLimitPolicy
      ),
      RuntimeContext(false, PhaseNone)
    ));
    return;
  }

  if input.instruction.toolExecutor == ToolExecutorClient &&
      input.ctx.streamManagerCanSendToolExecute {
    var dispatched := DispatchClientTool(deps);
    if dispatched.Err? {
      result := Err("gateway dispatch failed");
      return;
    }

    var persistedGateway := PersistToolMessage(deps, input.instruction.skipCreateToolMessage);
    if persistedGateway.Err? {
      result := Err("tool message persist failed");
      return;
    }

    result := Ok(RuntimeStepResult(
      input.state,
      RuntimeContext(true, PhaseToolResult)
    ));
    return;
  }

  var executed := ExecuteTool(
    deps.toolExecution,
    ToolExecutionInput(input.instruction.serverToolKind),
    input.instruction.builtinInput
  );
  if !executed.success {
    result := Err("server tool execution failed");
    return;
  }

  var persisted := PersistToolMessage(deps, input.instruction.skipCreateToolMessage);
  if persisted.Err? {
    result := Err("tool message persist failed");
    return;
  }

  result := Ok(RuntimeStepResult(
    input.state,
    RuntimeContext(true, PhaseToolResult)
  ));
}
