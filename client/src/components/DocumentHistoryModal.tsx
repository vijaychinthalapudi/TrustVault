import React, { useState, useEffect } from 'react';
import { X, Activity, CheckCircle2, XCircle, Clock, Hash } from 'lucide-react';
import { api, DocumentItem, AuditLogItem } from '../services/api';

interface DocumentHistoryModalProps {
  document: DocumentItem;
  onClose: () => void;
}

export const DocumentHistoryModal: React.FC<DocumentHistoryModalProps> = ({ document, onClose }) => {
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAudit = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await api.documents.getAudit(document.id);
        setLogs(res.auditTrail);
      } catch (err: any) {
        setError(err.message || 'Failed to load document activity');
      } finally {
        setIsLoading(false);
      }
    };

    fetchAudit();
  }, [document.id]);

  const getActionBadgeColor = (action: string) => {
    switch (action) {
      case 'DOCUMENT_UPLOAD': return 'bg-emerald-950 text-emerald-400 border-emerald-800';
      case 'DOCUMENT_DOWNLOAD': return 'bg-blue-950 text-blue-400 border-blue-800';
      case 'DOCUMENT_READ': return 'bg-teal-950 text-teal-400 border-teal-800';
      case 'DOCUMENT_EDIT': return 'bg-amber-950 text-amber-400 border-amber-800';
      case 'DOCUMENT_DELETE': return 'bg-rose-950 text-rose-400 border-rose-800';
      case 'PERMISSION_GRANT': return 'bg-purple-950 text-purple-400 border-purple-800';
      case 'PERMISSION_REVOKE': return 'bg-rose-950 text-rose-300 border-rose-800';
      case 'ACCESS_DENIED': return 'bg-red-950 text-red-400 border-red-800';
      default: return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-950 border border-purple-800 flex items-center justify-center text-purple-400">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Document Activity Audit Trail</h2>
            <p className="text-xs text-slate-400 truncate max-w-md">{document.display_name}</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-sm">
            {error}
          </div>
        )}

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {isLoading ? (
            <div className="text-center py-10 text-slate-500 text-sm">Loading verifiable audit events...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-sm bg-slate-950/40 rounded-xl border border-slate-800">
              No audit events recorded for this document.
            </div>
          ) : (
            logs.map(log => {
              let parsedDetails: any = {};
              try {
                parsedDetails = JSON.parse(log.details);
              } catch {}

              return (
                <div
                  key={log.event_id}
                  className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                      {log.outcome === 'SUCCESS' ? (
                        <span className="flex items-center space-x-1 text-emerald-400 text-xs">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>SUCCESS</span>
                        </span>
                      ) : (
                        <span className="flex items-center space-x-1 text-rose-400 text-xs">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{log.outcome}</span>
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-slate-400 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{new Date(log.occurred_at).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-300 flex items-center space-x-2">
                    <span className="font-semibold text-slate-400">Actor:</span>
                    <span className="text-white font-medium">{log.actor_name || 'System / Anonymous'}</span>
                    {log.actor_email && <span className="text-slate-500">({log.actor_email})</span>}
                  </div>

                  {Object.keys(parsedDetails).length > 0 && (
                    <div className="p-2 bg-slate-900 rounded-lg text-[11px] font-mono text-slate-400 overflow-x-auto">
                      {JSON.stringify(parsedDetails, null, 2)}
                    </div>
                  )}

                  <div className="pt-2 border-t border-slate-900 text-[10px] font-mono text-slate-500 flex items-center justify-between">
                    <span className="flex items-center space-x-1">
                      <Hash className="w-3 h-3 text-emerald-500" />
                      <span>SHA-256 Hash: {log.hash.slice(0, 16)}...</span>
                    </span>
                    <span>Event: {log.event_id.slice(0, 8)}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
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
