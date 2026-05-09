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
include "obs.dfy"
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
method CallTool(deps: CallToolDeps, input: CallToolInput)
  returns (result: FResult<RuntimeStepResult>)
  ensures input.toolSourceClient ==>
          result == Ok(RuntimeStepResult(
            AgentState(
              StatusInterrupted,
              input.state.stepCount,
              input.state.hasCostLimit,
              input.state.totalCostExceeded,
              input.state.costLimitPolicy
            ),
            RuntimeContext(false, PhaseNone)
          ))
  ensures (!input.toolSourceClient &&
          input.executorClient &&
          input.gatewayAvailable &&
          deps.dispatched.Err?) ==> result.Err?
  ensures (!input.toolSourceClient &&
          input.executorClient &&
          input.gatewayAvailable &&
          deps.dispatched.Ok? &&
          deps.persisted.Err?) ==> result.Err?
  ensures (!input.toolSourceClient &&
          input.executorClient &&
          input.gatewayAvailable &&
          deps.dispatched.Ok? &&
          deps.persisted.Ok?) ==>
          result == Ok(RuntimeStepResult(
            input.state,
            RuntimeContext(true, PhaseToolResult)
          ))
  ensures (!input.toolSourceClient &&
          !(input.executorClient && input.gatewayAvailable) &&
          input.serverToolKind == ToolMcp &&
          deps.toolExecution.mcpResult.Err?) ==> result.Err?
{
  if input.toolSourceClient {
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

  if input.executorClient && input.gatewayAvailable {
    var dispatched := DispatchClientTool(deps);
    if dispatched.Err? {
      result := Err("gateway dispatch failed");
      return;
    }

    var persistedGateway := PersistToolMessage(deps, input.skipCreateToolMessage);
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

  var executed := ExecuteTool(deps.toolExecution, ToolExecutionInput(input.serverToolKind), input.builtinInput);
  if !executed.success {
    result := Err("server tool execution failed");
    return;
  }

  var persisted := PersistToolMessage(deps, input.skipCreateToolMessage);
  if persisted.Err? {
    result := Err("tool message persist failed");
    return;
  }

  result := Ok(RuntimeStepResult(
    input.state,
    RuntimeContext(true, PhaseToolResult)
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
// TODO: 等 dispatchClientTool / persist / toolExecution 的规范进一步收紧后，
// 再补真正有业务含义的 lemma。
