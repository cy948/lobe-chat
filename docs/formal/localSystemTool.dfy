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
//   - context precondition check
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
  returns (result: ToolExecutionOutcome)
{
  if input.userId == "" {
    result := ToolExecutionOutcome(false);
    return;
  }

  if input.activeDeviceId == "" {
    result := ToolExecutionOutcome(false);
    return;
  }

  var gatewaySuccess := GatewayExecuteToolCall(obs, input.userId, input.activeDeviceId);
  result := ToolExecutionOutcome(gatewaySuccess);
}
