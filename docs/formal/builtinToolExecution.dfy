// ============================================================
// builtinToolExecution — formal module for BuiltinToolsExecutor.execute(...)
//
// 对应 TS: src/server/services/toolExecution/builtin.ts:23 execute()
//
// 当前目标:
//   先建模 builtin executor 的最小控制流语义:
//   - arguments parse fail
//   - lobehubSkill / klavis special route
//   - missing server runtime / api method
//   - local-system runtime path
//   - generic server runtime call
//
// 当前已知失真（后续若要继续贴源码，需要再展开）:
//   1. 当前仍未保留完整 payload/context，仅保留 builtin 分支需要的最小投影。
//   2. `parsed || {}`、args 透传、runtime[apiName](args, context) 的参数细节仍被压缩。
//   3. 返回值仍只投影 success: bool，未保留 content/error。
//   4. ExecuteBuiltinRuntimeCall(...) 当前把多层源码逻辑压成了一个黑盒返回：
//      - getServerRuntime(identifier, context)
//      - runtime[apiName] 是否存在
//      - runtime[apiName](args, context) 的实际执行
//      - 以及 runtime path 内部的异常归一化
//      这些在源码里属于不同层级，当前 formal 尚未拆开。
//   5. `runtimeCallSucceeds: bool` 目前把多种失败来源折叠成了一个布尔，
//      因此还不能区分 runtime factory throw、apiName 缺失、以及 runtime method 自身返回失败。
// ============================================================

include "types.dfy"
include "obs.dfy"
include "localSystemTool.dfy"

// ============================================================
// L3 cut points
//
// obs 决定黑盒结果。
// ============================================================
method ExecuteBuiltinSpecialRoute(obs: BuiltinToolExecutionObs, source: BuiltinSource) returns (result: ToolExecutionOutcome)
  ensures result == obs.builtinSpecialResult
{
  result := obs.builtinSpecialResult;
}

method ExecuteBuiltinRuntimeCall(obs: BuiltinToolExecutionObs, runtimeCallSucceeds: bool) returns (result: ToolExecutionOutcome)
  ensures result == obs.builtinRuntimeCallResult
{
  result := obs.builtinRuntimeCallResult;
}

method ExecuteBuiltinTool(obs: BuiltinToolExecutionObs, context: BuiltinExecutionInput)
  returns (result: ToolExecutionOutcome)
{
  if context.hasArguments && !context.argumentsParseOk {
    result := ToolExecutionOutcome(false);
    return;
  }

  if context.source == SourceLobehubSkill || context.source == SourceKlavis {
    result := ExecuteBuiltinSpecialRoute(obs, context.source);
    return;
  }

  if !context.hasServerRuntime || !context.hasApiMethod {
    result := ToolExecutionOutcome(false);
    return;
  }

  if context.isLocalSystem {
    var localResult := ExecuteLocalSystemTool(obs.localSystem, context.localSystemInput);
    match localResult {
      case Ok(outcome) => {
        result := outcome;
        return;
      }
      case Err(_) => {
        // 对应 builtin.ts 内部 runtime path 的异常被 catch 后归一化为 success=false。
        result := ToolExecutionOutcome(false);
        return;
      }
    }
  }

  result := ExecuteBuiltinRuntimeCall(obs, context.runtimeCallSucceeds);
}
