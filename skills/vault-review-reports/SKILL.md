---
name: vault-review-reports
description: Triage pending backend-shape reports — `inefficiency_detected` (tune-and-stay signals like edge_fanout_high, db_bytes_high) and `infrastructure_upgrade` (migrate-tier, never auto-resolved). Verify each signal against live data, then reject by-design conditions or accept with a filed queue-item remediation; server-side hysteresis (2026-07-31) makes either resolution stick until the metric grows ~25% past the acknowledged level. Use when the user says /vault-review-reports, asks what a backend-shape signal means, or as the last stage of /vault sweep. Requires vault-storage (`:8123`).
user_invocable: true
---

# Vault — review backend-shape reports

The time-to-upgrade evaluator (`src/maintenance/find-upgrade-signals.ts` in
vault-storage) periodically checks whether the SQLite + sqlite-vec +
recursive-CTE backend is hitting an inefficiency point and files:

- **`inefficiency_detected`** — tune-and-stay signals:
  `record_count_high` (50K), `db_bytes_high` (1 GiB), `edge_fanout_high`
  (200 outbound edges on one record), `review_backlog_high` (5K pending
  suggestions).
- **`infrastructure_upgrade`** — migrate-tier: `record_count_migrate`
  (100K → Postgres + pgvector + AGE per `design/backend-comparison.md`).
  **Never auto-resolve this kind** — leave it pending and surface it; the
  migration decision is the user's, always.

Payload: `{signal, current, threshold, recommendation}` plus `top` (the
outbound-edge leaderboard) on `edge_fanout_high`; `subject_id` names the
hub record there.

**Resolution semantics (server ≥ 2026-07-31, hysteresis).** Resolving —
accept *or* reject — acknowledges the observed level: the same signal
re-files only when the metric reaches `acknowledged × 1.25`. So a
rejection of a by-design condition sticks instead of re-firing every
scan, and an acceptance stays quiet while the filed remediation is
pending. Suppressed re-trips still appear in the evaluator's
`summary.suppressed`.

## Invocation

```
/vault-review-reports                    # interactive triage
/vault-review-reports --auto             # sub-agent judgment, conservative on ambiguity
/vault-review-reports --holder=H --limit=N   # sweep dispatch (claimed batch)
```

## Workflow

Queues here are tiny (0–2 items is normal) — the raw API suffices; there
is no vault-triage.mjs harness kind for reports.

1. **Claim** (concurrent/sweep) or list (solo):

   - solo — `mcp__vault__vault_list_suggestions{kind: ["inefficiency_detected", "infrastructure_upgrade"], status: ["pending"], limit: 20}`; both kinds in one call, and `expand: "context"` inlines the record briefs.
   - sweep — `mcp__vault__vault_claim_suggestions{kind, holder, limit}`, holder from the dispatch plan.

   Fallback (pre-0.1.0 adapter):

   ```bash
   # solo
   vault-curl '/suggestions?kind=inefficiency_detected&status=pending&limit=20' -s
   vault-curl '/suggestions?kind=infrastructure_upgrade&status=pending&limit=20' -s
   # sweep: claimed batch per kind, holder from the dispatch plan
   vault-curl /suggestions/claim -X POST -H 'Content-Type: application/json' \
     --data-binary '{"kind": "inefficiency_detected", "holder": "H", "limit": 20}'
   ```

2. **Verify against live data** — the payload carries filing-time numbers;
   judge against current reality (`mcp__vault__vault_status` for record/edge
   counts, `vault_lint` for orphans, `vault_suggestions_summary` for
   the backlog, and `vault_read_file` on the hub note for `edge_fanout_high`;
   REST fallbacks are `GET /system/status`, `/system/lint`,
   `/suggestions/summary`).

3. **Disposition per item:**
   - **By-design / false positive → reject** with the reason. Typical:
     `edge_fanout_high` on a deliberate hub (an index/bundle note such as
     `topics/fleet-conventions-bundle`, a large `queue.md` running-file —
     fanout is the note's function); `review_backlog_high` from a
     transient mid-sweep spike.
   - **Real tune-and-stay condition → accept**, and in the same pass file
     a Backlog item in `projects/vault-storage/queue.md` naming the
     remediation (VACUUM, retention tuning, chunk-size tuning, a
     compaction/split target for an organically over-linked note). The
     accept note points at the queue item — acceptance without a tracked
     remediation is just a dismissed alarm.
   - **`infrastructure_upgrade` → leave pending.** Reopen if claimed;
     surface verbatim in the report.

4. **Resolve** the batch and reopen skips — `mcp__vault__vault_resolve_suggestions_batch{resolved_by, items: [{id, decision}]}`, then `vault_reopen_suggestion{id}` for claimed-but-left items. The batch call is always 200: check `failed` and the per-item `results[].error` before treating it as a clean drain.

   Fallback (pre-0.1.0 adapter):

   ```bash
   vault-curl /suggestions/resolve-batch -X POST -H 'Content-Type: application/json' \
     --data-binary '{"resolved_by": "H", "items": [{"id": "…", "decision": "reject"}]}'
   vault-curl /suggestions/<id>/reopen -X POST   # claimed-but-left items
   ```

5. **Report** one line per item: signal, current/threshold, disposition,
   reason (and the queue item path for accepts).

## Sub-agent mode (sweep dispatch)

Dispatch prompt template — fill `<holder>`/`<limit>` from the sweep plan:

> Triage vault backend-shape reports per
> `~/.claude/skills/vault-review-reports/SKILL.md`. Claim up to `<limit>`
> pending suggestions of kind `inefficiency_detected` and
> `infrastructure_upgrade` with holder `<holder>` (POST /suggestions/claim
> per kind). Verify each signal against live data, then resolve via
> POST /suggestions/resolve-batch with `resolved_by: "<holder>"`:
> reject by-design conditions with a reason; accept real conditions only
> after filing the remediation as a Backlog item in
> `projects/vault-storage/queue.md`. Never resolve
> `infrastructure_upgrade` — reopen it and list it in your report.
> Prefer the `mcp__vault__*` tools; on the `vault-curl` fallback path guard
> any `| jq` pipe with `|| true`. Return the per-item disposition lines.
