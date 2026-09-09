# Current Logic Inspection Report

## Scope

Read-only inspection of startup persistence, Cowork/Pi execution, scheduled tasks, and renderer initialization.

## Verified behavior

- Application data is stored as `userData/xiaoruan.sqlite`: `README.md:12` documents `XiaoruanAgent` and `xiaoruan.sqlite`; `src/main/appConstants.ts:6` defines the same filename, and `src/main/sqliteStore.ts:49-53` joins it with Electron `userData`.
- Startup creates the SQLite store, recovers interrupted Cowork/Activity/scheduled-task runs, initializes the canonical scheduler, and creates the main window.
- Renderer assembly loads `CoworkView` as the default feature entry and code-splits the other operational views (`src/renderer/App.tsx:70-95`); its startup effect initializes config, theme, i18n, enterprise policy, and model selection before exposing the application shell (`src/renderer/App.tsx:193-235`).
- Cowork calls pass from renderer `coworkService.startSession/continueSession` (`src/renderer/services/cowork.ts:390-445`) through preload IPC to main `CoworkSessionIpc` handlers. Main persists the user message and running state, then invokes `PiRuntimeAdapter.startSession` (`src/main/main.ts:3723-3761`) or `continueSession` (`src/main/main.ts:3801-3895`). Renderer stream listeners update Redux messages, tool activity, permission queue, completion, and errors (`src/renderer/services/cowork.ts:120-210`).
- Scheduled Task, Run, and Delivery records are SQLite-backed. The sidecar is a trigger projection only. Trigger claiming is durable and protected by a unique `(task_id, schedule_version, scheduled_at)` key.

## Findings

1. Shared main-session concurrency risk.
   `PiScheduledTaskExecutor` serializes by `task.id`, but two separate tasks can resolve to the same `sessionTarget: main` session. They can then concurrently call Pi on one session. `PiRuntimeAdapter.startSession` replaces an existing active/initializing session, so one scheduled run can interrupt another. Lock by resolved Pi session id, including foreground session coordination.

2. Legacy migration projection gap.
   Startup invokes `migrateLegacyScheduledTasksToCanonical` after sidecar startup/reconciliation. The migration imports directly into `SqliteScheduledTaskStore` and does not project the imported enabled tasks to the sidecar. On the first upgraded launch, imported tasks can wait until a sidecar reconnect or app restart before they are scheduled. Reconcile canonical jobs after migration or migrate through the canonical service.

3. Scheduled-task stop IPC is intentionally non-operative.
   The stop handler returns successful with `result: false`; claimed Pi runs must complete or time out. Retain this only if no user-facing stop command is presented, otherwise implement run/session cancellation.

## Evidence

- `README.md:12`, `src/main/appConstants.ts:6`, `src/main/sqliteStore.ts:49-53`
- `src/renderer/App.tsx:70-95`, `src/renderer/App.tsx:193-235`
- `src/renderer/services/cowork.ts:120-210`, `src/renderer/services/cowork.ts:390-445`
- `src/main/main.ts:1252-1275`, `src/main/main.ts:6512-6529`, `src/main/main.ts:6812-6825`
- `src/main/libs/agentEngine/piRuntimeAdapter.ts:651-678`
- `src/scheduledTask/piScheduledTaskExecutor.ts:21-89`
- `src/scheduledTask/canonicalScheduledTaskService.ts:20-28`, `81-89`
- `src/scheduledTask/migrate.ts:110-139`
- `src/scheduledTask/ccConnectSchedulerRuntime.ts:55-97`
- `src/main/ipcHandlers/scheduledTask/handlers.ts:178-181`

## Verification

- Passed: `./node_modules/.bin/vitest run src/scheduledTask/piScheduledTaskExecutor.test.ts --reporter=verbose` (6 tests).
- Blocked: SQLite-dependent `canonicalMigrate` and `ccConnectSchedulerRuntime` tests cannot load `better-sqlite3`. The installed native binary uses NODE_MODULE_VERSION 143; the current Node test runtime requires 137.
- Workspace was clean before adding this report; no application source was modified.
