import React, { useState, useEffect } from 'react';
import { X, UserPlus, Shield, Trash2, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { api, DocumentItem, DocumentGrant, User } from '../services/api';

interface ShareModalProps {
  document: DocumentItem;
  onClose: () => void;
  onPermissionUpdated?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ document, onClose, onPermissionUpdated }) => {
  const [grants, setGrants] = useState<DocumentGrant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedPermission, setSelectedPermission] = useState<'READ' | 'EDIT'>('READ');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [grantsRes, usersRes] = await Promise.all([
        api.permissions.list(document.id),
        api.auth.listUsers()
      ]);
      setGrants(grantsRes.grants);
      // Filter out the document owner from user picker
      setUsers(usersRes.users.filter(u => u.id !== document.owner_id));
      if (usersRes.users.length > 0) {
        const firstNonOwner = usersRes.users.find(u => u.id !== document.owner_id);
        if (firstNonOwner) setSelectedUserId(firstNonOwner.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load permissions');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [document.id]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.permissions.grant(document.id, selectedUserId, selectedPermission);
      setSuccess(res.message);
      await fetchData();
      if (onPermissionUpdated) onPermissionUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to grant permission');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevoke = async (userId: string, userName?: string) => {
    if (!confirm(`Are you sure you want to revoke access from ${userName || 'this user'}? Their access will stop immediately on their next request.`)) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await api.permissions.revoke(document.id, userId);
      setSuccess(res.message);
      await fetchData();
      if (onPermissionUpdated) onPermissionUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke permission');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-800 flex items-center justify-center text-emerald-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Manage Access & Grants</h2>
            <p className="text-xs text-slate-400 truncate max-w-md">{document.display_name}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl flex items-center space-x-2 text-rose-300 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl flex items-center space-x-2 text-emerald-300 text-sm">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Grant New Permission Form */}
        <form onSubmit={handleGrant} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 mb-6">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center space-x-1.5">
            <UserPlus className="w-4 h-4 text-emerald-400" />
            <span>Grant Named User Access</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="block text-xs text-slate-400 mb-1">Select User from Directory</label>
              <select
                value={selectedUserId}
                onChange={e => setSelectedUserId(e.target.value)}
                disabled={isSubmitting || users.length === 0}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {users.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) — [{u.role}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Permission Level</label>
              <select
                value={selectedPermission}
                onChange={e => setSelectedPermission(e.target.value as 'READ' | 'EDIT')}
                disabled={isSubmitting}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="READ">READ (Download)</option>
                <option value="EDIT">EDIT (Read + Update)</option>
              </select>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !selectedUserId}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-md transition-all flex items-center space-x-2"
            >
              <Shield className="w-4 h-4" />
              <span>{isSubmitting ? 'Granting...' : 'Grant Access'}</span>
            </button>
          </div>
        </form>

        {/* Existing Active Grants List */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Active Permissions ({grants.length})
          </h3>

          {isLoading ? (
            <div className="text-center py-6 text-sm text-slate-500">Loading current grants...</div>
          ) : grants.length === 0 ? (
            <div className="text-center py-6 bg-slate-950/40 border border-slate-800/80 rounded-xl text-sm text-slate-400">
              No individual grants active. Only the document owner ({document.owner_name}) can access this file.
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {grants.map(grant => (
                <div
                  key={grant.id}
                  className="flex items-center justify-between p-3 bg-slate-950/80 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
                >
                  <div>
                    <div className="text-sm font-medium text-white flex items-center space-x-2">
                      <span>{grant.user_name || 'Unknown User'}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        grant.permission === 'EDIT'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {grant.permission}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">{grant.user_email}</div>
                    <div className="text-[11px] text-slate-500 flex items-center space-x-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Granted {new Date(grant.granted_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRevoke(grant.user_id, grant.user_name)}
                    disabled={isSubmitting}
                    className="p-2 text-rose-400 hover:text-white hover:bg-rose-900/40 rounded-lg transition-colors border border-rose-900/40 flex items-center space-x-1.5 text-xs font-semibold"
                    title="Immediate Revocation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Revoke</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
