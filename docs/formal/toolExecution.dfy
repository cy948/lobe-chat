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
include "localSystemTool.dfy"

datatype ToolKind =
  | ToolBuiltin
  | ToolMcp
  | ToolOther

datatype ToolExecutionInput = ToolExecutionInput(kind: ToolKind)

datatype ToolExecutionStage =
  | McpExecuted
  | BuiltinExecuted
  | BuiltinArgsRejected
  | BuiltinRuntimeMissing
  | ThrownNormalized

datatype BuiltinSource =
  | SourceNone
  | SourceLobehubSkill
  | SourceKlavis

datatype BuiltinExecutionInput = BuiltinExecutionInput(
  hasArguments: bool,
  argumentsParseOk: bool,
  argumentsTruncated: bool,
  source: BuiltinSource,
  hasServerRuntime: bool,
  hasApiMethod: bool,
  runtimeCallSucceeds: bool,
  isLocalSystem: bool,
  localSystemInput: LocalSystemInput
)

// Trust Base: executeMCPTool(...)
// 假设: MCP 分支要么正常返回 success 标记，要么抛出异常
method ExecuteMcpTool() returns (result: FResult<ToolExecutionOutcome>)
{
  assume {:axiom} false;
}

// Trust Base: special routes
// 假设: lobehubSkill / klavis 特殊路由要么成功，要么失败
method ExecuteBuiltinSpecialRoute(source: BuiltinSource) returns (result: ToolExecutionOutcome)
{
  assume {:axiom} false;
}

// Trust Base: runtime[apiName](args, context)
// 假设: runtime 方法调用成功返回 success=true；异常则由 builtin executor catch 成 success=false
method ExecuteBuiltinRuntimeCall(runtimeCallSucceeds: bool) returns (result: ToolExecutionOutcome)
{
  if runtimeCallSucceeds {
    result := ToolExecutionOutcome(true);
  } else {
    result := ToolExecutionOutcome(false);
  }
}

method ExecuteBuiltinTool(input: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome, ghost stage: ToolExecutionStage)
{
  if input.hasArguments && !input.argumentsParseOk {
    stage := BuiltinArgsRejected;
    result := ToolExecutionOutcome(false);
    return;
  }

  if input.source == SourceLobehubSkill || input.source == SourceKlavis {
    stage := BuiltinExecuted;
    result := ExecuteBuiltinSpecialRoute(input.source);
    return;
  }

  if !input.hasServerRuntime || !input.hasApiMethod {
    stage := BuiltinRuntimeMissing;
    result := ToolExecutionOutcome(false);
    return;
  }

  if input.isLocalSystem {
    var localResult, _ := ExecuteLocalSystemTool(input.localSystemInput);
    stage := BuiltinExecuted;
    result := localResult;
    return;
  }

  stage := BuiltinExecuted;
  result := ExecuteBuiltinRuntimeCall(input.runtimeCallSucceeds);
}

method ExecuteTool(input: ToolExecutionInput, builtinInput: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome, ghost stage: ToolExecutionStage)
{
  if input.kind == ToolMcp {
    var mcpResult := ExecuteMcpTool();
    match mcpResult {
      case Ok(outcome) => {
        stage := McpExecuted;
        result := outcome;
        return;
      }
      case Err(_) => {
        stage := ThrownNormalized;
        result := ToolExecutionOutcome(false);
        return;
      }
    }
  }

  result, stage := ExecuteBuiltinTool(builtinInput);
}
