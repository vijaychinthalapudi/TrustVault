import React, { useState, useEffect } from 'react';
import { 
  X, FileText, Shield, Download, Edit, Share2, 
  Trash2, Activity, Clock, Hash, Check, Copy, UserCheck
} from 'lucide-react';
import { api, DocumentItem, DocumentGrant } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface DocumentDetailsModalProps {
  document: DocumentItem;
  onClose: () => void;
  onDownload: (doc: DocumentItem) => void;
  onOpenShare: (doc: DocumentItem) => void;
  onOpenEdit: (doc: DocumentItem) => void;
  onOpenHistory: (doc: DocumentItem) => void;
  onDelete: (doc: DocumentItem) => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  document,
  onClose,
  onDownload,
  onOpenShare,
  onOpenEdit,
  onOpenHistory,
  onDelete
}) => {
  const { user } = useAuth();
  const [grants, setGrants] = useState<DocumentGrant[]>([]);
  const [isLoadingGrants, setIsLoadingGrants] = useState(false);
  const [copiedChecksum, setCopiedChecksum] = useState(false);

  const isOwner = document.owner_id === user?.id;
  const canEdit = isOwner || document.my_permission === 'EDIT';
  const canViewPermissions = isOwner || user?.role === 'ADMIN';

  useEffect(() => {
    if (canViewPermissions) {
      setIsLoadingGrants(true);
      api.permissions.list(document.id)
        .then(res => setGrants(res.grants))
        .catch(err => console.error('Failed to load grants:', err))
        .finally(() => setIsLoadingGrants(false));
    }
  }, [document.id, canViewPermissions]);

  const copyChecksum = () => {
    navigator.clipboard.writeText(document.checksum);
    setCopiedChecksum(true);
    setTimeout(() => setCopiedChecksum(false), 2000);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-950/50">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-lg font-bold text-white tracking-tight">{document.display_name}</h2>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                document.effective_role === 'OWNER'
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : document.effective_role === 'EDIT'
                  ? 'bg-blue-950 text-blue-300 border border-blue-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}>
                {document.effective_role || 'VIEWER'}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{document.category} • Confidential Vault Resource</p>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {/* Metadata Section */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5 text-xs">
            <h3 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-2 flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Document Metadata</span>
            </h3>

            <div className="grid grid-cols-2 gap-3 text-slate-400">
              <div>
                <span className="text-slate-500 block text-[10px]">Document ID:</span>
                <span className="font-mono text-slate-300 truncate block">{document.id}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Owner:</span>
                <span className="text-slate-300 font-semibold">{document.owner_name} ({document.owner_email})</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">File Size:</span>
                <span className="text-slate-300 font-mono">{formatFileSize(document.file_size)} ({document.file_size.toLocaleString()} bytes)</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Content Type:</span>
                <span className="text-slate-300 font-mono">{document.content_type}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Created Date:</span>
                <span className="text-slate-300">{new Date(document.created_at).toLocaleString()}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Last Updated:</span>
                <span className="text-slate-300">{new Date(document.updated_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-900">
              <span className="text-slate-500 block text-[10px] mb-1">SHA-256 Checksum:</span>
              <div className="flex items-center justify-between p-2 bg-slate-900 rounded-lg font-mono text-[11px] text-emerald-400">
                <span className="truncate mr-2">{document.checksum}</span>
                <button
                  onClick={copyChecksum}
                  className="p-1 text-slate-400 hover:text-white transition-colors shrink-0"
                  title="Copy checksum"
                >
                  {copiedChecksum ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {document.description && (
              <div className="pt-2 border-t border-slate-900">
                <span className="text-slate-500 block text-[10px] mb-1">Description:</span>
                <p className="text-slate-300 text-xs italic">{document.description}</p>
              </div>
            )}
          </div>

          {/* Active Grants Section (Visible to Owner / Admin) */}
          {canViewPermissions && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] flex items-center space-x-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>Current Permission Grants ({grants.length})</span>
                </h3>

                {isOwner && (
                  <button
                    onClick={() => { onClose(); onOpenShare(document); }}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold underline"
                  >
                    Manage Grants
                  </button>
                )}
              </div>

              {isLoadingGrants ? (
                <div className="text-center py-4 text-xs text-slate-500">Loading grants...</div>
              ) : grants.length === 0 ? (
                <div className="text-center py-3 text-xs text-slate-500 bg-slate-900/50 rounded-lg">
                  No individual access grants assigned. Strictly restricted to owner.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {grants.map(grant => (
                    <div
                      key={grant.id}
                      className="p-2 bg-slate-900/80 rounded-lg flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-medium text-white mr-2">{grant.user_name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{grant.user_email}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        grant.permission === 'EDIT'
                          ? 'bg-blue-950 text-blue-300 border-blue-800'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      }`}>
                        {grant.permission}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Permitted Actions Section */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
            <h3 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px] mb-3">
              Permitted Actions for Your Account
            </h3>

            <div className="flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => onDownload(document)}
                className="py-2 px-3.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-800/60 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download Document</span>
              </button>

              {isOwner && (
                <button
                  onClick={() => { onClose(); onOpenShare(document); }}
                  className="py-2 px-3.5 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-800/60 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Manage Grants</span>
                </button>
              )}

              {canEdit && (
                <button
                  onClick={() => { onClose(); onOpenEdit(document); }}
                  className="py-2 px-3.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-800/60 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Edit className="w-3.5 h-3.5" />
                  <span>Edit Metadata/File</span>
                </button>
              )}

              {(isOwner || user?.role === 'ADMIN') && (
                <button
                  onClick={() => { onClose(); onOpenHistory(document); }}
                  className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>View Audit Trail</span>
                </button>
              )}

              {isOwner && (
                <button
                  onClick={() => { onClose(); onDelete(document); }}
                  className="py-2 px-3.5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-900/40 rounded-xl font-semibold flex items-center space-x-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
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
