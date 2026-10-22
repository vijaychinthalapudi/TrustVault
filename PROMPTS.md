# TrustVault – AI-Generated Code Review and Security Improvements (PROMPTS.md)

This log documents the iterative prompt engineering, AI code review, vulnerability identification, and corrective engineering implemented during the development of TrustVault. Every entry links directly to verified repository commits and automated tests.

---

## Entry 1: Access Control and Administrator Permissions

- **Date:** 2026-10-19
- **Category:** Security / Authorization Policy
- **Commit Reference:** [`33bbe1f`](https://github.com/vijaychinthalapudi/TrustVault/commit/33bbe1f)
- **Verified In Code:** `server/src/security/policyEvaluator.ts` & `server/tests/security.test.ts`

**Prompt:**
> "Design an authorization policy evaluator for TrustVault in TypeScript that supports ADMIN, OWNER, and VIEWER roles and determines whether a user can download or edit a document."

**Initial AI Output:**
The AI suggested allowing administrators unrestricted access to every document by default:
```typescript
if (actor.role === 'ADMIN') {
  return {
    allowed: true,
    reason: 'Admin has full access to all documents.'
  };
}
```

**Issue Identified:**
While reviewing the generated code, I noticed that the administrator role was being treated as a superuser with access to all confidential documents. This contradicted the challenge requirements, which emphasize protecting document contents from unauthorized users, including administrators who do not have an explicit grant.

**Correction Applied:**
I updated `PolicyEvaluator.evaluateDocumentAccess` to enforce the Principle of Least Privilege:
- Administrators can view platform audit logs and system metadata needed for compliance and governance.
- Document owners can manage their own documents and grant permissions to other users.
- Viewers can access documents only when granted explicit per-document permissions.
- Administrators **cannot** download confidential file bytes by default. Any exceptional access requires an explicit per-document grant.

---

## Entry 2: Immediate Permission Revocation

- **Date:** 2026-10-19
- **Category:** Security / Access Invalidation
- **Commit Reference:** [`33bbe1f`](https://github.com/vijaychinthalapudi/TrustVault/commit/33bbe1f)
- **Verified In Code:** `server/src/routes/documentRoutes.ts` & `server/tests/revocation.test.ts`

**Prompt:**
> "How can we implement fast document downloads in Express for users who have been granted permission?"

**Initial AI Output:**
The AI recommended generating signed JWT download tokens with a 15-minute expiration so that clients could fetch bytes directly without hitting the database on each download request.

**Issue Identified:**
The approach introduced a critical security flaw: if an owner revoked someone's access, the revoked user could continue downloading the confidential file using the unexpired pre-signed URL for up to 15 minutes. This violated the core requirement that revocation must take effect immediately for future requests.

**Correction Applied:**
I rejected pre-signed download tokens and routed all file transfers through the authenticated endpoint:
`GET /api/documents/:id/download`

Before streaming any bytes, the server executes a synchronous database check in SQLite against the active grants table. Once an owner revokes access (`DELETE /api/documents/:id/permissions/:userId`), the grant record is deleted, and any subsequent download request is immediately rejected with HTTP 403 Forbidden.

---

## Entry 3: Audit Log Protection and Tamper Detection

- **Date:** 2026-10-19
- **Category:** Audit Trail / Data Integrity
- **Commit Reference:** [`33bbe1f`](https://github.com/vijaychinthalapudi/TrustVault/commit/33bbe1f)
- **Verified In Code:** `server/src/db/schema.ts`, `server/src/services/auditService.ts`, & `server/tests/security.test.ts`

**Prompt:**
> "Create an audit logging schema and service in SQLite to record user and document activities."

**Initial AI Output:**
The AI generated a standard `audit_logs` table with standard CRUD helper functions, including `updateLog()` and `deleteLog()` for administrative log pruning.

**Issue Identified:**
The generated design offered zero protection against forensic tampering. An attacker or rogue insider could modify past event records to conceal unauthorized exfiltration.

**Correction Applied:**
I implemented two distinct defense layers:
1. **Database-level immutability:** Created SQLite triggers `prevent_audit_update` and `prevent_audit_delete` that raise a SQL error if any `UPDATE` or `DELETE` statement targets `audit_logs`.
2. **Cryptographic SHA-256 Hash Chaining:** Modeled the audit log as a cryptographic ledger where each record contains `prev_hash` linking to the prior event's SHA-256 hash.
3. **Ledger Verification Endpoint:** Built `AuditService.verifyChainIntegrity` (`GET /api/audit/verify`) to detect altered, omitted, or re-ordered log blocks.

---

## Entry 4: Secure File Upload Validation

- **Date:** 2026-10-19
- **Category:** Security / Upload Protection
- **Commit Reference:** [`33bbe1f`](https://github.com/vijaychinthalapudi/TrustVault/commit/33bbe1f)
- **Verified In Code:** `server/src/services/fileValidator.ts` & `server/tests/security.test.ts`

**Prompt:**
> "Implement a Multer file upload validator that checks file extensions and MIME types."

**Initial AI Output:**
The AI validated uploads by checking the user-submitted filename extension and the browser-supplied `file.mimetype` header.

**Issue Identified:**
Both the extension and `Content-Type` header are client-controlled and easily forged. An attacker could rename a Windows executable (`malware.exe`) to `invoice.pdf` and send `Content-Type: application/pdf`, bypassing the extension check. Path traversal sequences like `../../` were also unhandled.

**Correction Applied:**
I added multi-layer server-side validation in `fileValidator.ts`:
1. **Magic Byte Signature Inspection:** Reads binary file headers (`%PDF-`, PNG, JPEG, PK zip for DOCX, null-byte checks for text).
2. **Executable Header Block:** Unconditionally rejects Windows PE (`0x4D 0x5A` / `MZ`) and Linux ELF (`0x7F 0x45 0x4C 0x46`) headers.
3. **Path Traversal Sanitization:** Validates against `..`, `/`, `\`, saving uploads under server-generated opaque UUIDv4 keys (`<uuid>.bin`) in private storage outside the web root.

---

## Entry 5: Secure Document Search and Metadata Protection

- **Date:** 2026-10-19
- **Category:** Security / Information Leakage
- **Commit Reference:** [`33bbe1f`](https://github.com/vijaychinthalapudi/TrustVault/commit/33bbe1f)
- **Verified In Code:** `server/src/services/documentService.ts` & `server/tests/search-leakage.test.ts`

**Prompt:**
> "Implement a document search endpoint in Express that allows users to search documents by title and category."

**Initial AI Output:**
The AI returned all active documents matching the search query and suggested that the frontend filter out documents the user was not permitted to open.

**Issue Identified:**
Filtering on the client exposes sensitive metadata. An unauthorized user searching keywords could infer confidential mergers, board decisions, or salary adjustments from returned document titles and metadata, even without downloading the file.

**Correction Applied:**
I embedded the authorization filter directly into the SQL query:
```sql
WHERE d.status = 'ACTIVE'
  AND (
    d.owner_id = ?
    OR d.id IN (
      SELECT document_id
      FROM document_permissions
      WHERE user_id = ?
    )
  )
  AND (
    d.display_name LIKE ?
    OR d.description LIKE ?
  )
```
Non-grantees receive zero search results and zero metadata for confidential documents they are not authorized to access.

---

## Entry 6: Evaluator Demo Switcher

- **Date:** 2026-10-19
- **Category:** User Experience / Evaluation Tooling
- **Commit Reference:** [`9ac98b6`](https://github.com/vijaychinthalapudi/TrustVault/commit/9ac98b6)
- **Verified In Code:** `client/src/pages/Login.tsx`

**Prompt:**
> "Design a login page for a document management application."

**Initial AI Output:**
A basic login form requiring manual entry of email and password credentials for each test session.

**Issue Identified:**
Testing 4 different roles (Admin, Owner, Viewer, and Unrelated) would be tedious and slow for evaluators if they had to type credentials repeatedly.

**Correction Applied:**
Added an **Evaluator Demo Switcher** above the login form in `Login.tsx` that pre-fills demo account credentials in 1 click:
- **Admin:** `admin@trustvault.local` (Compliance & audit inspection)
- **Owner (Alice):** `alice@trustvault.local` (Upload, share, revoke)
- **Viewer (Bob):** `bob@trustvault.local` (Authorized download testing)
- **Unrelated (Charlie):** `charlie@trustvault.local` (Adversarial testing & zero leakage verification)

---

## Entry 7: Default Viewer Registration & Administrator Role Management

- **Date:** 2026-10-21
- **Category:** Authentication / Role Security
- **Commit Reference:** [`81867d5`](https://github.com/vijaychinthalapudi/TrustVault/commit/81867d5)
- **Verified In Code:** `server/src/routes/authRoutes.ts`, `server/src/routes/auditRoutes.ts`, `client/src/pages/Login.tsx`, & `server/tests/role-management.test.ts`

**Prompt:**
> "Update registration to remove role selection so new users cannot self-escalate to Admin or Owner. Add a User Management section to the Admin dashboard allowing only Admins to change roles, and enforce that demoting an Owner to Viewer immediately blocks Owner actions on existing sessions."

**Initial AI Output:**
The AI proposed simply removing the `<select>` dropdown from the React frontend, while the backend still read `const role = req.body.role || 'VIEWER'`. For role enforcement, it suggested letting users re-login to obtain a new token.

**Issue Identified:**
1. A client could bypass the UI by sending `POST /api/auth/register` with `{"role": "ADMIN"}` directly to the backend.
2. Relying on re-login meant existing JWT sessions retained obsolete elevated privileges until the token expired.

**Correction Applied:**
1. **Server-Side Role Assignment:** Backend explicitly ignores client `role` parameters and unconditionally creates users with `role = 'VIEWER'`.
2. **Admin Role Management API:** Implemented `PATCH /api/admin/users/:id/role` restricted strictly to `ADMIN`, preventing self-demotion of the last active Admin, and logging an immutable `ROLE_CHANGE` event.
3. **Live Session Privilege Sync:** `auth` middleware performs real-time database role lookups on protected routes. Demoted accounts lose elevated privileges instantly without waiting for token expiry.

---

## Entry 8: Role-Revocation Bug Fix & Decoupling Ownership from Download Privileges

- **Date:** 2026-10-21
- **Category:** Authorization / Privilege Revocation / Zero-Trust Access Control
- **Commit Reference:** [`b86c762`](https://github.com/vijaychinthalapudi/TrustVault/commit/b86c762)
- **Verified In Code:** `server/src/security/policyEvaluator.ts`, `server/src/services/permissionService.ts`, & `server/tests/role-management.test.ts`

**Prompt:**
> "Fix a critical role-revocation authorization bug in TrustVault. When a user's role changes from Owner to Viewer, enforce the new role immediately on the backend, including existing sessions and direct API requests. The downgraded user must not upload, edit, delete, or manage sharing permissions for documents using previous Owner privileges. Review document ownership and download permissions separately, and enforce the intended Viewer policy consistently. Do not delete or transfer documents automatically during a role change. Add regression tests reproducing Vivienne's scenario."

**Initial AI Output:**
The AI proposed changing the `owner_id` of uploaded documents to `NULL` or transferring ownership to an admin upon role demotion so the demoted user could no longer act on them.

**Issue Identified:**
Transferring or deleting documents during a role change violates data integrity, breaks existing grants for other users, and scrambles document audit history. The root issue was that `PolicyEvaluator` assumed `document.owner_id === actor.userId` automatically conferred Owner privileges regardless of the actor's current account role.

**Correction Applied:**
1. **Decoupled Ownership from Role Authority:** Updated `PolicyEvaluator.evaluateDocumentAccess` so that Owner privileges require `document.owner_id === actor.userId` **AND** `actor.role === 'OWNER'`. A demoted user remains the recorded creator/owner in the database, but can no longer exercise Owner actions.
2. **Consistent Viewer Policy:** Demoted users must hold an explicit `READ` or `EDIT` grant to download or discover files, identical to any other Viewer.
3. **Protected Permissions & Audit Access:** Restricted `grantAccess`, `revokeAccess`, and document audit endpoints to active Owners and Administrators.
4. **Automated Regression Suite:** Added 8 regression tests covering Vivienne's full lifecycle (promote to Owner $\to$ upload $\to$ share $\to$ downgrade to Viewer $\to$ verify immediate denial of Owner actions and verified read access follows explicit grants).

---

## Entry 9: Production TypeScript Declarations & Render PaaS Deployment

- **Date:** 2026-10-21
- **Category:** Deployment / Build Configuration / Dependency Management
- **Commit Reference:** [`b2e0ea3`](https://github.com/vijaychinthalapudi/TrustVault/commit/b2e0ea3)
- **Verified In Code:** `server/package.json`, `client/package.json`, `server/tsconfig.json` & Live Render URL

**Prompt:**
> "error deploying through render what are the errors, how to rectify... error TS7016: Could not find a declaration file for module 'express'... error TS2591: Cannot find name 'path'... should i deploy it from the beginning??"

**Initial AI Output:**
Suggesting that the user wipe the service and start over, or run `npm i --save-dev @types/node` inside the cloud shell.

**Issue Identified:**
Render sets `NODE_ENV=production` by default during web service builds. In npm v7+, `NODE_ENV=production` automatically applies `--omit=dev`, skipping all packages in `devDependencies`. Because `@types/node`, `@types/express`, `@types/cors`, `typescript`, `tsx`, and `vite` were placed under `devDependencies`, `tsc` executed without any Node or library declarations, resulting in widespread compilation failures.

**Correction Applied:**
1. **Moved Build-Time Types to `dependencies`:** Moved `@types/node`, `@types/express`, `@types/cors`, `@types/better-sqlite3`, `@types/jsonwebtoken`, `@types/multer`, `@types/uuid`, `@types/bcryptjs`, `typescript`, and `tsx` into `dependencies` in `server/package.json`.
2. **Moved Client Build Tooling to `dependencies`:** Moved `vite`, `@vitejs/plugin-react`, `tailwindcss`, `postcss`, `autoprefixer`, and `@types/react` into `dependencies` in `client/package.json`.
3. **Configured Explicit Types:** Added `"types": ["node", "jest"]` to `server/tsconfig.json`.
4. **Configured Render Build Command:** Instructed the build command: `npm install --include=dev && npm run build && npm run seed`, successfully achieving a zero-error production build on Render.

---

## Entry 10: Ephemeral Hosting Data Persistence & Durable Cloud Storage Architecture

- **Date:** 2026-10-22
- **Category:** Data Persistence / Cloud Infrastructure / Zero-Loss Rehydration
- **Commit Reference:** Pending commit
- **Verified In Code:** `server/src/services/databaseSyncService.ts`, `server/src/services/storageService.ts`, `server/src/db/seed.ts`, `server/src/server.ts`, & `server/tests/persistence.test.ts`

**Prompt:**
> "Act as a senior backend engineer. Fix the data-persistence problem in my existing TrustVault project. After the deployed service restarts or is redeployed, uploaded documents disappear and only the three default documents appear again. Ensure database records persist across supported server restarts and redeployments. Ensure actual uploaded file contents also persist... Investigate a compatible managed database and durable file-storage solution with suitable free-tier options, such as Supabase."

**Initial AI Output:**
Proposing a complete rewrite from SQLite to PostgreSQL, migrating `better-sqlite3` to async `pg` and modifying all synchronous services, routes, triggers, and the 55 existing test fixtures.

**Issue Identified:**
1. **Massive Blast Radius:** Converting TrustVault's synchronous architecture (`better-sqlite3`, SQLite append-only triggers, cryptographic audit chain, and test fixtures) to async PostgreSQL would require rewriting dozens of files, introducing high risk of subtle access-control regressions, breaking existing tests, and violating the instruction not to rewrite unrelated modules.
2. **Destructive Seed Script:** In `server/src/db/seed.ts`, `seedDatabase()` executed unconditional `DELETE FROM audit_logs; DELETE FROM documents; DELETE FROM users;`. Running `npm run seed` during Render builds was actively wiping all user-created data.
3. **Ephemeral Container Storage:** Render Free tier containers do not support persistent disks; local files written to `storage/` are discarded when the container sleeps or redeploys.

**Correction Applied:**
1. **Durable Private Object Storage:** Enhanced `StorageService` to interface with Supabase Storage private buckets (`trustvault-data/documents/<key>`) while retaining local disk caching and seamless offline fallback for local development and tests.
2. **Cloud Database Rehydration Engine:** Built `DatabaseSyncService` to download the persistent `trustvault.db` snapshot from Supabase Storage on container startup before opening SQLite, and flush WAL checkpoints (`wal_checkpoint(TRUNCATE)`) to cloud storage on data mutations and graceful shutdown (`SIGTERM`).
3. **Non-Destructive Idempotent Seeding:** Refactored `seedDatabase()` to use `INSERT OR IGNORE` for default users, documents, and grants, ensuring user-created accounts and uploaded files are never deleted upon server restart.
4. **Automated Verification:** Added `tests/persistence.test.ts`, asserting that user-created documents and accounts survive simulated server restarts, bringing the passing test suite to 57 tests across 7 suites with zero regressions.

---

## Overall Summary

Throughout the development of TrustVault, AI suggestions were systematically audited against the challenge's strict security invariants. Every identified flaw—from administrative overreach to stale download tokens, metadata search leaks, disguised executable uploads, registration self-escalation, and production dependency packaging—was resolved with concrete server-side code and validated through automated adversarial tests.
