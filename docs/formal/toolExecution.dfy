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

datatype ToolKind =
  | ToolBuiltin
  | ToolMcp
  | ToolOther

datatype ToolExecutionInput = ToolExecutionInput(kind: ToolKind)

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
    var localResult, _ := ExecuteLocalSystemTool(input.localSystemInput);
    result := localResult;
    return;
  }

  result := ExecuteBuiltinRuntimeCall(deps, input.runtimeCallSucceeds);
}

// ============================================================
// L2: executeTool skeleton
// ============================================================
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

// ============================================================
// Lemmas
//
// 原则:
//   - Modeling 定义在前
//   - Lemma 放在文件后部
//   - 先覆盖单条分支性质，再逐步扩展到更多路径
// ============================================================
// TODO: 等 localSystem / dispatch / builtin-runtime 规范进一步收紧后，
// 再补真正有业务含义的 lemma。
