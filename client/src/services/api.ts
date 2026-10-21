const BASE_URL = '/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'OWNER' | 'VIEWER';
  status: string;
  created_at: string;
}

export interface DocumentItem {
  id: string;
  owner_id: string;
  display_name: string;
  category: string;
  content_type: string;
  file_size: number;
  checksum: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  owner_name?: string;
  owner_email?: string;
  my_permission?: 'READ' | 'EDIT';
  effective_role?: 'OWNER' | 'EDIT' | 'READ';
}

export interface DocumentGrant {
  id: string;
  document_id: string;
  user_id: string;
  permission: 'READ' | 'EDIT';
  granted_by: string;
  granted_at: string;
  user_name?: string;
  user_email?: string;
}

export interface AuditLogItem {
  event_id: string;
  occurred_at: string;
  actor_id: string;
  action: string;
  document_id: string | null;
  outcome: 'SUCCESS' | 'DENIED' | 'FAILED';
  request_id: string;
  ip_address: string;
  details: string;
  prev_hash: string;
  hash: string;
  actor_name?: string;
  actor_email?: string;
  document_name?: string;
}

export interface ChainVerification {
  isValid: boolean;
  totalRecords: number;
  brokenAtEventId?: string;
  message: string;
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('trustvault_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorMessage = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      errorMessage = data.error || errorMessage;
    } catch {
      // Fallback
    }
    throw new Error(errorMessage);
  }
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    async login(email: string, password: string): Promise<{ user: User; token: string }> {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await handleResponse<{ user: User; token: string }>(res);
      localStorage.setItem('trustvault_token', data.token);
      localStorage.setItem('trustvault_user', JSON.stringify(data.user));
      return data;
    },

    async register(name: string, email: string, password: string): Promise<{ user: User; token: string }> {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await handleResponse<{ user: User; token: string }>(res);
      localStorage.setItem('trustvault_token', data.token);
      localStorage.setItem('trustvault_user', JSON.stringify(data.user));
      return data;
    },

    async getMe(): Promise<{ user: User }> {
      const res = await fetch(`${BASE_URL}/auth/me`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ user: User }>(res);
    },

    async listUsers(): Promise<{ users: User[] }> {
      const res = await fetch(`${BASE_URL}/auth/users`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ users: User[] }>(res);
    },

    logout() {
      localStorage.removeItem('trustvault_token');
      localStorage.removeItem('trustvault_user');
    }
  },

  documents: {
    async list(filters?: { search?: string; category?: string; ownerId?: string; dateFrom?: string; dateTo?: string }): Promise<{ documents: DocumentItem[] }> {
      const params = new URLSearchParams();
      if (filters?.search) params.append('search', filters.search);
      if (filters?.category) params.append('category', filters.category);
      if (filters?.ownerId) params.append('ownerId', filters.ownerId);
      if (filters?.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters?.dateTo) params.append('dateTo', filters.dateTo);

      const res = await fetch(`${BASE_URL}/documents?${params.toString()}`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ documents: DocumentItem[] }>(res);
    },

    async get(id: string): Promise<{ document: DocumentItem; effectivePermission: string }> {
      const res = await fetch(`${BASE_URL}/documents/${id}`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ document: DocumentItem; effectivePermission: string }>(res);
    },

    async download(id: string, fileName: string): Promise<void> {
      const res = await fetch(`${BASE_URL}/documents/${id}/download`, {
        headers: { ...getAuthHeader() }
      });

      if (!res.ok) {
        let err = `Download failed (${res.status})`;
        try {
          const json = await res.json();
          err = json.error || err;
        } catch {}
        throw new Error(err);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },

    async upload(formData: FormData): Promise<{ message: string; document: DocumentItem }> {
      const res = await fetch(`${BASE_URL}/documents`, {
        method: 'POST',
        headers: { ...getAuthHeader() },
        body: formData
      });
      return handleResponse<{ message: string; document: DocumentItem }>(res);
    },

    async update(id: string, formData: FormData): Promise<{ message: string; document: DocumentItem }> {
      const res = await fetch(`${BASE_URL}/documents/${id}`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
        body: formData
      });
      return handleResponse<{ message: string; document: DocumentItem }>(res);
    },

    async delete(id: string): Promise<{ message: string }> {
      const res = await fetch(`${BASE_URL}/documents/${id}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ message: string }>(res);
    },

    async getAudit(id: string): Promise<{ auditTrail: AuditLogItem[] }> {
      const res = await fetch(`${BASE_URL}/documents/${id}/audit`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ auditTrail: AuditLogItem[] }>(res);
    }
  },

  permissions: {
    async list(documentId: string): Promise<{ grants: DocumentGrant[] }> {
      const res = await fetch(`${BASE_URL}/documents/${documentId}/permissions`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ grants: DocumentGrant[] }>(res);
    },

    async grant(documentId: string, userId: string, permission: 'READ' | 'EDIT'): Promise<{ message: string; grant: DocumentGrant }> {
      const res = await fetch(`${BASE_URL}/documents/${documentId}/permissions/${userId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ permission })
      });
      return handleResponse<{ message: string; grant: DocumentGrant }>(res);
    },

    async revoke(documentId: string, userId: string): Promise<{ message: string }> {
      const res = await fetch(`${BASE_URL}/documents/${documentId}/permissions/${userId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ message: string }>(res);
    }
  },

  audit: {
    async list(filters?: { actor_id?: string; action?: string; outcome?: string; limit?: number; offset?: number }): Promise<{ logs: AuditLogItem[]; total: number }> {
      const params = new URLSearchParams();
      if (filters?.actor_id) params.append('actor_id', filters.actor_id);
      if (filters?.action) params.append('action', filters.action);
      if (filters?.outcome) params.append('outcome', filters.outcome);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const res = await fetch(`${BASE_URL}/audit?${params.toString()}`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ logs: AuditLogItem[]; total: number }>(res);
    },

    async verify(): Promise<ChainVerification> {
      const res = await fetch(`${BASE_URL}/audit/verify`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<ChainVerification>(res);
    },

    async getStats(): Promise<any> {
      const res = await fetch(`${BASE_URL}/admin/stats`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<any>(res);
    }
  },

  admin: {
    async listUsers(): Promise<{ users: User[] }> {
      const res = await fetch(`${BASE_URL}/admin/users`, {
        headers: { ...getAuthHeader() }
      });
      return handleResponse<{ users: User[] }>(res);
    },

    async updateUserRole(userId: string, role: 'ADMIN' | 'OWNER' | 'VIEWER'): Promise<{ message: string; user: User }> {
      const res = await fetch(`${BASE_URL}/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader()
        },
        body: JSON.stringify({ role })
      });
      return handleResponse<{ message: string; user: User }>(res);
    }
  }
};
