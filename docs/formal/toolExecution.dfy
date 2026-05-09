// ============================================================
// toolExecution — formal module for ToolExecutionService.executeTool(...)
//
// 对应 TS: src/server/services/toolExecution/index.ts:60 executeTool()
//
// 当前目标:
//   先建模 executeTool 的最小控制流语义:
//   - payload.type === mcp 走 MCP 分支
//   - 其他类型默认走 builtin 分支
//   - 任一分支 throw 时，被 executeTool catch 并收口为 success=false
// ============================================================

include "types.dfy"
include "obs.dfy"
include "localSystemTool.dfy"

// ============================================================
// L3 cut points
//
// obs 决定黑盒结果。
// ============================================================
method ExecuteMcpTool(deps: ToolExecutionDeps) returns (result: FResult<ToolExecutionOutcome>)
  ensures result == deps.mcpResult
{
  result := deps.mcpResult;
}

method ExecuteBuiltinSpecialRoute(deps: ToolExecutionDeps, source: BuiltinSource) returns (result: ToolExecutionOutcome)
  ensures result == deps.builtinSpecialResult
{
  result := deps.builtinSpecialResult;
}

method ExecuteBuiltinRuntimeCall(deps: ToolExecutionDeps, runtimeCallSucceeds: bool) returns (result: ToolExecutionOutcome)
  ensures result == deps.builtinRuntimeCallResult
{
  result := deps.builtinRuntimeCallResult;
}

function ExecuteBuiltinToolSpec(deps: ToolExecutionDeps, input: BuiltinExecutionInput): ToolExecutionOutcome
{
  if input.hasArguments && !input.argumentsParseOk then
    ToolExecutionOutcome(false)
  else if input.source == SourceLobehubSkill || input.source == SourceKlavis then
    deps.builtinSpecialResult
  else if !input.hasServerRuntime || !input.hasApiMethod then
    ToolExecutionOutcome(false)
  else if input.isLocalSystem then
    ExecuteLocalSystemToolSpec(deps.localSystem, input.localSystemInput)
  else
    deps.builtinRuntimeCallResult
}

method ExecuteBuiltinTool(deps: ToolExecutionDeps, input: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome)
  ensures result == ExecuteBuiltinToolSpec(deps, input)
  ensures input.hasArguments && !input.argumentsParseOk ==> !result.success
  ensures !(input.hasArguments && !input.argumentsParseOk) &&
          (input.source == SourceLobehubSkill || input.source == SourceKlavis) ==>
          result == deps.builtinSpecialResult
  ensures !(input.hasArguments && !input.argumentsParseOk) &&
          input.source != SourceLobehubSkill &&
          input.source != SourceKlavis &&
          (!input.hasServerRuntime || !input.hasApiMethod) ==>
          !result.success
  ensures !(input.hasArguments && !input.argumentsParseOk) &&
          input.source != SourceLobehubSkill &&
          input.source != SourceKlavis &&
          input.hasServerRuntime &&
          input.hasApiMethod &&
          input.isLocalSystem &&
          input.localSystemInput.hasUserId &&
          input.localSystemInput.hasActiveDeviceId &&
          input.localSystemInput.gatewayConfigured ==>
          result.success == deps.localSystem.gatewayResult
{
  if input.hasArguments && !input.argumentsParseOk {
    result := ToolExecutionOutcome(false);
    return;
  }

  if input.source == SourceLobehubSkill || input.source == SourceKlavis {
    result := ExecuteBuiltinSpecialRoute(deps, input.source);
    return;
  }

  if !input.hasServerRuntime || !input.hasApiMethod {
    result := ToolExecutionOutcome(false);
    return;
  }

  if input.isLocalSystem {
    var localResult := ExecuteLocalSystemTool(deps.localSystem, input.localSystemInput);
    result := localResult;
    return;
  }

  result := ExecuteBuiltinRuntimeCall(deps, input.runtimeCallSucceeds);
}

// ============================================================
// L2: executeTool skeleton
// ============================================================
function ExecuteToolSpec(
  deps: ToolExecutionDeps,
  input: ToolExecutionInput,
  builtinInput: BuiltinExecutionInput
): ToolExecutionOutcome
{
  if input.kind == ToolMcp then
    match deps.mcpResult
    case Ok(outcome) => outcome
    case Err(_) => ToolExecutionOutcome(false)
  else
    ExecuteBuiltinToolSpec(deps, builtinInput)
}

method ExecuteTool(deps: ToolExecutionDeps, input: ToolExecutionInput, builtinInput: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome)
  ensures result == ExecuteToolSpec(deps, input, builtinInput)
  ensures input.kind == ToolMcp && deps.mcpResult.Err? ==> !result.success
  ensures input.kind == ToolMcp && deps.mcpResult.Ok? ==> result == deps.mcpResult.value
  ensures input.kind != ToolMcp && builtinInput.hasArguments && !builtinInput.argumentsParseOk ==> !result.success
  ensures input.kind != ToolMcp &&
          !(builtinInput.hasArguments && !builtinInput.argumentsParseOk) &&
          (builtinInput.source == SourceLobehubSkill || builtinInput.source == SourceKlavis) ==>
          result == deps.builtinSpecialResult
  ensures input.kind != ToolMcp &&
          !(builtinInput.hasArguments && !builtinInput.argumentsParseOk) &&
          builtinInput.source != SourceLobehubSkill &&
          builtinInput.source != SourceKlavis &&
          builtinInput.hasServerRuntime &&
          builtinInput.hasApiMethod &&
          builtinInput.isLocalSystem &&
          builtinInput.localSystemInput.hasUserId &&
          builtinInput.localSystemInput.hasActiveDeviceId &&
          builtinInput.localSystemInput.gatewayConfigured ==>
          result.success == deps.localSystem.gatewayResult
{
  if input.kind == ToolMcp {
    var mcpResult := ExecuteMcpTool(deps);
    match mcpResult {
      case Ok(outcome) => {
        result := outcome;
        return;
      }
      case Err(_) => {
        result := ToolExecutionOutcome(false);
        return;
      }
    }
  }

  result := ExecuteBuiltinTool(deps, builtinInput);
}

// ============================================================
// Proof direction
//
// 当前层先不写纯 lemma theorem。
// 在 Dafny 中，lemma / ghost method 不能直接调用普通 method；
// 因此这一层先以 proof method 形式承载“调用 + ensures”，
// 后续上层 proof 再直接消费这些 postcondition。
// ============================================================
method ProveExecuteBuiltinToolReturnsLocalSystemGatewayResult(
  deps: ToolExecutionDeps,
  input: BuiltinExecutionInput
) returns (result: ToolExecutionOutcome)
  requires !(input.hasArguments && !input.argumentsParseOk)
  requires input.source != SourceLobehubSkill
  requires input.source != SourceKlavis
  requires input.hasServerRuntime
  requires input.hasApiMethod
  requires input.isLocalSystem
  requires input.localSystemInput.hasUserId
  requires input.localSystemInput.hasActiveDeviceId
  requires input.localSystemInput.gatewayConfigured
  ensures result.success == deps.localSystem.gatewayResult
{
  result := ExecuteBuiltinTool(deps, input);
}

method ProveExecuteToolReturnsLocalSystemGatewayResult(
  deps: ToolExecutionDeps,
  input: BuiltinExecutionInput
) returns (result: ToolExecutionOutcome)
  requires !(input.hasArguments && !input.argumentsParseOk)
  requires input.source != SourceLobehubSkill
  requires input.source != SourceKlavis
  requires input.hasServerRuntime
  requires input.hasApiMethod
  requires input.isLocalSystem
  requires input.localSystemInput.hasUserId
  requires input.localSystemInput.hasActiveDeviceId
  requires input.localSystemInput.gatewayConfigured
  ensures result.success == deps.localSystem.gatewayResult
{
  result := ExecuteTool(deps, ToolExecutionInput(ToolBuiltin), input);
}
