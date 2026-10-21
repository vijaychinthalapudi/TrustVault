import React, { useState, useEffect } from 'react';
import { 
  Activity, ShieldCheck, CheckCircle2, XCircle, RefreshCw, 
  Filter, Search, Clock, Hash, Lock, Users, FileText, AlertTriangle,
  UserCheck, Shield, ChevronRight, X
} from 'lucide-react';
import { api, AuditLogItem, ChainVerification, User } from '../services/api';

export const AdminAuditPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'USERS'>('AUDIT');
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<any>(null);
  const [chainVerification, setChainVerification] = useState<ChainVerification | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // User Management state
  const [users, setUsers] = useState<User[]>([]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, 'ADMIN' | 'OWNER' | 'VIEWER'>>({});
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    user: User | null;
    newRole: 'ADMIN' | 'OWNER' | 'VIEWER';
  }>({ isOpen: false, user: null, newRole: 'VIEWER' });
  const [isSavingRole, setIsSavingRole] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Filters
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('');
  const [searchActor, setSearchActor] = useState<string>('');

  const fetchData = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const [logsRes, statsRes, verifyRes, usersRes] = await Promise.all([
        api.audit.list({
          action: selectedAction || undefined,
          outcome: selectedOutcome || undefined,
          actor_id: searchActor || undefined,
          limit: 100
        }),
        api.audit.getStats(),
        api.audit.verify(),
        api.admin.listUsers()
      ]);

      setLogs(logsRes.logs);
      setTotal(logsRes.total);
      setStats(statsRes);
      setChainVerification(verifyRes);
      setUsers(usersRes.users);

      // Prepopulate role selection dropdown map
      const initialRoles: Record<string, 'ADMIN' | 'OWNER' | 'VIEWER'> = {};
      usersRes.users.forEach(u => {
        initialRoles[u.id] = u.role;
      });
      setSelectedRoles(initialRoles);
    } catch (err: any) {
      console.error('Admin data fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedAction, selectedOutcome]);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    try {
      const res = await api.audit.verify();
      setChainVerification(res);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleRoleSelectChange = (userId: string, newRole: 'ADMIN' | 'OWNER' | 'VIEWER') => {
    setSelectedRoles(prev => ({ ...prev, [userId]: newRole }));
  };

  const openConfirmModal = (user: User) => {
    const newRole = selectedRoles[user.id] || user.role;
    if (newRole === user.role) return;
    setConfirmModal({
      isOpen: true,
      user,
      newRole
    });
  };

  const executeRoleChange = async () => {
    if (!confirmModal.user) return;
    setIsSavingRole(true);
    setFeedback(null);

    try {
      const res = await api.admin.updateUserRole(confirmModal.user.id, confirmModal.newRole);
      setFeedback({ message: res.message, type: 'success' });
      setConfirmModal({ isOpen: false, user: null, newRole: 'VIEWER' });
      await fetchData();
    } catch (err: any) {
      setFeedback({ message: err.message || 'Failed to update user role', type: 'error' });
    } finally {
      setIsSavingRole(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'DOCUMENT_UPLOAD': return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'DOCUMENT_DOWNLOAD': return 'bg-blue-950 text-blue-400 border-blue-800';
      case 'DOCUMENT_READ': return 'bg-teal-950 text-teal-400 border-teal-800';
      case 'DOCUMENT_EDIT': return 'bg-amber-950 text-amber-400 border-amber-800';
      case 'DOCUMENT_DELETE': return 'bg-rose-950 text-rose-400 border-rose-800';
      case 'PERMISSION_GRANT': return 'bg-purple-950 text-purple-400 border-purple-800';
      case 'PERMISSION_REVOKE': return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'ROLE_CHANGE': return 'bg-fuchsia-950 text-fuchsia-300 border-fuchsia-800';
      case 'ACCESS_DENIED': return 'bg-red-950 text-red-400 border-red-800';
      case 'AUTH_LOGIN': return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'AUTH_LOGIN_FAILED': return 'bg-rose-950 text-rose-400 border-rose-800';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-purple-950 text-purple-300 border-purple-800';
      case 'OWNER': return 'bg-emerald-950 text-emerald-300 border-emerald-800';
      case 'VIEWER': return 'bg-blue-950 text-blue-300 border-blue-800';
      default: return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2.5">
            <Activity className="w-6 h-6 text-purple-400" />
            <span>Administrative Governance & User Management</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Tamper-evident, cryptographic SHA-256 event chaining and centralized role management.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="p-2.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-purple-400' : ''}`} />
          </button>

          <button
            onClick={handleVerifyChain}
            disabled={isVerifying}
            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-lg shadow-purple-950/40 transition-all flex items-center space-x-2"
          >
            <ShieldCheck className={`w-4 h-4 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'Verifying Hashes...' : 'Re-verify Hash Chain'}</span>
          </button>
        </div>
      </div>

      {/* Cryptographic Chain Integrity Banner */}
      {chainVerification && (
        <div className={`p-4 rounded-2xl border mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
          chainVerification.isValid
            ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
            : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
        }`}>
          <div className="flex items-center space-x-3">
            {chainVerification.isValid ? (
              <div className="w-9 h-9 rounded-xl bg-emerald-900/60 border border-emerald-700 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-rose-900/60 border border-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
            )}
            <div>
              <div className="text-sm font-bold flex items-center space-x-2">
                <span>{chainVerification.isValid ? 'Cryptographic Chain Status: VERIFIED' : 'CRITICAL: Audit Chain Broken'}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">{chainVerification.message}</p>
            </div>
          </div>

          <div className="text-xs font-mono bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800">
            Records in Chain: <span className="font-bold text-white">{chainVerification.totalRecords}</span>
          </div>
        </div>
      )}

      {/* System Metrics Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Users className="w-4 h-4 text-purple-400" />
              <span>Platform Users</span>
            </div>
            <div className="text-2xl font-black text-white">{stats.totalUsers}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Active Documents</span>
            </div>
            <div className="text-2xl font-black text-white">{stats.activeDocuments}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>Total Audit Events</span>
            </div>
            <div className="text-2xl font-black text-white">{stats.totalAuditEvents}</div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center space-x-2 text-slate-400 text-xs mb-1">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>Denied Incidents</span>
            </div>
            <div className="text-2xl font-black text-rose-400">{stats.deniedEvents}</div>
          </div>
        </div>
      )}

      {/* Feedback Banner */}
      {feedback && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-sm ${
          feedback.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            : 'bg-rose-950/60 border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center space-x-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs underline opacity-70 hover:opacity-100">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 mb-6">
        <button
          onClick={() => setActiveTab('AUDIT')}
          className={`py-3 px-6 text-sm font-semibold flex items-center space-x-2 border-b-2 -mb-px transition-colors ${
            activeTab === 'AUDIT'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Audit Trail & Ledger ({total})</span>
        </button>
        <button
          onClick={() => setActiveTab('USERS')}
          className={`py-3 px-6 text-sm font-semibold flex items-center space-x-2 border-b-2 -mb-px transition-colors ${
            activeTab === 'USERS'
              ? 'border-purple-500 text-purple-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Role Management ({users.length})</span>
        </button>
      </div>

      {/* Tab 1: User Role Management */}
      {activeTab === 'USERS' && (
        <div className="space-y-6">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-purple-400" />
                  <span>Platform Accounts & Authorization Levels</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Only System Administrators can change user roles. Changes take effect immediately on all subsequent requests.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5">User</th>
                    <th className="px-4 py-3.5">Email</th>
                    <th className="px-4 py-3.5">Current Role</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Registered</th>
                    <th className="px-4 py-3.5">Assign Role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {users.map(u => {
                    const currentSelected = selectedRoles[u.id] || u.role;
                    const hasChanged = currentSelected !== u.role;

                    return (
                      <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3.5 font-semibold text-white whitespace-nowrap">
                          {u.name}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300 font-mono text-xs whitespace-nowrap">
                          {u.email}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${getRoleBadge(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center space-x-1 text-emerald-400 text-xs font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{u.status}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap text-xs">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <div className="flex items-center space-x-2">
                            <select
                              value={currentSelected}
                              onChange={e => handleRoleSelectChange(u.id, e.target.value as any)}
                              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-purple-500"
                            >
                              <option value="VIEWER">VIEWER</option>
                              <option value="OWNER">OWNER</option>
                              <option value="ADMIN">ADMIN</option>
                            </select>

                            {hasChanged && (
                              <button
                                onClick={() => openConfirmModal(u)}
                                className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg shadow text-xs transition-colors"
                              >
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Audit Trail */}
      {activeTab === 'AUDIT' && (
        <>
          {/* Filter Toolbar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-wrap gap-4 items-center justify-between">
            <div className="flex items-center space-x-3 flex-wrap gap-y-2">
              <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                <Filter className="w-4 h-4 text-purple-400" />
                <span>Filter By:</span>
              </div>

              <select
                value={selectedAction}
                onChange={e => setSelectedAction(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">All Security Actions</option>
                <option value="DOCUMENT_UPLOAD">DOCUMENT_UPLOAD</option>
                <option value="DOCUMENT_DOWNLOAD">DOCUMENT_DOWNLOAD</option>
                <option value="DOCUMENT_READ">DOCUMENT_READ</option>
                <option value="DOCUMENT_EDIT">DOCUMENT_EDIT</option>
                <option value="DOCUMENT_DELETE">DOCUMENT_DELETE</option>
                <option value="PERMISSION_GRANT">PERMISSION_GRANT</option>
                <option value="PERMISSION_REVOKE">PERMISSION_REVOKE</option>
                <option value="ROLE_CHANGE">ROLE_CHANGE</option>
                <option value="ACCESS_DENIED">ACCESS_DENIED</option>
                <option value="AUTH_LOGIN">AUTH_LOGIN</option>
                <option value="AUTH_LOGIN_FAILED">AUTH_LOGIN_FAILED</option>
              </select>

              <select
                value={selectedOutcome}
                onChange={e => setSelectedOutcome(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="">All Outcomes</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="DENIED">DENIED</option>
                <option value="FAILED">FAILED</option>
              </select>
            </div>

            <div className="text-xs text-slate-400 font-mono">
              Showing {logs.length} of {total} records
            </div>
          </div>

          {/* Audit Log Table */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-4 py-3.5">Time (UTC)</th>
                    <th className="px-4 py-3.5">Action</th>
                    <th className="px-4 py-3.5">Outcome</th>
                    <th className="px-4 py-3.5">Actor</th>
                    <th className="px-4 py-3.5">Target Resource</th>
                    <th className="px-4 py-3.5">Details</th>
                    <th className="px-4 py-3.5">Cryptographic Hash</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400" />
                        <span>Loading audit records...</span>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                        No matching audit logs found.
                      </td>
                    </tr>
                  ) : (
                    logs.map(log => {
                      let parsedDetails: any = {};
                      try {
                        parsedDetails = JSON.parse(log.details);
                      } catch {}

                      return (
                        <tr key={log.event_id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                            {new Date(log.occurred_at).toLocaleTimeString()} <br />
                            <span className="text-[10px] text-slate-500">{new Date(log.occurred_at).toLocaleDateString()}</span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getActionBadge(log.action)}`}>
                              {log.action}
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            {log.outcome === 'SUCCESS' ? (
                              <span className="inline-flex items-center space-x-1 text-emerald-400 text-[11px] font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>SUCCESS</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 text-rose-400 text-[11px] font-bold">
                                <XCircle className="w-3.5 h-3.5" />
                                <span>{log.outcome}</span>
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-sans font-semibold text-slate-200">{log.actor_name || 'System / Anon'}</div>
                            <div className="text-[10px] text-slate-500 truncate max-w-[120px]">{log.actor_email || log.actor_id}</div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-sans text-slate-300 truncate max-w-[150px]">
                              {log.document_name || log.document_id ? (log.document_name || log.document_id?.slice(0, 8)) : '—'}
                            </div>
                          </td>

                          <td className="px-4 py-3 max-w-xs text-slate-400 truncate text-[11px]">
                            {JSON.stringify(parsedDetails)}
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap text-[10px] text-slate-500">
                            <div className="flex items-center space-x-1 text-purple-400" title={`Current Hash: ${log.hash}\nPrevious Hash: ${log.prev_hash}`}>
                              <Hash className="w-3 h-3 text-purple-400 shrink-0" />
                              <span>{log.hash.slice(0, 10)}...</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Confirmation Modal */}
      {confirmModal.isOpen && confirmModal.user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setConfirmModal({ isOpen: false, user: null, newRole: 'VIEWER' })}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Role Modification</h3>
                <p className="text-xs text-slate-400">System Administrator Action</p>
              </div>
            </div>

            <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 text-xs text-slate-300 mb-6">
              <div className="flex justify-between">
                <span className="text-slate-400">Target User:</span>
                <span className="font-semibold text-white">{confirmModal.user.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Email:</span>
                <span className="font-mono text-slate-300">{confirmModal.user.email}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                <span className="text-slate-400">Role Transition:</span>
                <div className="flex items-center space-x-1.5 font-bold">
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${getRoleBadge(confirmModal.user.role)}`}>
                    {confirmModal.user.role}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  <span className={`px-2 py-0.5 rounded text-[10px] border ${getRoleBadge(confirmModal.newRole)}`}>
                    {confirmModal.newRole}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-6">
              This change takes effect immediately on the server. If demoted to Viewer, the user's active session will lose all Owner privileges on the very next request.
            </p>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setConfirmModal({ isOpen: false, user: null, newRole: 'VIEWER' })}
                disabled={isSavingRole}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeRoleChange}
                disabled={isSavingRole}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-md transition-all flex items-center space-x-1.5"
              >
                <span>{isSavingRole ? 'Updating...' : 'Confirm Role Change'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
