-- Trigger invocation does not require callers to execute the trigger function.
-- Preserve assessment/session lineage while removing an unnecessary privilege.
revoke all on function private.demo_assessment_sync_session() from public, anon, authenticated;
