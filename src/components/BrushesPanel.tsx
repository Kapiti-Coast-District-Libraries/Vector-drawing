import React, { useState } from 'react';
import {
  Paintbrush,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Layers,
  StretchHorizontal,
  Repeat,
  Sliders,
  RotateCw,
  Eye,
  Info,
  Shapes
} from 'lucide-react';
import { BrushDefinition, BrushType, PathElement } from '../types';
import { generateBrushPreviewSvg } from '../utils/brush-engine';

interface BrushesPanelProps {
  brushes: BrushDefinition[];
  activeBrushId: string | null;
  selectedElement: PathElement | null;
  selectedElementsCount: number;
  onSelectBrush: (brushId: string | null) => void;
  onOpenNewBrushModal: () => void;
  onDeleteBrush: (brushId: string) => void;
  onExpandAppearance: () => void;
  strokeColor?: string;
}

export const BrushesPanel: React.FC<BrushesPanelProps> = ({
  brushes,
  activeBrushId,
  selectedElement,
  selectedElementsCount,
  onSelectBrush,
  onOpenNewBrushModal,
  onDeleteBrush,
  onExpandAppearance,
  strokeColor = '#2563eb',
}) => {
  const [filterType, setFilterType] = useState<'all' | BrushType>('all');

  const filteredBrushes = brushes.filter((b) => {
    if (filterType === 'all') return true;
    return b.type === filterType;
  });

  const appliedBrushId = selectedElement?.brushId || activeBrushId;
  const hasAppliedBrush = !!appliedBrushId;

  return (
    <div className="flex flex-col h-full text-slate-800 text-xs">
      {/* Panel Top Bar */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 uppercase tracking-wider text-[11px]">
          <Paintbrush size={14} className="text-blue-600" />
          <span>Brushes Library</span>
        </div>

        <button
          type="button"
          onClick={onOpenNewBrushModal}
          disabled={selectedElementsCount === 0}
          className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition ${
            selectedElementsCount > 0
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer active:scale-98'
              : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
          }`}
          title={
            selectedElementsCount > 0
              ? 'Save selected shape(s) as a new Illustrator Art or Pattern Brush'
              : 'Select one or more shapes on the canvas to save as a new brush'
          }
        >
          <Plus size={12} />
          <span>New Brush</span>
        </button>
      </div>

      {/* Filter Chips: All, Art Brushes, Pattern Brushes */}
      <div className="flex gap-1 mb-2.5 bg-slate-100 p-0.5 rounded-lg text-[10px] font-semibold">
        <button
          onClick={() => setFilterType('all')}
          className={`flex-1 py-1 rounded-md transition ${
            filterType === 'all'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          All ({brushes.length})
        </button>
        <button
          onClick={() => setFilterType('art')}
          className={`flex-1 py-1 rounded-md flex items-center justify-center gap-1 transition ${
            filterType === 'art'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <StretchHorizontal size={10} />
          <span>Art</span>
        </button>
        <button
          onClick={() => setFilterType('pattern')}
          className={`flex-1 py-1 rounded-md flex items-center justify-center gap-1 transition ${
            filterType === 'pattern'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Repeat size={10} />
          <span>Pattern</span>
        </button>
      </div>

      {/* Brushes List */}
      <div className="space-y-1.5 overflow-y-auto max-h-64 pr-1 flex-1">
        {/* 1. Basic Standard Stroke (No Brush) */}
        <button
          type="button"
          onClick={() => onSelectBrush(null)}
          className={`w-full p-2 rounded-lg border text-left flex items-center justify-between transition ${
            !appliedBrushId
              ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20'
              : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 bg-white'
          }`}
        >
          <div className="flex items-center gap-2">
            <div className="w-16 h-7 bg-slate-50 rounded border border-slate-200 flex items-center justify-center px-1">
              <div className="w-full h-[2px] bg-slate-800 rounded"></div>
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-[11px]">Basic Stroke</div>
              <div className="text-[10px] text-slate-400">Standard vector stroke</div>
            </div>
          </div>
          {!appliedBrushId && <Check size={14} className="text-blue-600 font-bold mr-1" />}
        </button>

        {/* 2. Registered Brushes */}
        {filteredBrushes.map((brush) => {
          const isSelected = appliedBrushId === brush.id;
          const previewSvg = generateBrushPreviewSvg(brush, 140, 36, isSelected ? '#2563eb' : '#334155');

          return (
            <div
              key={brush.id}
              onClick={() => onSelectBrush(brush.id)}
              className={`w-full p-2 rounded-lg border text-left flex items-center justify-between cursor-pointer transition relative group ${
                isSelected
                  ? 'border-blue-500 bg-blue-50/50 ring-1 ring-blue-500/30 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white'
              }`}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* SVG Live Preview Thumbnail */}
                <div
                  className="w-20 h-8 bg-slate-100/90 rounded border border-slate-200/80 flex items-center justify-center overflow-hidden shrink-0"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />

                {/* Name & Type Badge */}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-[11px] truncate">
                    {brush.name}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`text-[9px] font-semibold px-1 py-0.2 rounded-sm ${
                        brush.type === 'art'
                          ? 'bg-purple-50 text-purple-600 border border-purple-100'
                          : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}
                    >
                      {brush.type === 'art' ? 'Art' : 'Pattern'}
                    </span>
                    {!brush.isDefault && (
                      <span className="text-[9px] text-blue-600 font-medium">Custom</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status & Delete */}
              <div className="flex items-center gap-1 shrink-0 ml-1">
                {isSelected && <Check size={14} className="text-blue-600 font-bold" />}

                {!brush.isDefault && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBrush(brush.id);
                    }}
                    className="p-1 text-slate-300 hover:text-red-600 rounded opacity-0 group-hover:opacity-100 transition"
                    title="Delete custom brush"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Element with Brush Actions: Expand Appearance (Convert to real vector paths) */}
      {selectedElement && selectedElement.brushId && (
        <div className="pt-2.5 mt-2.5 border-t border-slate-200/90 space-y-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-500 font-medium">Applied Brush:</span>
            <span className="font-semibold text-blue-600 truncate max-w-[150px]">
              {brushes.find((b) => b.id === selectedElement.brushId)?.name || 'Custom Brush'}
            </span>
          </div>

          <button
            type="button"
            onClick={onExpandAppearance}
            className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
            title="Convert the brush appearance into independent closed vector shapes (Illustrator Expand Tool, Ctrl+E)"
          >
            <Shapes size={13} />
            <span>Turn into Shapes (Expand)</span>
          </button>
          <div className="text-[9px] text-slate-400 text-center leading-tight">
            * Converts into separate closed editable vector shapes with fill
          </div>
        </div>
      )}
    </div>
  );
};
