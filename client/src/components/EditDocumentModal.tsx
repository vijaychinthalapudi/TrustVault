import React, { useState } from 'react';
import { X, Edit, UploadCloud, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, DocumentItem } from '../services/api';

interface EditDocumentModalProps {
  document: DocumentItem;
  onClose: () => void;
  onUpdated: () => void;
}

export const EditDocumentModal: React.FC<EditDocumentModalProps> = ({ document, onClose, onUpdated }) => {
  const [displayName, setDisplayName] = useState(document.display_name);
  const [category, setCategory] = useState(document.category);
  const [description, setDescription] = useState(document.description || '');
  const [replacementFile, setReplacementFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      if (displayName !== document.display_name) formData.append('display_name', displayName);
      if (category !== document.category) formData.append('category', category);
      if (description !== document.description) formData.append('description', description);
      if (replacementFile) formData.append('file', replacementFile);

      const res = await api.documents.update(document.id, formData);
      setSuccess(res.message);
      setTimeout(() => {
        onUpdated();
        onClose();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Failed to update document');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-800 flex items-center justify-center text-blue-400">
            <Edit className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Edit Document</h2>
            <p className="text-xs text-slate-400">Authorized EDIT action with tamper-evident audit logging</p>
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Category</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="Finance">Finance</option>
              <option value="Legal">Legal</option>
              <option value="Engineering">Engineering</option>
              <option value="Operations">Operations</option>
              <option value="General">General</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Replace Document File (Optional)</label>
            <div className="border border-dashed border-slate-700 rounded-lg p-3 text-center hover:border-slate-500 transition-colors">
              <input
                type="file"
                onChange={e => setReplacementFile(e.target.files ? e.target.files[0] : null)}
                className="hidden"
                id="replace-file-input"
              />
              <label htmlFor="replace-file-input" className="cursor-pointer text-xs text-slate-300 flex items-center justify-center space-x-2">
                <UploadCloud className="w-4 h-4 text-blue-400" />
                <span>{replacementFile ? replacementFile.name : 'Choose replacement file (PDF, PNG, DOCX, TXT)'}</span>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg shadow-md transition-all"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
