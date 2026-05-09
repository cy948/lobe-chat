// ============================================================
// callTool — formal module for RuntimeExecutors.call_tool
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
include "toolExecution.dfy"

datatype CallToolInput = CallToolInput(
  state: AgentState,
  toolSourceClient: bool,
  executorClient: bool,
  gatewayAvailable: bool,
  skipCreateToolMessage: bool,
  serverToolKind: ToolKind,
  builtinInput: BuiltinExecutionInput
)

datatype CallToolStage =
  | ClientToolPaused
  | GatewayDispatched
  | ServerExecuted
  | PersistFailed

// Trust Base: dispatchClientTool(...)
// 假设: gateway 路径返回一次工具执行结果
method DispatchClientTool() returns (result: FResult<bool>)
{
  assume {:axiom} false;
}

// Trust Base: tool message persistence
// 假设: 持久化成功返回 Ok；失败返回 Err
method PersistToolMessage(skipCreateToolMessage: bool) returns (result: FResult<bool>)
{
  assume {:axiom} false;
}

method CallTool(input: CallToolInput)
  returns (result: FResult<RuntimeStepResult>, ghost stage: CallToolStage)
  ensures result.Ok? ==> result.value.newState.stepCount == input.state.stepCount
  ensures stage.ClientToolPaused? ==> result.Ok? && result.value.newState.status == StatusInterrupted
  ensures stage.ClientToolPaused? ==> !result.value.nextContext.present
  ensures stage.GatewayDispatched? ==> result.Ok? && result.value.newState.status == input.state.status
  ensures stage.GatewayDispatched? ==> result.value.nextContext.present && result.value.nextContext.phase == PhaseToolResult
  ensures stage.ServerExecuted? ==> result.Ok? && result.value.newState.status == input.state.status
  ensures stage.ServerExecuted? ==> result.value.nextContext.present && result.value.nextContext.phase == PhaseToolResult
  ensures stage.PersistFailed? ==> result.Err?
{
  if input.toolSourceClient {
    stage := ClientToolPaused;
    result := Ok(RuntimeStepResult(
      AgentState(StatusInterrupted, input.state.stepCount, input.state.hasCostLimit, input.state.totalCostExceeded, input.state.costLimitPolicy),
      RuntimeContext(false, PhaseNone)
    ));
    return;
  }

  if input.executorClient && input.gatewayAvailable {
    var dispatched := DispatchClientTool();
    if dispatched.Err? {
      stage := PersistFailed;
      result := Err("gateway dispatch failed");
      return;
    }

    var persistedGateway := PersistToolMessage(input.skipCreateToolMessage);
    if persistedGateway.Err? {
      stage := PersistFailed;
      result := Err("tool message persist failed");
      return;
    }

    stage := GatewayDispatched;
    result := Ok(RuntimeStepResult(
      input.state,
      RuntimeContext(true, PhaseToolResult)
    ));
    return;
  }

  var executed, _ := ExecuteTool(ToolExecutionInput(input.serverToolKind), input.builtinInput);
  if !executed.success {
    stage := PersistFailed;
    result := Err("server tool execution failed");
    return;
  }

  var persisted := PersistToolMessage(input.skipCreateToolMessage);
  if persisted.Err? {
    stage := PersistFailed;
    result := Err("tool message persist failed");
    return;
  }

  stage := ServerExecuted;
  result := Ok(RuntimeStepResult(
    input.state,
    RuntimeContext(true, PhaseToolResult)
  ));
}
