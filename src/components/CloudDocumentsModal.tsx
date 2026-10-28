import React, { useState, useEffect, useMemo } from 'react';
import {
  Cloud,
  CloudUpload,
  FolderOpen,
  Plus,
  Trash2,
  Copy,
  Search,
  X,
  Check,
  AlertCircle,
  Clock,
  User as UserIcon,
  BookOpen,
  Sparkles,
  RefreshCw,
  FileCheck,
  Image as ImageIcon
} from 'lucide-react';
import {
  fetchUserDocuments,
  saveDocumentToCloud,
  deleteDocumentFromCloud,
  CloudDocument
} from '../utils/firebase';
import { Layer, TracingImage } from '../types';
import { generateThumbnailSvg } from '../utils/thumbnail-generator';

interface CloudDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'browse' | 'save';
  currentLayers: Layer[];
  currentTracingImage: TracingImage | null;
  currentArtboardWidth: number;
  currentArtboardHeight: number;
  currentUnit: string;
  activeCloudDoc: CloudDocument | null;
  onLoadDocument: (doc: CloudDocument) => void;
  onSavedDocument: (doc: CloudDocument) => void;
}

export function CloudDocumentsModal({
  isOpen,
  onClose,
  initialMode = 'browse',
  currentLayers,
  currentTracingImage,
  currentArtboardWidth,
  currentArtboardHeight,
  currentUnit,
  activeCloudDoc,
  onLoadDocument,
  onSavedDocument
}: CloudDocumentsModalProps) {
  const [mode, setMode] = useState<'browse' | 'save'>(initialMode);
  const [documents, setDocuments] = useState<CloudDocument[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Form states for saving
  const [title, setTitle] = useState<string>(activeCloudDoc ? activeCloudDoc.title : 'My Vector Project');
  const [studentName, setStudentName] = useState<string>(() => {
    return activeCloudDoc?.studentName || localStorage.getItem('last_student_maker_name') || '';
  });
  const [lessonName, setLessonName] = useState<string>(activeCloudDoc?.lessonName || '');
  const [saveAsNewCopy, setSaveAsNewCopy] = useState<boolean>(false);

  // Search & filter states for browsing
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedLessonFilter, setSelectedLessonFilter] = useState<string>('all');
  const [documentToDelete, setDocumentToDelete] = useState<CloudDocument | null>(null);

  // Update mode if initialMode prop changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
      setSaveAsNewCopy(false);
      if (activeCloudDoc) {
        setTitle(activeCloudDoc.title);
        setStudentName(activeCloudDoc.studentName);
        setLessonName(activeCloudDoc.lessonName || '');
      }
    }
  }, [isOpen, initialMode, activeCloudDoc]);

  // Load documents when modal opens
  const loadDocuments = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const docs = await fetchUserDocuments();
      setDocuments(docs);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to load documents from cloud');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen]);

  // Extract unique lesson names for filtering
  const uniqueLessons = useMemo(() => {
    const set = new Set<string>();
    documents.forEach(d => {
      if (d.lessonName && d.lessonName.trim()) {
        set.add(d.lessonName.trim());
      }
    });
    return Array.from(set);
  }, [documents]);

  // Filtered documents list
  const filteredDocuments = useMemo(() => {
    return documents.filter(doc => {
      const matchesSearch =
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.lessonName && doc.lessonName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesLesson =
        selectedLessonFilter === 'all' || doc.lessonName === selectedLessonFilter;

      return matchesSearch && matchesLesson;
    });
  }, [documents, searchQuery, selectedLessonFilter]);

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMessage('Please enter a document title.');
      return;
    }
    if (!studentName.trim()) {
      setErrorMessage('Please enter the student or maker name.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      // Remember student name for subsequent saves on this machine
      localStorage.setItem('last_student_maker_name', studentName.trim());

      // Generate preview thumbnail
      const thumbnailSvg = generateThumbnailSvg(
        currentLayers,
        currentArtboardWidth,
        currentArtboardHeight
      );

      const isUpdate = activeCloudDoc && !saveAsNewCopy;
      const targetId = isUpdate ? activeCloudDoc.id : undefined;

      const savedDocId = await saveDocumentToCloud({
        id: targetId,
        title: title.trim(),
        studentName: studentName.trim(),
        lessonName: lessonName.trim() || undefined,
        layers: currentLayers,
        tracingImage: currentTracingImage,
        artboardWidth: currentArtboardWidth,
        artboardHeight: currentArtboardHeight,
        unit: currentUnit,
        thumbnailSvg
      });

      const updatedDoc: CloudDocument = {
        id: savedDocId,
        title: title.trim(),
        studentName: studentName.trim(),
        lessonName: lessonName.trim() || undefined,
        layers: currentLayers,
        tracingImage: currentTracingImage,
        artboardWidth: currentArtboardWidth,
        artboardHeight: currentArtboardHeight,
        unit: currentUnit,
        thumbnailSvg,
        createdAt: activeCloudDoc?.createdAt || new Date(),
        updatedAt: new Date()
      };

      onSavedDocument(updatedDoc);
      setSuccessToast(isUpdate ? 'Document & tracing reference updated in cloud!' : 'New cloud document & tracing reference saved!');
      setTimeout(() => setSuccessToast(null), 3000);

      // Refresh list
      await loadDocuments();
      setMode('browse');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error saving document to cloud');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDoc = (docToLoad: CloudDocument) => {
    onLoadDocument(docToLoad);
    onClose();
  };

  const handleDeleteConfirm = async () => {
    if (!documentToDelete) return;
    try {
      await deleteDocumentFromCloud(documentToDelete.id);
      setDocuments(prev => prev.filter(d => d.id !== documentToDelete.id));
      setDocumentToDelete(null);
      setSuccessToast('Document removed from cloud');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to delete document');
    }
  };

  const handleDuplicate = async (sourceDoc: CloudDocument) => {
    setLoading(true);
    try {
      const copyTitle = `${sourceDoc.title} (Copy)`;
      await saveDocumentToCloud({
        title: copyTitle,
        studentName: sourceDoc.studentName,
        lessonName: sourceDoc.lessonName,
        layers: sourceDoc.layers,
        tracingImage: sourceDoc.tracingImage,
        artboardWidth: sourceDoc.artboardWidth,
        artboardHeight: sourceDoc.artboardHeight,
        unit: sourceDoc.unit,
        thumbnailSvg: sourceDoc.thumbnailSvg
      });
      await loadDocuments();
      setSuccessToast(`Created duplicate "${copyTitle}"`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to duplicate document');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200/90 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50/50 via-white to-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-xs">
              <Cloud size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Kāpiti Cloud Studio
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  Instant Save • Login-Free
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Save & open vector documents across all library computers, makerspace laptops & class lessons.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status / Feedback Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-rose-500 hover:text-rose-800 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {successToast && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
            <Check size={16} className="text-emerald-600" />
            <span className="font-medium">{successToast}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 border-b border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMode('browse')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                mode === 'browse'
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FolderOpen size={15} />
              <span>Cloud Documents ({documents.length})</span>
            </button>

            <button
              onClick={() => setMode('save')}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition ${
                mode === 'save'
                  ? 'border-blue-600 text-blue-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <CloudUpload size={15} />
              <span>Save Current Design to Cloud</span>
            </button>
          </div>

          {mode === 'browse' && (
            <button
              onClick={loadDocuments}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 p-1.5 rounded-lg hover:bg-slate-200/50 transition cursor-pointer"
              title="Refresh cloud documents"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          )}
        </div>

        {/* Tab 1: Browse Documents */}
        {mode === 'browse' && (
          <div className="flex-1 flex flex-col overflow-hidden p-6">
            {/* Search & Filter Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by title, student name, or lesson..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {uniqueLessons.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  <button
                    onClick={() => setSelectedLessonFilter('all')}
                    className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
                      selectedLessonFilter === 'all'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    All Lessons
                  </button>
                  {uniqueLessons.map(lesson => (
                    <button
                      key={lesson}
                      onClick={() => setSelectedLessonFilter(lesson)}
                      className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg transition whitespace-nowrap ${
                        selectedLessonFilter === lesson
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {lesson}
                    </button>
                  ))}
                </div>
              )}

              <button
                onClick={() => setMode('save')}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <Plus size={14} />
                <span>Save Current Work</span>
              </button>
            </div>

            {/* Documents Grid */}
            <div className="flex-1 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                  <RefreshCw size={24} className="animate-spin text-blue-500" />
                  <span className="text-xs">Loading cloud documents...</span>
                </div>
              ) : filteredDocuments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-56 border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                    <FolderOpen size={24} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800 mb-1">
                    {documents.length === 0 ? 'No Saved Documents Yet' : 'No Matching Documents Found'}
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    {documents.length === 0
                      ? 'Save your vector drawing to the cloud so you can open it anytime from any computer in the library or classroom.'
                      : 'Try adjusting your search query or lesson filter.'}
                  </p>
                  {documents.length === 0 && (
                    <button
                      onClick={() => setMode('save')}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition cursor-pointer"
                    >
                      Save Current Canvas to Cloud
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredDocuments.map(doc => {
                    const isCurrentActive = activeCloudDoc?.id === doc.id;
                    return (
                      <div
                        key={doc.id}
                        className={`group relative flex flex-col bg-white border rounded-2xl overflow-hidden transition shadow-xs hover:shadow-md ${
                          isCurrentActive
                            ? 'border-blue-500 ring-2 ring-blue-500/20'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {/* Visual Thumbnail */}
                        <div className="h-32 bg-slate-50 relative flex items-center justify-center p-3 border-b border-slate-100 overflow-hidden">
                          {doc.thumbnailSvg && doc.layers?.some(l => l.elements.length > 0) ? (
                            <div
                              className="w-full h-full flex items-center justify-center max-h-26"
                              dangerouslySetInnerHTML={{ __html: doc.thumbnailSvg }}
                            />
                          ) : doc.tracingImage?.url ? (
                            <div className="relative w-full h-full flex items-center justify-center p-1">
                              <img
                                src={doc.tracingImage.url}
                                alt="Tracing Reference"
                                className="max-h-26 max-w-full object-contain rounded opacity-80"
                              />
                              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-semibold flex items-center gap-1">
                                <ImageIcon size={9} />
                                <span>Reference</span>
                              </div>
                            </div>
                          ) : doc.thumbnailSvg ? (
                            <div
                              className="w-full h-full flex items-center justify-center max-h-26"
                              dangerouslySetInnerHTML={{ __html: doc.thumbnailSvg }}
                            />
                          ) : (
                            <div className="text-slate-300 flex items-center justify-center">
                              <Sparkles size={28} />
                            </div>
                          )}

                          {isCurrentActive && (
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold text-[10px] shadow-xs flex items-center gap-1">
                              <FileCheck size={11} />
                              <span>Currently Loaded</span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-3.5 flex flex-col flex-1 justify-between gap-2.5">
                          <div>
                            <h4
                              className="text-sm font-bold text-slate-900 truncate"
                              title={doc.title}
                            >
                              {doc.title}
                            </h4>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                <UserIcon size={10} className="text-slate-400" />
                                {doc.studentName}
                              </span>
                              {doc.lessonName && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                                  <BookOpen size={10} className="text-indigo-500" />
                                  {doc.lessonName}
                                </span>
                              )}
                              {doc.tracingImage && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md" title="Contains reference tracing image">
                                  <ImageIcon size={10} className="text-emerald-500" />
                                  JPEG Attached
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1">
                              <Clock size={11} />
                              {doc.updatedAt?.toDate
                                ? doc.updatedAt.toDate().toLocaleDateString()
                                : 'Saved in cloud'}
                            </span>
                            <span>{doc.layers?.length || 1} layer(s)</span>
                          </div>

                          {/* Action buttons */}
                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() => handleOpenDoc(doc)}
                              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1 transition shadow-xs cursor-pointer"
                              title="Load this document into the vector editor"
                            >
                              <FolderOpen size={13} />
                              <span>Open</span>
                            </button>

                            <button
                              onClick={() => handleDuplicate(doc)}
                              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition cursor-pointer"
                              title="Duplicate document as a new copy"
                            >
                              <Copy size={13} />
                            </button>

                            <button
                              onClick={() => setDocumentToDelete(doc)}
                              className="p-1.5 bg-slate-100 hover:bg-rose-100 hover:text-rose-600 text-slate-400 rounded-lg transition cursor-pointer"
                              title="Delete document"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Save Current Document */}
        {mode === 'save' && (
          <form onSubmit={handleSaveSubmit} className="flex-1 flex flex-col p-6 overflow-y-auto">
            <div className="max-w-xl mx-auto w-full space-y-4">
              {/* Notice if updating existing document */}
              {activeCloudDoc && (
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl flex items-center justify-between text-xs text-blue-900">
                  <div>
                    <span className="font-bold">Currently working on:</span> {activeCloudDoc.title}
                    <p className="text-[11px] text-blue-700 mt-0.5">
                      You can overwrite this document with latest changes or save as a separate new copy.
                    </p>
                  </div>
                  <label className="flex items-center gap-1.5 font-semibold text-blue-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsNewCopy}
                      onChange={e => setSaveAsNewCopy(e.target.checked)}
                      className="rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Save as New Copy</span>
                  </label>
                </div>
              )}

              {/* Document Title */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Document Title *
                </label>
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Koru Pendant, Geometric Coaster, Name Plaque"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {/* Student / Maker Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Student / Maker Name *
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="e.g. Liam, Aroha, Class 4B, Teacher Template"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Helps you and your teacher easily find your work when using different computers.
                </p>
              </div>

              {/* Lesson / Class Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Lesson / Topic (Optional)
                </label>
                <input
                  type="text"
                  maxLength={100}
                  value={lessonName}
                  onChange={e => setLessonName(e.target.value)}
                  placeholder="e.g. Lesson 2: Māori Patterns, 3D Laser Prep, Workshop 1"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              {/* Canvas Preview Stats */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs text-slate-600">
                <div>
                  <span className="font-semibold text-slate-800">Canvas Dimensions:</span>{' '}
                  {Math.round(currentArtboardWidth)} × {Math.round(currentArtboardHeight)} px ({currentUnit})
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Layers:</span>{' '}
                  {currentLayers.length} ({currentLayers.reduce((acc, l) => acc + l.elements.length, 0)} elements)
                </div>
              </div>

              {/* Tracing Reference Image Confirmation */}
              {currentTracingImage && (
                <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <ImageIcon size={16} className="text-emerald-700" />
                    </div>
                    <div className="truncate">
                      <span className="font-bold text-emerald-900 block truncate">
                        Tracing Image Attached: {currentTracingImage.name}
                      </span>
                      <p className="text-[11px] text-emerald-700 truncate">
                        Position & scale are preserved so you can continue tracing on any computer.
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 uppercase bg-emerald-200/70 px-2 py-0.5 rounded-full shrink-0 ml-2">
                    Included
                  </span>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Saving to Cloud...</span>
                    </>
                  ) : (
                    <>
                      <CloudUpload size={15} />
                      <span>
                        {activeCloudDoc && !saveAsNewCopy
                          ? 'Update Cloud Document'
                          : 'Save New Document to Cloud'}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setMode('browse')}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Delete Confirmation Modal */}
        {documentToDelete && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/40 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
              <h4 className="text-base font-bold text-slate-900 mb-2">Delete Cloud Document?</h4>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                Are you sure you want to delete <span className="font-semibold text-slate-900">"{documentToDelete.title}"</span>? This will remove it from the cloud and cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => setDocumentToDelete(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  className="px-3.5 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition shadow-xs cursor-pointer"
                >
                  Delete Document
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
