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
//
// 当前已知失真（后续若要继续贴源码，需要再展开）:
//   1. 当前 formal 只保留了 executeTool 所需的最小 payload/context 投影，
//      尚未覆盖 ToolExecutionContext 的全部字段。
//   2. executeTool(...) 源码返回 content/error/executionTime/success，
//      当前 formal 只投影 success: bool；truncateToolResult / normalizeExecutionError / executionTime
//      相关语义目前被整体压掉。
//   3. builtin executor 的内部控制流已下沉到 builtinToolExecution.dfy；
//      当前文件只保留 executeTool(payload, context) 这一层的 type dispatch + 外层归一化。
// ============================================================

include "types.dfy"
include "obs.dfy"
include "builtinToolExecution.dfy"

// ============================================================
// L3 cut points
//
// obs 决定黑盒结果。
// ============================================================
method ExecuteMcpTool(obs: ToolExecutionDeps) returns (result: FResult<ToolExecutionOutcome>)
  ensures result == obs.mcpResult
{
  result := obs.mcpResult;
}

method ExecuteTool(obs: ToolExecutionDeps, payload: ToolExecutionPayload, context: ToolExecutionContextInput)
  returns (result: ToolExecutionOutcome)
{
  if payload.kind == ToolMcp {
    var mcpResult := ExecuteMcpTool(obs);
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

  result := ExecuteBuiltinTool(obs.builtin, payload.builtinContext);
}
