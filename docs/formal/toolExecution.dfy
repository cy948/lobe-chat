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

method ExecuteBuiltinTool(deps: ToolExecutionDeps, input: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome)
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
    match localResult {
      case Ok(outcome) => {
        result := outcome;
        return;
      }
      case Err(_) => {
        // 对应 ToolExecutionService.executeTool(...) 外层 try/catch:
        // builtin runtime 内部 throw，最终被归一化为 success=false。
        result := ToolExecutionOutcome(false);
        return;
      }
    }
  }

  result := ExecuteBuiltinRuntimeCall(deps, input.runtimeCallSucceeds);
}

method ExecuteTool(deps: ToolExecutionDeps, input: ToolExecutionInput, builtinInput: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome)
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
