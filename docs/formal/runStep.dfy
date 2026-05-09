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
include "executeStep.dfy"

// ============================================================
// Ghost datatype: 追踪 runStep 执行停在哪一步
//
// 每个 constructor 对应 runStep.ts 中的一条 return 路径。
// ensures 将 stage 映射到正确的 HTTP status。
// ============================================================
datatype RunStepStage =
  | ParseFailed          // runStep.ts:22-23 — outer catch → 400
  | MissingOperationId   // runStep.ts:41    — handler check → 400
  | UserLookupFailed     // runStep.ts:51-52 — handler check → 401
  | StepErrored          // runStep.ts:105-117 — inner catch → 500
  | StepLocked           // runStep.ts:72-77 — handler check → 429
  | StepCompleted        // runStep.ts:104   — normal → 200

// ============================================================
// L1 Trust: JSON body 解析 (runStep.ts:20-24, outer try-catch)
//
// Trust Base: TS c.req.json() + Zod schema validation
// 假设: 合法 JSON 返回 Ok；语法错误返回 Err
// 不假设: 解析出的字段内容（operationId 是否非空由 handler 检查）
// 失败模式: JSON 语法错误 → Err → outer catch → ParseFailed → 400
// ============================================================
method ParseBody(raw: string) returns (result: FResult<RunStepRequest>)
{
  assume {:axiom} false;
}

// ============================================================
// L3 Cut Point: Redis 查询 operation metadata (runStep.ts:47-48)
//
// Trust Base: AgentRuntimeCoordinator.getOperationMetadata
// 假设: 返回原始 metadata.userId（空串表示不存在/无 userId）
// 不假设: userId 非空 —— 由 handler 自行检查 (runStep.ts:50-53)
// 失败模式: Redis / 网络异常 → Err → inner catch → StepErrored → 500
// ============================================================
method GetOperationMetadata(operationId: string) returns (result: FResult<string>)
{
  assume {:axiom} false;
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
// Dafny 对应: stub 调用返回 Err 统一映射到 StepErrored → 500，
// 对应 inner catch 的职责。
// ============================================================
method RunStep(rawBody: string) returns (body: string, status: HttpStatus, ghost stage: RunStepStage)
  ensures stage.ParseFailed?        ==> status == Status400
  ensures stage.MissingOperationId? ==> status == Status400
  ensures stage.UserLookupFailed?   ==> status == Status401
  ensures stage.StepErrored?        ==> status == Status500
  ensures stage.StepLocked?         ==> status == Status429
  ensures stage.StepCompleted?      ==> status == Status200
{
  // ===== Outer try: JSON parse (runStep.ts:20-24) → 400 =====
  var parsed := ParseBody(rawBody);
  if parsed.Err? {
    stage := ParseFailed;
    body := "{ \"error\": \"Invalid JSON body\" }";
    status := Status400;
    return;
  }
  var req := parsed.value;

  // ===== Handler check: operationId (runStep.ts:40-41) → 400 =====
  if req.operationId == "" {
    stage := MissingOperationId;
    body := "{ \"error\": \"operationId is required\" }";
    status := Status400;
    return;
  }

  // ===== Inner try (runStep.ts:28-118) =====
  // All Err from stubs below → inner catch → StepErrored → 500

  // runStep.ts:47-48 — get operation metadata
  var meta := GetOperationMetadata(req.operationId);
  if meta.Err? {
    stage := StepErrored;
    body := "{ \"error\": \"Internal server error\" }";
    status := Status500;
    return;
  }
  var userId := meta.value;

  // runStep.ts:50-53 — handler check: !metadata?.userId → 401
  if userId == "" {
    stage := UserLookupFailed;
    body := "{ \"error\": \"Invalid operation or unauthorized\" }";
    status := Status401;
    return;
  }

  // runStep.ts:58 — execute step
          var result, _ := ExecuteStep(ExecuteStepParams(req.operationId, req.stepIndex));
  if result.Err? {
    stage := StepErrored;
    body := "{ \"error\": \"Internal server error\" }";
    status := Status500;
    return;
  }
  var r := result.value;

  // runStep.ts:72-77 — locked → 429; otherwise → 200
  if r.locked {
    stage := StepLocked;
    body := "{ \"error\": \"Step locked, retry later\" }";
    status := Status429;
  } else {
    stage := StepCompleted;
    body := "{ \"ok\": true }";
    status := Status200;
  }
}
