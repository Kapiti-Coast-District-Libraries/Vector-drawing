import React, { useState } from 'react';
import {
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Sliders,
  HardDrive,
  Upload,
  Sparkles,
  Search,
  Check,
  ChevronDown
} from 'lucide-react';
import { PathElement } from '../types';
import { FontItem } from '../utils/font-manager';

interface TextPropertiesPanelProps {
  selectedElement: PathElement | null;
  onUpdateElement: (updated: Partial<PathElement>) => void;
  fonts: FontItem[];
  onOpenComputerFontsModal: () => void;
  onUploadFontFile: () => void;
  onCreateOutlines: () => void;
  isOutlining: boolean;
}

export const TextPropertiesPanel: React.FC<TextPropertiesPanelProps> = ({
  selectedElement,
  onUpdateElement,
  fonts,
  onOpenComputerFontsModal,
  onUploadFontFile,
  onCreateOutlines,
  isOutlining,
}) => {
  const [fontSearch, setFontSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'local-api' | 'google-font' | 'system' | 'file-upload'>('all');
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);

  if (!selectedElement || selectedElement.type !== 'text') {
    return null;
  }

  const currentFontFamily = selectedElement.fontFamily || 'Inter';
  const currentFontSize = selectedElement.fontSize || 48;
  const currentFontWeight = selectedElement.fontWeight || 600;
  const currentFontStyle = selectedElement.fontStyle || 'normal';
  const currentTextAlign = selectedElement.textAlign || 'left';
  const currentLetterSpacing = selectedElement.letterSpacing || 0;

  // Filter fonts
  const filteredFonts = fonts.filter(f => {
    const matchesSearch = f.family.toLowerCase().includes(fontSearch.toLowerCase()) ||
      (f.fullName && f.fullName.toLowerCase().includes(fontSearch.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || f.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const fontPresets = [18, 24, 36, 48, 72, 96, 120];

  return (
    <div className="p-4 border-b border-slate-200/80 space-y-4 bg-slate-50/50">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <Type size={15} className="text-blue-600" />
          Character & Typography
        </h4>
        <button
          onClick={onOpenComputerFontsModal}
          className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-0.5 rounded flex items-center gap-1 transition"
          title="Access fonts from your computer"
        >
          <HardDrive size={11} />
          Computer Fonts
        </button>
      </div>

      {/* Live Text Content Input */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-slate-500">Text Content</label>
        <textarea
          rows={2}
          value={selectedElement.text || ''}
          onChange={(e) => onUpdateElement({ text: e.target.value })}
          placeholder="Enter text..."
          className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans shadow-inner resize-y"
        />
      </div>

      {/* Font Family Selector Dropdown */}
      <div className="space-y-1 relative">
        <div className="flex justify-between items-center text-[11px] font-medium text-slate-500">
          <span>Font Family</span>
          <span className="text-[10px] text-slate-400 capitalize">
            {fonts.find(f => f.family.toLowerCase() === currentFontFamily.toLowerCase())?.category.replace('-', ' ') || 'system'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsFontDropdownOpen(!isFontDropdownOpen)}
          className="w-full flex items-center justify-between p-2 bg-white border border-slate-200 rounded-lg text-xs hover:border-slate-300 transition text-left shadow-sm"
        >
          <span
            className="truncate font-medium text-slate-800"
            style={{ fontFamily: currentFontFamily }}
          >
            {currentFontFamily}
          </span>
          <ChevronDown size={14} className="text-slate-400 shrink-0 ml-1" />
        </button>

        {isFontDropdownOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 p-2 space-y-2 max-h-80 flex flex-col">
            {/* Search Input */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                value={fontSearch}
                onChange={(e) => setFontSearch(e.target.value)}
                placeholder="Search fonts..."
                className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* Category Filter Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-[10px] scrollbar-none">
              {(['all', 'local-api', 'google-font', 'system', 'file-upload'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2 py-0.5 rounded-full whitespace-nowrap transition ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white font-semibold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all'
                    ? 'All'
                    : cat === 'local-api'
                    ? 'Computer'
                    : cat === 'google-font'
                    ? 'Web'
                    : cat === 'file-upload'
                    ? 'Uploaded'
                    : 'System'}
                </button>
              ))}
            </div>

            {/* Font List */}
            <div className="overflow-y-auto max-h-48 divide-y divide-slate-100 pr-1 space-y-0.5">
              {filteredFonts.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400">
                  No matching fonts found
                </div>
              ) : (
                filteredFonts.map(f => {
                  const isSelected = f.family.toLowerCase() === currentFontFamily.toLowerCase();
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        onUpdateElement({ fontFamily: f.family });
                        setIsFontDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs transition group ${
                        isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="truncate pr-2">
                        <div style={{ fontFamily: f.family }} className="text-sm truncate">
                          {f.family}
                        </div>
                        <div className="text-[10px] text-slate-400 font-sans">
                          {f.category === 'local-api' ? 'Local Computer Font' : f.category === 'google-font' ? 'Web Font' : f.category === 'file-upload' ? 'Custom Uploaded' : 'System Default'}
                        </div>
                      </div>
                      {isSelected && <Check size={14} className="text-blue-600 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            {/* Quick Actions Footer inside dropdown */}
            <div className="pt-2 border-t border-slate-100 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsFontDropdownOpen(false);
                  onOpenComputerFontsModal();
                }}
                className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-semibold rounded-lg flex items-center justify-center gap-1 transition"
              >
                <HardDrive size={11} />
                Scan Computer
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFontDropdownOpen(false);
                  onUploadFontFile();
                }}
                className="flex-1 py-1.5 px-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-semibold rounded-lg flex items-center justify-center gap-1 transition"
              >
                <Upload size={11} />
                Upload File (.ttf)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Font Size & Weight Row */}
      <div className="grid grid-cols-2 gap-2">
        {/* Font Size */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] font-medium text-slate-500">
            <span>Size</span>
            <span className="font-mono text-slate-700">{currentFontSize}px</span>
          </div>
          <input
            type="range"
            min={10}
            max={200}
            value={currentFontSize}
            onChange={(e) => onUpdateElement({ fontSize: Number(e.target.value) })}
            className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
        </div>

        {/* Font Weight */}
        <div className="space-y-1">
          <label className="text-[11px] font-medium text-slate-500">Weight</label>
          <select
            value={currentFontWeight}
            onChange={(e) => onUpdateElement({ fontWeight: Number(e.target.value) })}
            className="w-full text-xs p-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
          >
            <option value={300}>Light (300)</option>
            <option value={400}>Regular (400)</option>
            <option value={500}>Medium (500)</option>
            <option value={600}>Semi-Bold (600)</option>
            <option value={700}>Bold (700)</option>
            <option value={900}>Black (900)</option>
          </select>
        </div>
      </div>

      {/* Quick Font Size Preset Chips */}
      <div className="flex gap-1 flex-wrap">
        {fontPresets.map(preset => (
          <button
            key={preset}
            onClick={() => onUpdateElement({ fontSize: preset })}
            className={`px-2 py-0.5 rounded text-[10px] font-mono transition ${
              currentFontSize === preset
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Style & Alignment Controls */}
      <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
        {/* Style Toggles */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onUpdateElement({
              fontWeight: currentFontWeight >= 700 ? 400 : 700
            })}
            className={`p-1.5 rounded transition ${
              currentFontWeight >= 700
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Bold"
          >
            <Bold size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUpdateElement({
              fontStyle: currentFontStyle === 'italic' ? 'normal' : 'italic'
            })}
            className={`p-1.5 rounded transition ${
              currentFontStyle === 'italic'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Italic"
          >
            <Italic size={13} />
          </button>
        </div>

        {/* Text Alignments */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => onUpdateElement({ textAlign: 'left' })}
            className={`p-1.5 rounded transition ${
              currentTextAlign === 'left'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Align Left"
          >
            <AlignLeft size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUpdateElement({ textAlign: 'center' })}
            className={`p-1.5 rounded transition ${
              currentTextAlign === 'center'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Align Center"
          >
            <AlignCenter size={13} />
          </button>
          <button
            type="button"
            onClick={() => onUpdateElement({ textAlign: 'right' })}
            className={`p-1.5 rounded transition ${
              currentTextAlign === 'right'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="Align Right"
          >
            <AlignRight size={13} />
          </button>
        </div>
      </div>

      {/* Letter Spacing (Tracking) */}
      <div className="space-y-1">
        <div className="flex justify-between text-[11px] font-medium text-slate-500">
          <span>Letter Spacing (Tracking)</span>
          <span className="font-mono text-slate-700">{currentLetterSpacing}px</span>
        </div>
        <input
          type="range"
          min={-4}
          max={30}
          value={currentLetterSpacing}
          onChange={(e) => onUpdateElement({ letterSpacing: Number(e.target.value) })}
          className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
        />
      </div>

      {/* CREATE OUTLINES (CONVERT TO VECTOR PATHS) ACTION BUTTON */}
      <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
        <button
          onClick={onCreateOutlines}
          disabled={isOutlining}
          className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 group cursor-pointer disabled:opacity-50"
        >
          {isOutlining ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Generating Vector Outlines...</span>
            </>
          ) : (
            <>
              <Sparkles size={15} className="text-amber-300 group-hover:rotate-12 transition-transform" />
              <span>Create Outlines (Ctrl+Shift+O)</span>
            </>
          )}
        </button>
        <p className="text-[10px] text-slate-500 text-center leading-tight">
          Converts text into editable vector paths with Bézier nodes for Pathfinder, Brushes & DXF export.
        </p>
      </div>
    </div>
  );
};
