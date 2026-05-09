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

datatype LocalSystemInput = LocalSystemInput(
  hasUserId: bool,
  hasActiveDeviceId: bool,
  gatewayConfigured: bool,
  httpOk: bool,
  gatewaySuccess: bool
)

datatype LocalSystemStage =
  | MissingUserId
  | MissingDeviceId
  | GatewayUnavailable
  | GatewayHttpFailed
  | GatewayCallCompleted

// Trust Base: GatewayHttpClient.executeToolCall(...)
// 假设:
//   - HTTP 非 2xx 时返回 success=false
//   - HTTP 2xx 时以响应体中的 success 字段为准
method GatewayExecuteToolCall(httpOk: bool, gatewaySuccess: bool) returns (result: bool)
{
  if httpOk {
    result := gatewaySuccess;
  } else {
    result := false;
  }
}

method ExecuteLocalSystemTool(input: LocalSystemInput)
  returns (result: ToolExecutionOutcome, ghost stage: LocalSystemStage)
{
  if !input.hasUserId {
    stage := MissingUserId;
    result := ToolExecutionOutcome(false);
    return;
  }

  if !input.hasActiveDeviceId {
    stage := MissingDeviceId;
    result := ToolExecutionOutcome(false);
    return;
  }

  if !input.gatewayConfigured {
    stage := GatewayUnavailable;
    result := ToolExecutionOutcome(false);
    return;
  }

  if !input.httpOk {
    stage := GatewayHttpFailed;
    result := ToolExecutionOutcome(false);
    return;
  }

  var gatewaySuccess := GatewayExecuteToolCall(input.httpOk, input.gatewaySuccess);
  stage := GatewayCallCompleted;
  result := ToolExecutionOutcome(gatewaySuccess);
}
