// ============================================================
// localSystemTool — formal module for local-system runtime path
//
// 对应 TS:
//   src/server/services/toolExecution/serverRuntimes/localSystem.ts
//   src/server/services/toolExecution/deviceProxy.ts
//   packages/device-gateway-client/src/http.ts
//
// 当前目标:
//   将 builtin runtime dispatch 命中 local-system 之后的链路展开为:
//   - localSystemRuntime.factory 的前置检查
//   - deviceProxy.executeToolCall
//   - GatewayHttpClient.executeToolCall
// ============================================================

include "types.dfy"
include "obs.dfy"

// Trust Base: GatewayHttpClient.executeToolCall(...)
// obs 决定黑盒结果:
//   - localSystemRuntime.factory 的前置 userId / activeDeviceId 检查不在这里处理
//   - gateway/http/client 是否配置、HTTP 是否失败、最终 success 与否，统一由 obs.gatewayResult 给出
method GatewayExecuteToolCall(obs: LocalSystemDeps, userId: string, activeDeviceId: string) returns (result: bool)
  ensures result == obs.gatewayResult
{
  result := obs.gatewayResult;
}

method ExecuteLocalSystemTool(obs: LocalSystemDeps, input: LocalSystemInput)
  returns (result: FResult<ToolExecutionOutcome>)
{
  // 对应 localSystemRuntime.factory(...) 内部的同步 throw 分支。
  if input.userId == "" {
    result := Err("userId is required for Local System device proxy execution");
    return;
  }

  if input.activeDeviceId == "" {
    result := Err("activeDeviceId is required for Local System device proxy execution");
    return;
  }

  // 只有 factory 成功后，才会进入真正的 gateway tool-call。
  var gatewaySuccess := GatewayExecuteToolCall(obs, input.userId, input.activeDeviceId);
  result := Ok(ToolExecutionOutcome(gatewaySuccess));
}
