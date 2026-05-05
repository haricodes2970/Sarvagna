import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Globe, Link as LinkIcon, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useUserStore } from '../store/userStore';

interface UploadedFileRecord {
  id: number;
  filename: string;
  file_type: string;
  chunk_count: number;
  subject_id: number | null;
  storage_url: string | null;
  created_at: string;
}

interface ScrapedLink {
  title: string;
  url: string;
  link_type?: 'pdf' | 'download' | 'page';
}

interface ToastState {
  message: string;
  type: 'error' | 'success';
}

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { subjects } = useUserStore();

  const [files, setFiles] = useState<UploadedFileRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Scrape-links state
  const [scrapedLinks, setScrapedLinks] = useState<ScrapedLink[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [fetchingLinks, setFetchingLinks] = useState(false);
  const [ingesting, setIngesting] = useState<Record<string, 'pending' | 'done' | 'error'>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'error' | 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadFiles = useCallback(async () => {
    try {
      const data = await api.getUploadedFiles();
      setFiles(data as UploadedFileRecord[]);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }, []);

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      const res = await api.uploadFile(selectedFile, subjectId ? parseInt(subjectId) : undefined);
      showToast(`Indexed ${res.chunk_count} chunks from ${res.filename}`, 'success');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadFiles();
    } catch {
      showToast('Upload failed. Check file type and try again.', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleFetchLinks = async () => {
    if (!url.trim()) return;
    setFetchingLinks(true);
    setScrapedLinks([]);
    setSelectedUrls(new Set());
    setIngesting({});
    try {
      const links = await api.scrapeLinks(url.trim());
      if (links.length === 0) {
        showToast('No academic PDFs found on that page.', 'error');
      }
      setScrapedLinks(links);
    } catch {
      showToast('Failed to fetch page.', 'error');
    } finally {
      setFetchingLinks(false);
    }
  };

  const toggleUrl = (linkUrl: string) => {
    setSelectedUrls(prev => {
      const next = new Set(prev);
      if (next.has(linkUrl)) next.delete(linkUrl);
      else next.add(linkUrl);
      return next;
    });
  };

  const handleConfirmSelection = async () => {
    if (selectedUrls.size === 0) return;
    const sid = subjectId ? parseInt(subjectId) : undefined;
    for (const linkUrl of selectedUrls) {
      setIngesting(prev => ({ ...prev, [linkUrl]: 'pending' }));
      try {
        await api.confirmSelection(linkUrl, sid);
        setIngesting(prev => ({ ...prev, [linkUrl]: 'done' }));
      } catch {
        setIngesting(prev => ({ ...prev, [linkUrl]: 'error' }));
      }
    }
    showToast(`Ingested ${selectedUrls.size} PDF(s) into Knowledge Base`, 'success');
    await loadFiles();
    setScrapedLinks([]);
    setSelectedUrls(new Set());
    setIngesting({});
  };

  const handleDelete = async (fileId: number) => {
    try {
      await api.deleteUploadedFile(fileId);
      setFiles(prev => prev.filter(f => f.id !== fileId));
      showToast('Deleted.', 'success');
    } catch {
      showToast('Delete failed.', 'error');
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const typeIcon: Record<string, { bg: string; text: string; label: string }> = {
    pdf:  { bg: 'bg-rose-500',    text: 'text-white', label: 'PDF' },
    docx: { bg: 'bg-indigo-500',  text: 'text-white', label: 'DOC' },
    txt:  { bg: 'bg-slate-600',   text: 'text-white', label: 'TXT' },
    md:   { bg: 'bg-emerald-600', text: 'text-white', label: 'MD'  },
    url:  { bg: 'bg-sky-600',     text: 'text-white', label: 'URL' },
  };

  const badgeColor: Record<string, string> = {
    pdf:  'bg-rose-500/10 text-rose-400 border-rose-500/20',
    docx: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    txt:  'bg-slate-500/10 text-slate-400 border-slate-500/20',
    md:   'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    url:  'bg-sky-500/10 text-sky-400 border-sky-500/20',
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
        }`}>
          {toast.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
          <span className="font-semibold">{toast.message}</span>
        </div>
      )}

      <nav className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-2xl font-black tracking-tighter text-white font-serif italic"
          >
            Sarvagna
          </button>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Knowledge Base</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-12 space-y-10">
        <div>
          <h1 className="text-3xl font-black text-white">Knowledge Base</h1>
          <p className="text-slate-500 mt-1">Upload study materials to power your AI tutor</p>
        </div>

        {/* Subject selector */}
        <div className="w-full max-w-xs">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 block">
            Link to Subject (optional)
          </label>
          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500/50"
          >
            <option value="">No subject</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* File drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => !selectedFile && fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer ${
            dragging
              ? 'border-indigo-500 bg-indigo-500/5'
              : selectedFile
              ? 'border-emerald-500/40 bg-emerald-500/5 cursor-default'
              : 'border-slate-700 bg-slate-900/30 hover:border-indigo-500/40 hover:bg-slate-900/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md,.docx"
            className="hidden"
            onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}
          />
          {selectedFile ? (
            <>
              <FileText className="w-10 h-10 text-emerald-400" />
              <div className="text-center">
                <p className="font-bold text-white">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={e => { e.stopPropagation(); handleFileUpload(); }}
                  disabled={uploading}
                  className="px-6 py-2 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center gap-2"
                >
                  {uploading ? (
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4" />
                  )}
                  {uploading ? 'Indexing...' : 'Upload & Index'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setSelectedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-xl transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                <Upload className="w-6 h-6 text-slate-400" />
              </div>
              <div className="text-center">
                <p className="font-bold text-slate-300">Drag & drop or click to upload</p>
                <p className="text-sm text-slate-500 mt-1">PDF, TXT, DOCX, MD supported</p>
              </div>
            </>
          )}
        </div>

        <p className="text-xs text-slate-600 text-center -mt-4">
          Files are indexed automatically. Re-upload to refresh content.
        </p>

        {/* Smart URL section — fetch + scrape links */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-400">
              <LinkIcon className="w-4 h-4" />
              <span className="text-sm font-bold uppercase tracking-widest">Fetch from URL</span>
            </div>
            <p className="text-xs text-slate-500">
              Paste a page link — Sarvagna scans it for academic PDFs. Select which ones to ingest.
            </p>
            <div className="flex gap-3">
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleFetchLinks()}
                placeholder="https://vtucircle.com/notes/..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                onClick={handleFetchLinks}
                disabled={fetchingLinks || !url.trim()}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all flex items-center gap-2 whitespace-nowrap"
              >
                {fetchingLinks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Globe className="w-4 h-4" />}
                {fetchingLinks ? 'Scanning...' : 'Scan Links'}
              </button>
            </div>
          </div>

          {/* Scraped links list */}
          {scrapedLinks.length > 0 && (
            <div className="border-t border-slate-800">
              <div className="px-6 py-3 bg-slate-800/40 flex items-center justify-between">
                <span className="text-sm text-slate-400 font-medium">
                  {scrapedLinks.filter(l => l.link_type === 'pdf').length} PDFs
                  {scrapedLinks.filter(l => l.link_type === 'download').length > 0 && (
                    <span className="text-slate-500"> · {scrapedLinks.filter(l => l.link_type === 'download').length} download links</span>
                  )}
                  {selectedUrls.size > 0 && (
                    <span className="ml-2 text-cyan-400">· {selectedUrls.size} selected</span>
                  )}
                </span>
                <button
                  onClick={handleConfirmSelection}
                  disabled={selectedUrls.size === 0}
                  className="text-sm bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 px-4 py-1.5 rounded-lg hover:bg-cyan-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-semibold"
                >
                  Ingest Selected
                </button>
              </div>
              <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
                {scrapedLinks.map(link => {
                  const status = ingesting[link.url];
                  return (
                    <label
                      key={link.url}
                      className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUrls.has(link.url)}
                        disabled={!!status}
                        onChange={() => toggleUrl(link.url)}
                        className="w-4 h-4 accent-cyan-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-200 truncate">{link.title}</p>
                          {link.link_type === 'pdf' && (
                            <span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded">PDF</span>
                          )}
                          {link.link_type === 'download' && (
                            <span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded">DL</span>
                          )}
                          {link.link_type === 'page' && (
                            <span className="shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 bg-slate-500/10 text-slate-500 border border-slate-500/20 rounded">PAGE</span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{link.url}</p>
                      </div>
                      <div className="shrink-0">
                        {status === 'pending' && <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />}
                        {status === 'done'    && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {status === 'error'   && <AlertCircle className="w-4 h-4 text-rose-400" />}
                        {!status              && <FileText className="w-4 h-4 text-slate-600" />}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Indexed files table */}
        {files.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-800">
              <h2 className="font-bold text-white">Indexed Materials</h2>
              <p className="text-xs text-slate-500 mt-0.5">{files.length} file{files.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="divide-y divide-slate-800">
              {files.map(f => (
                <div key={f.id} className="flex items-center gap-4 px-6 py-4 hover:bg-slate-800/30 transition-colors">
                  <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-black ${(typeIcon[f.file_type] ?? typeIcon.txt).bg} ${(typeIcon[f.file_type] ?? typeIcon.txt).text}`}>
                    {(typeIcon[f.file_type] ?? typeIcon.txt).label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{f.filename}</p>
                    <p className="text-xs text-slate-500">{formatDate(f.created_at)}</p>
                  </div>
                  {f.storage_url && (
                    <a
                      href={f.storage_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View in Supabase"
                      className="shrink-0 p-1.5 text-slate-600 hover:text-cyan-400 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg border ${badgeColor[f.file_type] ?? badgeColor.txt}`}>
                    {f.file_type}
                  </span>
                  <span className="text-xs text-slate-400 font-mono whitespace-nowrap">{f.chunk_count} chunks</span>
                  <button
                    onClick={() => handleDelete(f.id)}
                    className="p-2 text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {files.length === 0 && (
          <p className="text-center text-slate-600 text-sm py-4">No materials indexed yet.</p>
        )}
      </main>
    </div>
  );
};

export default UploadPage;
