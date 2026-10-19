# AI Usage Log & Engineering Corrections (PROMPTS.md)

This log records real AI-assisted engineering prompts, raw proposed outputs, specific security vulnerabilities or erroneous assumptions caught during technical review, and the verified corrections committed to the repository.

---

### Entry 1: Core Policy Architecture & Administrator Role Boundary
- **Date:** 2026-10-19
- **Category:** Security / Authorization Policy
- **Prompt:**
  > "Design an authorization policy evaluator for TrustVault in TypeScript that supports ADMIN, OWNER, and VIEWER roles and decides if an actor can download or edit a document."
- **Raw AI Output:**
  ```typescript
  // Flawed AI proposal:
  if (actor.role === 'ADMIN') {
    return { allowed: true, reason: 'Admin has full access to all documents.' };
  }
  ```
- **Specific Error / Vulnerability Caught:**
  The AI defaulted to standard monolithic RBAC where `ADMIN` is treated as a superuser who can silently read and download every confidential document. This directly violated Section 4 and Section 5.1 of the challenge specification:
  > *"Important policy decision: do not silently treat administrator as 'can read every file.' The brief says the wrong person must not reach a document... A simpler design may keep administrative monitoring separate from document-content access."*
- **Correction Applied:**
  Refactored `PolicyEvaluator.evaluateDocumentAccess` to enforce strict least-privilege role separation:
  1. `ADMIN` can view platform audit logs and system metadata for governance.
  2. `ADMIN` is **strictly denied** from downloading confidential document content unless granted explicit per-document permissions or initiating a documented, auditable break-glass flow.
- **Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f) (Commit: `feat(security): implement core TrustVault security engine...`)

---

### Entry 2: Immediate Revocation Architecture & Cache Invalidation
- **Date:** 2026-10-19
- **Category:** Security / Access Invalidation
- **Prompt:**
  > "How should we implement fast document downloads in Express for granted users?"
- **Raw AI Output:**
  The AI suggested generating signed JWT download tokens with a 15-minute expiration and redirecting the client to download directly with the token to minimize database lookups.
- **Specific Error / Vulnerability Caught:**
  A 15-minute signed URL creates a critical security window: if an owner revokes a user's grant, the user can continue downloading the confidential file for up to 15 minutes using their previously issued signed URL! This violates the core challenge invariant:
  > *"Revocation: Previously granted access must stop working for subsequent requests immediately. Define 'immediate' as a request that begins after the revocation has committed must not succeed using the revoked grant."*
- **Correction Applied:**
  Eliminated pre-signed / long-lived download URLs entirely. All file downloads stream strictly through the authenticated endpoint `/api/documents/:id/download`. Every download request synchronously executes a database check against `document_permissions` in real time before returning a single byte. Revoking a permission synchronously deletes the record, rendering subsequent requests instantly rejected (HTTP 403 Forbidden).
- **Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

### Entry 3: Audit Trail Tamper Evidence & SQLite Immutability Triggers
- **Date:** 2026-10-19
- **Category:** Audit Trail / Data Integrity
- **Prompt:**
  > "Create an audit logging schema and service in SQLite for recording user and document actions."
- **Raw AI Output:**
  A standard SQLite `audit_logs` table with an `id`, `timestamp`, `action`, `user_id`, and standard CRUD queries including an `updateAuditLog` function.
- **Specific Error / Vulnerability Caught:**
  1. The AI provided an `UPDATE` path for audit logs, violating the append-only audit principle.
  2. Ordinary application queries or potential SQL injection could quietly tamper with or delete audit logs after an unauthorized access attempt.
  3. There was no mathematical or cryptographic way to detect if a database row had been altered on disk.
- **Correction Applied:**
  1. Created SQLite database-level triggers (`prevent_audit_update` and `prevent_audit_delete`) that invoke `SELECT RAISE(ABORT, 'SECURITY_VIOLATION...')` to physically block updates and deletes at the database engine level.
  2. Implemented a SHA-256 cryptographic hash chain linking each block to `prev_hash` ($Block_i = \text{SHA-256}(EventData_i \parallel Hash_{i-1})$).
  3. Implemented `AuditService.verifyChainIntegrity` to cryptographically detect any altered records, deletions, or injected entries.
- **Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

### Entry 4: File Upload Validation & Disguised Binary Detection
- **Date:** 2026-10-19
- **Category:** Security / Upload Protection
- **Prompt:**
  > "Write a multer upload validator that checks file extensions and MIME types."
- **Raw AI Output:**
  ```typescript
  // Flawed AI proposal:
  const allowed = ['.pdf', '.png', '.jpg'];
  if (!allowed.includes(path.extname(file.originalname).toLowerCase())) {
    return res.status(400).json({ error: 'Invalid extension' });
  }
  if (!file.mimetype.startsWith('application/pdf')) {
    return res.status(400).json({ error: 'Invalid MIME type' });
  }
  ```
- **Specific Error / Vulnerability Caught:**
  The AI relied on `file.originalname` and `file.mimetype`. Both are client-controlled parameters that can be spoofed in 5 seconds (e.g. an attacker renaming an executable `trojan.exe` to `invoice.pdf` and setting the `Content-Type: application/pdf` header). Furthermore, the AI did not check for path traversal sequences (`../../`) or executable binary headers.
- **Correction Applied:**
  Implemented comprehensive binary magic byte inspection in `fileValidator.ts`:
  1. Inspects raw buffer headers for magic signatures (`%PDF-`, PNG, JPEG, DOCX zip packages).
  2. Scans for executable binary headers (Windows DOS PE `0x4D 0x5A` and Linux ELF `0x7F 0x45 0x4C 0x46`) and unconditionally rejects them regardless of claimed file extension.
  3. Enforces path traversal detection on filenames.
  4. Stores files under server-generated opaque UUIDv4 storage keys outside the public web root.
- **Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

### Entry 5: Search & Discovery Boundary (Zero Information Leakage)
- **Date:** 2026-10-19
- **Category:** Security / Information Leakage
- **Prompt:**
  > "Implement the document search endpoint in Express to allow searching documents by title and category."
- **Raw AI Output:**
  The AI generated a query that returned all active documents matching the search string, suggesting that the frontend can check `doc.owner_id === user.id` and display a lock icon for documents the user does not own.
- **Specific Error / Vulnerability Caught:**
  Massive metadata leakage! An unauthorized user could search for sensitive keywords like *"Strategic Acquisition"*, *"Bankruptcy"*, or *"CEO Termination"* and discover that these confidential files exist, who owns them, and when they were uploaded, even if they couldn't download the file.
- **Correction Applied:**
  Pushed authorization filtering directly into the SQL query:
  ```sql
  WHERE d.status = 'ACTIVE' AND (
    d.owner_id = ? OR d.id IN (SELECT document_id FROM document_permissions WHERE user_id = ?)
  ) AND (d.display_name LIKE ? OR d.description LIKE ?)
  ```
  Unrelated users receive strictly zero search results for documents they have not been granted access to.
- **Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

### Entry 6: Evaluator Demo Role Switcher in UI
- **Date:** 2026-10-19
- **Category:** User Experience / Evaluation Tooling
- **Prompt:**
  > "Design a login page for the document management application."
- **Raw AI Output:**
  A generic email/password login form requiring manual input.
- **Specific Error / Opportunity Identified:**
  Hackathon evaluators reviewing dozens of projects have limited time. Requiring judges to copy-paste passwords between 4 different test roles (Admin, Owner Alice, Viewer Bob, Unrelated Charlie) slows down review and increases testing friction.
- **Correction Applied:**
  Built a dedicated **Evaluator Demo Switcher** directly above the login form in `Login.tsx`. With a single click, judges can log in as:
  - 🛡️ **Administrator:** Verify platform governance and tamper-evident audit logs.
  - 👑 **Alice (Owner):** Upload confidential files, grant permissions, and instantly revoke them.
  - 👁️ **Bob (Viewer):** Verify permitted downloads and lack of edit rights.
  - 🚫 **Charlie (Unrelated):** Verify that unauthorized documents and search results are completely inaccessible.
- **Commit Reference:** [`9ac98b6`](https://github.com/trustvault/trustvault/commit/9ac98b6)
