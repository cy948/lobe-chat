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
// 依赖输入决定黑盒结果:
//   - gateway/http/client 细节不在本层展开
//   - 统一由 deps.gatewayResult 给出
method GatewayExecuteToolCall(deps: LocalSystemDeps) returns (result: bool)
  ensures result == deps.gatewayResult
{
  result := deps.gatewayResult;
}

function ExecuteLocalSystemToolSpec(deps: LocalSystemDeps, input: LocalSystemInput): ToolExecutionOutcome
{
  if !input.hasUserId then
    ToolExecutionOutcome(false)
  else if !input.hasActiveDeviceId then
    ToolExecutionOutcome(false)
  else if !input.gatewayConfigured then
    ToolExecutionOutcome(false)
  else
    ToolExecutionOutcome(deps.gatewayResult)
}

method ExecuteLocalSystemTool(deps: LocalSystemDeps, input: LocalSystemInput)
  returns (result: ToolExecutionOutcome)
  ensures result == ExecuteLocalSystemToolSpec(deps, input)
  ensures !input.hasUserId ==> !result.success
  ensures input.hasUserId && !input.hasActiveDeviceId ==> !result.success
  ensures (input.hasUserId &&
          input.hasActiveDeviceId &&
          !input.gatewayConfigured) ==> !result.success
  ensures (input.hasUserId &&
          input.hasActiveDeviceId &&
          input.gatewayConfigured) ==>
          result.success == deps.gatewayResult
{
  if !input.hasUserId {
    result := ToolExecutionOutcome(false);
    return;
  }

  if !input.hasActiveDeviceId {
    result := ToolExecutionOutcome(false);
    return;
  }

  if !input.gatewayConfigured {
    result := ToolExecutionOutcome(false);
    return;
  }

  var gatewaySuccess := GatewayExecuteToolCall(deps);
  result := ToolExecutionOutcome(gatewaySuccess);
}

// ============================================================
// Proof methods
//
// 说明:
//   - 在 Dafny 中，lemma / ghost method 不能直接调用普通 method
//   - 因此这里先用普通 proof method 承载“调用 + ensures”
//   - 后续若要写纯 theorem，则应只组合这些 postcondition
// ============================================================
method ProveExecuteLocalSystemToolReturnsGatewayResult(
  deps: LocalSystemDeps,
  input: LocalSystemInput
) returns (result: ToolExecutionOutcome)
  requires input.hasUserId
  requires input.hasActiveDeviceId
  requires input.gatewayConfigured
  ensures result.success == deps.gatewayResult
{
  result := ExecuteLocalSystemTool(deps, input);
}
