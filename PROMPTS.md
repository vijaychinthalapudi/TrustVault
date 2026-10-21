# TrustVault – AI-Generated Code Review and Security Improvements

## Entry 1: Access Control and Administrator Permissions

- **Date:** 2026-10-19
- **Category:** Security / Authorization Policy

**Prompt:**

"Design an authorization policy evaluator for TrustVault in TypeScript that supports ADMIN, OWNER, and VIEWER roles and determines whether a user can download or edit a document."

**Initial AI Output:**

The AI suggested allowing administrators unrestricted access to every document by default.

```typescript
if (actor.role === 'ADMIN') {
  return {
    allowed: true,
    reason: 'Admin has full access to all documents.'
  };
}
```

**Issue Identified:**

While reviewing the generated code, I noticed that the administrator role was being treated as a superuser with access to all confidential documents. This contradicted the hackathon requirements, which emphasize protecting document contents from unauthorized users, including administrators who do not have explicit access.

**Correction Applied:**

I updated `PolicyEvaluator.evaluateDocumentAccess` to separate administrative responsibilities from document access.

- Administrators can access platform audit logs and system metadata needed for governance.
- Document owners can manage their own documents and grant permissions to other users.
- Viewers can access documents only when they have the required permissions.
- Administrators cannot download confidential content by default. Any exceptional access must be explicitly authorized or handled through a documented and auditable break-glass process.

This follows the principle of least privilege, ensuring that users receive only the access they actually need.

**Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

## Entry 2: Immediate Permission Revocation

- **Date:** 2026-10-19
- **Category:** Security / Access Invalidation

**Prompt:**

"How can we implement fast document downloads in Express for users who have been granted permission?"

**Initial AI Output:**

The AI recommended generating signed JWT download tokens with a 15-minute expiration. This would allow users to download files without checking their permissions against the database on every request.

**Issue Identified:**

The approach improved download performance but introduced a security problem. If an owner revoked someone's access, that user could potentially continue downloading the document with an already-issued token until it expired.

Even a short expiration period would violate the challenge requirement that access must be revoked immediately for new requests after the revocation is committed.

**Correction Applied:**

I removed the use of pre-signed or long-lived download URLs and routed downloads through the authenticated endpoint:

`/api/documents/:id/download`

Before sending any file content, the server checks the user's current permissions against the database. When an owner revokes access, the corresponding permission record is deleted, and subsequent download requests are rejected with HTTP 403 Forbidden.

This ensures that previously granted access cannot be reused through an old download token.

**Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

## Entry 3: Audit Log Protection and Tamper Detection

- **Date:** 2026-10-19
- **Category:** Audit Trail / Data Integrity

**Prompt:**

"Create an audit logging schema and service in SQLite to record user and document activities."

**Initial AI Output:**

The AI generated a conventional `audit_logs` table containing fields such as ID, timestamp, action, and user ID. It also included functions for updating and deleting existing audit records.

**Issue Identified:**

The generated design did not adequately protect audit records against tampering. If someone modified or deleted an entry, the application had no reliable mechanism to prevent the change or detect it afterward.

This was a concern because TrustVault relies on audit logs to investigate unauthorized access and other security-related activities.

**Correction Applied:**

I strengthened the audit system in three ways:

1. **Database-level protection:** Added SQLite triggers named `prevent_audit_update` and `prevent_audit_delete` to block updates and deletions of existing audit records.
2. **Hash chaining:** Used SHA-256 to link each audit record to the previous record through a `prev_hash` field. This creates a chain in which each record's hash depends on its event data and the preceding hash.
3. **Integrity verification:** Implemented `AuditService.verifyChainIntegrity` to check the chain and identify alterations, missing records, or unexpected entries.

These changes make unauthorized modifications harder to perform and easier to detect. The hash chain provides tamper evidence, while the database triggers enforce the append-only rule through normal database operations.

**Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

## Entry 4: Secure File Upload Validation

- **Date:** 2026-10-19
- **Category:** Security / Upload Protection

**Prompt:**

"Implement a Multer file upload validator that checks file extensions and MIME types."

**Initial AI Output:**

The AI suggested validating uploaded files using their original filenames and MIME types. For example, it would allow a file if its extension was `.pdf` and its MIME type indicated a PDF document.

**Issue Identified:**

I found that these checks alone were not reliable because both the filename and MIME type can be controlled by the client. An attacker could rename an executable file to `invoice.pdf` and claim that it is a PDF.

The original implementation also lacked sufficient protection against path traversal attempts and executable file uploads.

**Correction Applied:**

I improved the upload validation logic in `fileValidator.ts` by adding several checks:

1. **File signature validation:** Inspect the actual file bytes to identify formats such as PDF, PNG, JPEG, and supported DOCX files.
2. **Executable detection:** Reject files containing recognized Windows PE (`MZ`) or Linux ELF executable signatures, regardless of their claimed extension.
3. **Filename validation:** Check for path traversal patterns and reject unsafe filenames.
4. **Secure storage:** Generate opaque UUIDv4 storage keys instead of using the original filename, and store uploaded files outside the public web root.

This makes file validation more reliable than trusting the metadata supplied by the user.

**Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

## Entry 5: Secure Document Search and Metadata Protection

- **Date:** 2026-10-19
- **Category:** Security / Information Leakage

**Prompt:**

"Implement a document search endpoint in Express that allows users to search documents by title and category."

**Initial AI Output:**

The AI suggested returning all active documents matching the search query and letting the frontend decide which documents the current user was allowed to view.

**Issue Identified:**

This approach could expose sensitive information even when the user could not open or download a document. For example, an unrelated user might discover the existence of a document with a title such as "Strategic Acquisition" or "CEO Termination" and potentially learn its ownership or upload details.

I concluded that access control needed to be enforced by the backend before search results were returned.

**Correction Applied:**

I moved the authorization checks directly into the SQL query so that only documents owned by the current user or explicitly shared with them can appear in search results.

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

The query filters documents by status, access permissions, and the search terms before returning results. As a result, unrelated users receive no search results for documents they are not authorized to access.

This approach protects document metadata as well as the document contents themselves.

**Commit Reference:** [`33bbe1f`](https://github.com/trustvault/trustvault/commit/33bbe1f)

---

## Entry 6: Evaluator-Friendly Demo Login

- **Date:** 2026-10-19
- **Category:** User Experience / Evaluation Tooling

**Prompt:**

"Design a login page for a document management application."

**Initial AI Output:**

The AI proposed a standard login form requiring users to enter their email address and password manually.

**Issue Identified:**

Although a conventional login page would work, it could make the hackathon evaluation process unnecessarily slow. Evaluators would need to enter credentials repeatedly to test the different roles and verify the application's access control behavior.

I decided to make the demonstration easier by providing a dedicated role switcher for the predefined demo accounts.

**Correction Applied:**

I added an **Evaluator Demo Switcher** to `Login.tsx`, allowing evaluators to select one of four predefined demo accounts:

- **Administrator:** Test platform governance features and review audit logs.
- **Alice (Owner):** Upload documents, grant access to other users, and revoke permissions.
- **Bob (Viewer):** Verify that permitted downloads work while editing remains restricted.
- **Charlie (Unrelated User):** Confirm that unauthorized documents and search results remain inaccessible.

This makes it easier to demonstrate the main security requirements without repeatedly entering credentials.

The demo switcher is intended for evaluation convenience; it must not replace server-side authentication or authorization. Each selected identity still needs to be authenticated by the backend, and the server must enforce the corresponding permissions independently of the frontend.

**Commit Reference:** [`9ac98b6`](https://github.com/trustvault/trustvault/commit/9ac98b6)

---

## Overall Summary

During TrustVault development, I reviewed AI-generated suggestions instead of accepting them without verification. The main improvements focused on separating administrator responsibilities from document access, enforcing immediate permission revocation, protecting audit records, validating uploaded files, preventing unauthorized document discovery, and simplifying the evaluator's testing experience.

These changes helped align the implementation with the hackathon's security requirements while keeping the application practical to demonstrate and test.