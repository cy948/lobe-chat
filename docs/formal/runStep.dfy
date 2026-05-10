// ============================================================
// runStep — HTTP entry for /api/agent/run
//
// 对应 TS: src/server/agent-hono/handlers/runStep.ts:16 runStep()
//
// 遵循 formal-modeling-plan 的约定:
//   P1: 三层信任归约 (L1=TS/V8, L2=Dafny, L3=公理)
//   P2: 外部调用即 cut point
//   P3: Attribute Projection
//   P4: Pre-Condition 驱动日志埋点
// ============================================================

include "types.dfy"
include "obs.dfy"
include "executeStep.dfy"

// ============================================================
// L1 Trust: JSON body 解析 (runStep.ts:20-24, outer try-catch)
//
// Trust Base: TS c.req.json() + Zod schema validation
// 假设: 合法 JSON 返回 Ok；语法错误返回 Err
// 不假设: 解析出的字段内容（operationId 是否非空由 handler 检查）
// 失败模式: JSON 语法错误 → Err → outer catch → 400
// ============================================================
method ParseBody(obs: RunStepObs, raw: string) returns (result: FResult<RunStepRequest>)
  ensures result == obs.parsed
{
  result := obs.parsed;
}

datatype HttpResponse = HttpResponse(status: HttpStatus, body: string)

// ============================================================
// L3 Cut Point: AgentRuntimeCoordinator / metadata lookup
//
// obs 决定黑盒结果：
//   - coordinator 不可用时，统一表现为 Err
//   - coordinator 可用时，返回 obs.meta
// ============================================================
method GetOperationMetadata(obs: RunStepObs, operationId: string) returns (result: FResult<string>)
  ensures !obs.coordinatorReady ==> result.Err?
  ensures obs.coordinatorReady ==> result == obs.meta
{
  if !obs.coordinatorReady {
    result := Err("coordinator unavailable");
  } else {
    result := obs.meta;
  }
}

// ============================================================
// L2: runStep Handler (验证目标)
//
// e2e 建模: rawBody: string → (body: string, status: HttpStatus)
//
// TS 有两个 try-catch:
//   outer (runStep.ts:20-24): JSON parse          → 400
//   inner (runStep.ts:28-118): 所有 stub 异常      → 500
//   非异常的 handler check (41, 51-52, 72-77):   → 400 / 401 / 429
//
// Dafny 对应: stub 调用返回 Err 统一映射到 500，
// 对应 inner catch 的职责。
//
// 当前版本选择弱规格：
//   - method 本身只定义控制流过程
//   - 具体 response 性质留给后续 lemma 单独表达
// ============================================================
method RunStep(obs: GlobalObs, rawBody: string) returns (body: string, status: HttpStatus)
  requires obs.runStep.parsed.Err? ||
    (!obs.runStep.parsed.value.context.present || obs.runStep.parsed.value.context.phase != PhaseHumanApprovedTool)
  requires obs.executeStep.runtimeStep.initialContext.phase != PhaseHumanApprovedTool
  requires obs.executeStep.runtimeStep.runnerResult.Err? || HumanInstructionFree(obs.executeStep.runtimeStep.runnerResult.value)
{
  var response: HttpResponse;
  // ===== Outer try: JSON parse (runStep.ts:20-24) → 400 =====
  var parsed := ParseBody(obs.runStep, rawBody);
  if parsed.Err? {
    response := HttpResponse(Status400, "{ \"error\": \"Invalid JSON body\" }");
    body := response.body;
    status := response.status;
    return;
  }
  var req := parsed.value;
  if req.operationId == "" {
    response := HttpResponse(Status400, "{ \"error\": \"operationId is required\" }");
    body := response.body;
    status := response.status;
    return;
  }
  var meta := GetOperationMetadata(obs.runStep, req.operationId);
  var stepResult := ExecuteStep(obs.executeStep, ExecuteStepInput(
    req.operationId,
    req.stepIndex,
    req.context,
    req.hasHumanInput,
    req.hasApprovedToolCall,
    req.hasRejectionReason,
    req.rejectAndContinue,
    req.hasToolMessageId,
    req.externalRetryCount
  ));
  if meta.Err? {
    response := HttpResponse(Status500, "{ \"error\": \"Internal server error\" }");
  } else if meta.value == "" {
    response := HttpResponse(Status401, "{ \"error\": \"Invalid operation or unauthorized\" }");
  } else if stepResult.Err? {
    response := HttpResponse(Status500, "{ \"error\": \"Internal server error\" }");
  } else if stepResult.value.locked {
    response := HttpResponse(Status429, "{ \"error\": \"Step locked, retry later\" }");
  } else {
    response := HttpResponse(Status200, "{ \"ok\": true }");
  }
  body := response.body;
  status := response.status;
}

predicate PRunStepCanReachExecuteCallTool(obs: GlobalObs)
{
  obs.runStep.parsed.Ok? &&
  obs.runStep.parsed.value.operationId != "" &&
  obs.runStep.coordinatorReady &&
  obs.runStep.meta == Ok("ok") &&
  !obs.runStep.parsed.value.hasHumanInput &&
  !obs.runStep.parsed.value.hasApprovedToolCall &&
  !obs.runStep.parsed.value.hasRejectionReason &&
  obs.executeStep.claimed == Ok(true) &&
  obs.executeStep.stateResult.Ok? &&
  obs.executeStep.stateResult.value.stepCount <= obs.runStep.parsed.value.stepIndex &&
  obs.executeStep.stateResult.value.status != StatusInterrupted &&
  obs.executeStep.stateResult.value.status != StatusDone &&
  obs.executeStep.stateResult.value.status != StatusError &&
  (!obs.runStep.parsed.value.context.present ||
    obs.runStep.parsed.value.context.phase != PhaseHumanApprovedTool) &&
  obs.executeStep.runtimeStep.initialContext.phase != PhaseHumanApprovedTool &&
  obs.executeStep.runtimeStep.runnerResult.Ok? &&
  HumanInstructionFree(obs.executeStep.runtimeStep.runnerResult.value) &&
  !obs.executeStep.runtimeStep.runnerResult.value.isArray &&
  obs.executeStep.runtimeStep.runnerResult.value.single.kind == InstrCallTool &&
  obs.executeStep.runtimeStep.callToolInstruction.toolCalling.executor == "client" &&
  obs.executeStep.runtimeStep.callToolCtx.streamManagerCanSendToolExecute &&
  obs.executeStep.runtimeStep.callTool.dispatched.Ok? &&
  obs.executeStep.runtimeStep.callTool.persisted.Ok? &&
  (if obs.executeStep.stateResult.value.operationToolSource != "" then
    obs.executeStep.stateResult.value.operationToolSource
   else
    obs.executeStep.stateResult.value.fallbackToolSource) != "client"
}

method RunStepPImpliesQ(obs: GlobalObs)
  returns (callToolResult: FResult<RuntimeStepResult>)
  requires PRunStepCanReachExecuteCallTool(obs)
  ensures callToolResult.Ok?
{
  callToolResult := ExecuteCallTool(
    obs.executeStep.runtimeStep.callTool,
    obs.executeStep.runtimeStep.callToolCtx,
    obs.executeStep.runtimeStep.callToolInstruction,
    AgentState(
      obs.executeStep.stateResult.value.status,
      obs.executeStep.stateResult.value.stepCount + 1,
      obs.executeStep.stateResult.value.hasCostLimit,
      obs.executeStep.stateResult.value.totalCostExceeded,
      obs.executeStep.stateResult.value.costLimitPolicy,
      obs.executeStep.stateResult.value.operationToolSource,
      obs.executeStep.stateResult.value.fallbackToolSource
    )
  );
  var body, status := RunStep(obs, "raw");
}
