# TrustVault API Documentation & Access Control Matrix (API.md)

All endpoints reside under the `/api` prefix. Protected routes require the `Authorization: Bearer <jwt_token>` header.

---

## 1. API Access Control Matrix

| Endpoint | Method | Anonymous | VIEWER (No Grant) | VIEWER (READ Grant) | VIEWER (EDIT Grant) | OWNER | ADMIN |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/api/auth/login` | POST | Allow | Allow | Allow | Allow | Allow | Allow |
| `/api/auth/register` | POST (Viewer default) | Allow | Allow | Allow | Allow | Allow | Allow |
| `/api/auth/init-admin` | POST (Bootstrap) | Allow* | Deny (400)* | Deny (400)* | Deny (400)* | Deny (400)* | Deny (400)* |
| `/api/auth/me` | GET | Deny (401) | Allow | Allow | Allow | Allow | Allow |
| `/api/auth/users` | GET | Deny (401) | Allow | Allow | Allow | Allow | Allow |
| `/api/documents` | GET (List/Search) | Deny (401) | Empty (Zero Leak) | Discoverable Only | Discoverable Only | Own Docs | All Docs (Gov.) |
| `/api/documents` | POST (Upload) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Allow |
| `/api/documents/:id` | GET (Metadata) | Deny (401) | Deny (403) | Allow | Allow | Allow | Allow (Gov.) |
| `/api/documents/:id/download` | GET (Download) | Deny (401) | Deny (403) | Allow | Allow | Allow | Deny (403)* |
| `/api/documents/:id` | PATCH (Edit) | Deny (401) | Deny (403) | Deny (403) | Allow | Allow | Deny (403) |
| `/api/documents/:id` | DELETE (Delete) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Deny (403) |
| `/api/documents/:id/permissions` | GET | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Allow (Gov.) |
| `/api/documents/:id/permissions/:userId` | PUT (Grant) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Deny (403) |
| `/api/documents/:id/permissions/:userId` | DELETE (Revoke) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Deny (403) |
| `/api/documents/:id/audit` | GET (Doc Trail) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Allow | Allow |
| `/api/admin/users` | GET (List Users) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Deny (403) | Allow |
| `/api/admin/users/:id/role` | PATCH (Role Change) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Deny (403) | Allow |
| `/api/audit` | GET (All Logs) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Deny (403) | Allow |
| `/api/audit/verify` | GET (Hash Chain) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Deny (403) | Allow |
| `/api/admin/stats` | GET (Metrics) | Deny (401) | Deny (403) | Deny (403) | Deny (403) | Deny (403) | Allow |

*\*Note on Admin Download Rule:* By explicit design (per challenge Section 4 & Section 5.1), `ADMIN` role is decoupled from content access to prevent silent administrative snooping. Administrators cannot download confidential documents unless granted an explicit per-document permission.

---

## 2. Authentication Endpoints

### 2.1 Sign In
- **Route:** `POST /api/auth/login`
- **Auth:** None (Rate-limited: 10 attempts/min)
- **Request Body:**
  ```json
  {
    "email": "alice@trustvault.local",
    "password": "Alice@TrustVault2026!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Login successful.",
    "user": {
      "id": "22222222-2222-4222-a222-222222222222",
      "name": "Alice Jenkins (Finance Dir)",
      "email": "alice@trustvault.local",
      "role": "OWNER",
      "status": "ACTIVE",
      "created_at": "2026-10-19T12:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
  ```
- **Failure Responses:**
  - `401 Unauthorized`: `{"error": "Invalid email or password."}`
  - `429 Too Many Requests`: `{"error": "Too many requests from this IP..."}`

---

## 3. Document Management Endpoints

### 3.1 List Discoverable Documents
- **Route:** `GET /api/documents`
- **Auth:** Bearer Token
- **Query Parameters:** `search`, `category`, `ownerId`, `dateFrom`, `dateTo`
- **Response (200 OK):**
  ```json
  {
    "documents": [
      {
        "id": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        "owner_id": "22222222-2222-4222-a222-222222222222",
        "display_name": "Q3_Financial_Audit_Report.pdf",
        "category": "Finance",
        "content_type": "application/pdf",
        "file_size": 139,
        "checksum": "7a4192b6a93554b4...",
        "description": "Confidential Q3 financial reconciliation audit report.",
        "status": "ACTIVE",
        "created_at": "2026-10-19T12:00:00.000Z",
        "updated_at": "2026-10-19T12:00:00.000Z",
        "owner_name": "Alice Jenkins (Finance Dir)",
        "owner_email": "alice@trustvault.local",
        "effective_role": "OWNER"
      }
    ]
  }
  ```

### 3.2 Upload Document
- **Route:** `POST /api/documents`
- **Auth:** Bearer Token
- **Content-Type:** `multipart/form-data`
- **Form Fields:** `file` (Binary), `category` (String), `description` (String)
- **Validation:**
  - Max Size: 15 MB
  - Magic Byte Check: PDF, PNG, JPG, DOCX, TXT, CSV, JSON
  - Path Traversal Check on filename
- **Response (201 Created):**
  ```json
  {
    "message": "Document uploaded and securely stored.",
    "document": { ... }
  }
  ```

### 3.3 Download Document
- **Route:** `GET /api/documents/:id/download`
- **Auth:** Bearer Token
- **Security Logic:** Real-time lookup of owner/grantee permissions. Streams bytes only if permitted.
- **Response (200 OK):**
  - Headers:
    - `Content-Type: application/pdf` (or corresponding MIME)
    - `Content-Disposition: attachment; filename="Q3_Financial_Audit_Report.pdf"`
    - `X-Document-Checksum: 7a4192b6a9...`
  - Body: Raw file binary stream
- **Failure Responses:**
  - `403 Forbidden`: `{"error": "Access denied: No valid ownership or active permission grant for this document."}` (Zero bytes returned)
  - `404 Not Found`: `{"error": "Document not found."}`

---

## 4. Permission & Revocation Endpoints

### 4.1 Grant or Upgrade Access
- **Route:** `PUT /api/documents/:id/permissions/:userId`
- **Auth:** Bearer Token (Must be Document Owner)
- **Request Body:**
  ```json
  {
    "permission": "READ"
  }
  ```
  *(Supported permissions: `READ`, `EDIT`)*
- **Response (200 OK):**
  ```json
  {
    "message": "Successfully granted 'READ' access.",
    "grant": {
      "id": "e81d763e-...",
      "document_id": "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      "user_id": "33333333-3333-4333-a333-333333333333",
      "permission": "READ",
      "granted_by": "22222222-2222-4222-a222-222222222222",
      "granted_at": "2026-10-19T12:00:00.000Z",
      "user_name": "Bob Miller (Auditor)",
      "user_email": "bob@trustvault.local"
    }
  }
  ```

### 4.2 Immediate Revocation
- **Route:** `DELETE /api/documents/:id/permissions/:userId`
- **Auth:** Bearer Token (Must be Document Owner)
- **Response (200 OK):**
  ```json
  {
    "message": "Access revoked successfully. Subsequent requests from this user are now denied."
  }
  ```

---

## 5. Audit & Compliance Endpoints

### 5.1 System-Wide Audit Log (Admin Only)
- **Route:** `GET /api/audit`
- **Auth:** Bearer Token (Requires `ADMIN` role)
- **Query Parameters:** `actor_id`, `document_id`, `action`, `outcome`, `limit`, `offset`
- **Response (200 OK):**
  ```json
  {
    "logs": [
      {
        "event_id": "9050d276-...",
        "occurred_at": "2026-10-19T12:00:00.000Z",
        "actor_id": "22222222-...",
        "action": "DOCUMENT_UPLOAD",
        "document_id": "aaaaaaaa-...",
        "outcome": "SUCCESS",
        "request_id": "3f4b82d1-...",
        "ip_address": "127.0.0.1",
        "details": "{\"display_name\":\"Q3_Financial_Audit_Report.pdf\"}",
        "prev_hash": "0000000000000000000000000000000000000000000000000000000000000000",
        "hash": "8f9a2e1d...",
        "actor_name": "Alice Jenkins (Finance Dir)",
        "actor_email": "alice@trustvault.local",
        "document_name": "Q3_Financial_Audit_Report.pdf"
      }
    ],
    "total": 35
  }
  ```

### 5.2 Cryptographic Hash Chain Verification
- **Route:** `GET /api/audit/verify`
- **Auth:** Bearer Token (Requires `ADMIN` role)
- **Response (200 OK):**
  ```json
  {
    "isValid": true,
    "totalRecords": 35,
    "message": "Audit chain fully verified. 35 records verified with cryptographic SHA-256 integrity."
  }
  ```

---

## 6. Administrator User & Role Management

### 6.1 List All Users (Admin Only)
- **Route:** `GET /api/admin/users`
- **Auth:** Bearer Token (Requires `ADMIN` role)
- **Response (200 OK):**
  ```json
  {
    "users": [
      {
        "id": "33333333-3333-4333-a333-333333333333",
        "name": "Bob Miller (Auditor)",
        "email": "bob@trustvault.local",
        "role": "VIEWER",
        "status": "ACTIVE",
        "created_at": "2026-10-19T12:00:00.000Z"
      }
    ]
  }
  ```

### 6.2 Update User Role (Admin Only)
- **Route:** `PATCH /api/admin/users/:userId/role`
- **Auth:** Bearer Token (Requires `ADMIN` role)
- **Request Body:**
  ```json
  {
    "role": "OWNER"
  }
  ```
- **Security & Real-Time Invariants:**
  - Enforces `ADMIN` caller. Non-administrators receive `403 Forbidden` and trigger an `ACCESS_DENIED` audit log.
  - Role modifications take effect immediately across all active sessions: authentication middleware queries live user state from the database on every request, revoking obsolete privileges from existing JWT tokens.
  - Prevents demoting the last active administrator.
  - Preserves document ownership and document records separately from account role.
  - Creates a tamper-evident, hash-chained `ROLE_CHANGE` audit log record containing actor, target, previous role, and new role.
- **Response (200 OK):**
  ```json
  {
    "message": "User role updated successfully.",
    "user": {
      "id": "33333333-3333-4333-a333-333333333333",
      "name": "Bob Miller (Auditor)",
      "email": "bob@trustvault.local",
      "role": "OWNER",
      "status": "ACTIVE"
    }
  }
  ```

### 6.3 First Admin Initialization Bootstrap
- **Route:** `POST /api/auth/init-admin`
- **Auth:** None (Permitted strictly when exactly 0 active Administrators exist)
- **Request Body:**
  ```json
  {
    "name": "Initial System Admin",
    "email": "admin@trustvault.local",
    "password": "AdminBootstrapPassword2026!"
  }
  ```
- **Security Invariant:** If any active administrator already exists in the system, returns `400 Bad Request` with `"Initial administrator setup is disabled. An administrator account already exists."`

