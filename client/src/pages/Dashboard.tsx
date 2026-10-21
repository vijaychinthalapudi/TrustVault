import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  FileText, Search, Download, Share2, Edit, Trash2, 
  Activity, Shield, Plus, AlertCircle, RefreshCw, Lock, CheckCircle2, ShieldCheck,
  Info, Calendar, XCircle
} from 'lucide-react';
import { api, DocumentItem } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { ShareModal } from '../components/ShareModal';
import { EditDocumentModal } from '../components/EditDocumentModal';
import { DocumentHistoryModal } from '../components/DocumentHistoryModal';
import { DocumentDetailsModal } from '../components/DocumentDetailsModal';

export const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Modals state
  const [sharingDoc, setSharingDoc] = useState<DocumentItem | null>(null);
  const [editingDoc, setEditingDoc] = useState<DocumentItem | null>(null);
  const [historyDoc, setHistoryDoc] = useState<DocumentItem | null>(null);
  const [detailsDoc, setDetailsDoc] = useState<DocumentItem | null>(null);

  const fetchDocuments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.documents.list({
        search: search || undefined,
        category: selectedCategory !== 'ALL' ? selectedCategory : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined
      });
      setDocuments(res.documents);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch documents');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      fetchDocuments();
    }, 250);
    return () => clearTimeout(delayDebounce);
  }, [search, selectedCategory, dateFrom, dateTo]);

  const handleDownload = async (doc: DocumentItem) => {
    try {
      setNotification({ message: `Authorizing and downloading ${doc.display_name}...`, type: 'success' });
      await api.documents.download(doc.id, doc.display_name);
      setNotification({ message: `Download completed: ${doc.display_name}`, type: 'success' });
    } catch (err: any) {
      setNotification({ message: err.message || 'Download denied', type: 'error' });
    }
  };

  const handleDelete = async (doc: DocumentItem) => {
    if (!confirm(`Are you sure you want to delete '${doc.display_name}'? The audit trail will be permanently preserved.`)) {
      return;
    }

    try {
      await api.documents.delete(doc.id);
      setNotification({ message: 'Document deleted successfully. Audit records retained.', type: 'success' });
      fetchDocuments();
    } catch (err: any) {
      setNotification({ message: err.message || 'Deletion failed', type: 'error' });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fadeIn">
      {/* Top Banner & Security Status */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center space-x-2">
            <span>Secure Document Dashboard</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Zero-Trust access control active. You can only discover documents explicitly authorized for your account.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchDocuments}
            disabled={isLoading}
            className="p-2.5 bg-slate-900 border border-slate-700 text-slate-300 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            title="Refresh documents list"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
            <Link
              to="/upload"
              className="inline-flex items-center space-x-2 px-4 py-2.5 rounded-xl font-semibold text-sm bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Upload Document</span>
            </Link>
          )}
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className={`mb-6 p-4 rounded-xl border flex items-center justify-between text-sm transition-all ${
          notification.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
            : 'bg-rose-950/60 border-rose-800 text-rose-300'
        }`}>
          <div className="flex items-center space-x-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-xs opacity-70 hover:opacity-100 ml-4 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Search & Category Filter Toolbar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search bar */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search authorized titles or contents..."
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>

          {/* Category Filter Pills & Advanced Filter Toggle */}
          <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
            <div className="flex items-center space-x-1.5">
              {['ALL', 'Finance', 'Legal', 'Engineering', 'Operations', 'General'].map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded-lg border text-xs font-medium flex items-center space-x-1 transition-colors ${
                showFilters || dateFrom || dateTo
                  ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
              }`}
              title="Toggle Date Range Filters"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Dates</span>
            </button>
          </div>
        </div>

        {/* Date Filters Expandable Panel */}
        {showFilters && (
          <div className="mt-4 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">From:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">To:</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs focus:outline-none focus:border-emerald-500"
              />
            </div>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center space-x-1"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Reset Dates</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Documents List / Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3 text-emerald-500" />
          <p className="text-sm">Loading discoverable documents...</p>
        </div>
      ) : error ? (
        <div className="p-6 bg-rose-950/40 border border-rose-800 rounded-2xl text-center text-rose-300">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-400" />
          <p className="font-semibold">{error}</p>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-12 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">No Authorized Documents Discovered</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
            TrustVault enforces zero-trust boundaries: documents you do not own or have not been explicitly granted access to are completely invisible.
          </p>
          {(user?.role === 'OWNER' || user?.role === 'ADMIN') && (
            <Link
              to="/upload"
              className="inline-flex items-center space-x-2 px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>Upload First Document</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {documents.map(doc => {
            const isOwner = doc.owner_id === user?.id;
            const canEdit = isOwner || doc.my_permission === 'EDIT';

            return (
              <div
                key={doc.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-5 shadow-xl transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-slate-950 text-slate-400 border border-slate-800">
                      {doc.category}
                    </span>

                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      doc.effective_role === 'OWNER'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : doc.effective_role === 'EDIT'
                        ? 'bg-blue-950 text-blue-300 border border-blue-800'
                        : 'bg-amber-950 text-amber-300 border border-amber-800'
                    }`}>
                      {doc.effective_role || 'GRANTED'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white tracking-tight line-clamp-1 mb-1 group-hover:text-emerald-400 transition-colors" title={doc.display_name}>
                    {doc.display_name}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-2 mb-4 h-8">
                    {doc.description || 'No description provided.'}
                  </p>

                  <div className="p-3 bg-slate-950/60 rounded-xl space-y-1.5 text-[11px] text-slate-400 mb-4 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Size:</span>
                      <span className="text-slate-300">{formatFileSize(doc.file_size)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Owner:</span>
                      <span className="text-slate-300 truncate max-w-[150px]">{doc.owner_name || 'Owner'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Checksum:</span>
                      <span className="text-emerald-400 truncate max-w-[120px]" title={doc.checksum}>
                        {doc.checksum.slice(0, 10)}...
                      </span>
                    </div>
                  </div>
                </div>

                {/* Document Action Buttons */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1 text-xs">
                  <button
                    onClick={() => handleDownload(doc)}
                    className="flex-1 py-2 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-800/60 rounded-xl font-semibold flex items-center justify-center space-x-1.5 transition-colors"
                    title="Real-Time Authorized Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>

                  <button
                    onClick={() => setDetailsDoc(doc)}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                    title="View Document Details & Security Metadata"
                  >
                    <Info className="w-4 h-4 text-slate-300" />
                  </button>

                  {isOwner && (
                    <button
                      onClick={() => setSharingDoc(doc)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                      title="Manage Access & Grants"
                    >
                      <Share2 className="w-4 h-4 text-purple-400" />
                    </button>
                  )}

                  {canEdit && (
                    <button
                      onClick={() => setEditingDoc(doc)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                      title="Edit Document"
                    >
                      <Edit className="w-4 h-4 text-blue-400" />
                    </button>
                  )}

                  {(isOwner || user?.role === 'ADMIN') && (
                    <button
                      onClick={() => setHistoryDoc(doc)}
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-colors"
                      title="View Audit Trail"
                    >
                      <Activity className="w-4 h-4 text-emerald-400" />
                    </button>
                  )}

                  {isOwner && (
                    <button
                      onClick={() => handleDelete(doc)}
                      className="p-2 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 rounded-xl transition-colors"
                      title="Delete Document"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sub-modals */}
      {sharingDoc && (
        <ShareModal
          document={sharingDoc}
          onClose={() => setSharingDoc(null)}
          onPermissionUpdated={fetchDocuments}
        />
      )}

      {editingDoc && (
        <EditDocumentModal
          document={editingDoc}
          onClose={() => setEditingDoc(null)}
          onUpdated={fetchDocuments}
        />
      )}

      {historyDoc && (
        <DocumentHistoryModal
          document={historyDoc}
          onClose={() => setHistoryDoc(null)}
        />
      )}

      {detailsDoc && (
        <DocumentDetailsModal
          document={detailsDoc}
          onClose={() => setDetailsDoc(null)}
          onDownload={handleDownload}
          onOpenShare={(doc) => { setDetailsDoc(null); setSharingDoc(doc); }}
          onOpenEdit={(doc) => { setDetailsDoc(null); setEditingDoc(doc); }}
          onOpenHistory={(doc) => { setDetailsDoc(null); setHistoryDoc(doc); }}
          onDelete={(doc) => { setDetailsDoc(null); handleDelete(doc); }}
        />
      )}
    </div>
  );
};
