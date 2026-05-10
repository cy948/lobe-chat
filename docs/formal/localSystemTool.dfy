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
//
// 当前已知失真（后续若要继续贴源码，需要再展开）:
//   1. localSystemRuntime.factory(...) 里按 apiName 生成 proxy method 的过程目前被整体压掉；
//      当前 formal 直接把“已选定某个 local-system api 并准备执行”视为既成事实。
//   2. deviceProxy / GatewayHttpClient 的返回值在源码里包含 content/error/success，
//      当前 formal 只投影 success/executionTime；因此这一层暂时不能区分错误内容和成功内容。
//   3. 对应源码语义，factory 前置检查失败是同步 throw，因此这里返回 Err(...)，
//      而不是 Ok(ToolExecutionOutcome(false, ...))。
// ============================================================

include "types.dfy"
include "obs.dfy"

// Trust Base: GatewayHttpClient.executeToolCall(...)
// obs 只决定这个黑盒调用一旦发生，返回什么结果。
// 是否真的走到这个调用点，不由 obs 决定，而由当前层源码分支决定。
method GatewayExecuteToolCall(obs: LocalSystemObs, userId: string, activeDeviceId: string) returns (result: bool)
  ensures result == obs.gatewayResult
{
  result := obs.gatewayResult;
}

method ExecuteLocalSystemTool(obs: LocalSystemObs, input: LocalSystemInput)
  returns (result: FResult<ToolExecutionOutcome>)
  ensures input.userId != "" && input.activeDeviceId != "" && obs.gatewayResult ==>
    result.Ok? && result.value.success
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
  if input.userId != "" && input.activeDeviceId != "" && obs.gatewayResult {
    assert obs.gatewayResult;
  }
  var gatewaySuccess := GatewayExecuteToolCall(obs, input.userId, input.activeDeviceId);
  result := Ok(ToolExecutionOutcome(gatewaySuccess, 0));
}

method ExecuteLocalSystemToolUnderWitness(
  obs: LocalSystemObs,
  input: LocalSystemInput
) returns (result: FResult<ToolExecutionOutcome>)
  requires input.userId != ""
  requires input.activeDeviceId != ""
  requires obs.gatewayResult
  ensures result.Ok?
  ensures result.value.success
{
  result := ExecuteLocalSystemTool(obs, input);
}
