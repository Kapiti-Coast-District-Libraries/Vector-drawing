import React, { useState, useEffect } from 'react';
import { Sparkles, X, Check, ArrowRight, ArrowLeft, Sliders, Palette, Repeat, StretchHorizontal, HelpCircle } from 'lucide-react';
import { PathElement, BrushDefinition, BrushType, BrushOptions } from '../types';
import { createBrushFromSelection, applyBrushToStroke, computeBrushBoundingBox } from '../utils/brush-engine';
import { getPathData } from '../utils/vector-math';

interface BrushModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedElements: PathElement[];
  onSaveBrush: (newBrush: BrushDefinition) => void;
  activeStrokeColor?: string;
}

export const BrushModal: React.FC<BrushModalProps> = ({
  isOpen,
  onClose,
  selectedElements,
  onSaveBrush,
  activeStrokeColor = '#2563eb',
}) => {
  const [brushName, setBrushName] = useState<string>('');
  const [brushType, setBrushType] = useState<BrushType>('art');
  const [direction, setDirection] = useState<'left-to-right' | 'right-to-left'>('left-to-right');
  const [colorMode, setColorMode] = useState<'tints' | 'original'>('tints');
  const [scale, setScale] = useState<number>(1.0);
  const [spacing, setSpacing] = useState<number>(1.2);
  const [flipAcross, setFlipAcross] = useState<boolean>(false);
  const [flipAlong, setFlipAlong] = useState<boolean>(false);

  // Initialize defaults whenever modal opens with selection
  useEffect(() => {
    if (isOpen) {
      const defaultName =
        selectedElements.length > 0
          ? `${selectedElements[0].name || 'Shape'} Brush`
          : 'My Custom Brush';
      setBrushName(defaultName);
      setScale(1.0);
      setSpacing(1.2);
      setFlipAcross(false);
      setFlipAlong(false);
      setColorMode('tints');
      setDirection('left-to-right');
      setBrushType('art');
    }
  }, [isOpen, selectedElements]);

  if (!isOpen) return null;

  // Build a draft brush object for the live preview
  const draftOptions: BrushOptions = {
    direction,
    stretchMode: 'stretch-to-fit',
    spacing,
    flipAcross,
    flipAlong,
    colorMode,
    scale,
  };

  const draftBrush =
    selectedElements.length > 0
      ? createBrushFromSelection(selectedElements, brushName, brushType, draftOptions)
      : null;

  // Create test preview stroke (smooth S-curve)
  const previewStrokeWidth = 400;
  const previewStrokeHeight = 130;
  const sampleTarget: PathElement = {
    id: 'sample-stroke',
    name: 'Sample Stroke',
    type: 'path',
    nodes: [
      {
        id: 's1',
        anchor: { x: 30, y: 90 },
        handleOut: { x: 140, y: 20 },
        type: 'smooth',
      },
      {
        id: 's2',
        anchor: { x: 370, y: 45 },
        handleIn: { x: 260, y: 110 },
        type: 'smooth',
      },
    ],
    closed: false,
    fill: 'none',
    fillOpacity: 1,
    stroke: activeStrokeColor,
    strokeWidth: 4,
    visible: true,
    locked: false,
  };

  const deformedElements = draftBrush ? applyBrushToStroke(sampleTarget, draftBrush) : [];
  const sourceBBox = selectedElements.length > 0 ? computeBrushBoundingBox(selectedElements) : null;

  const handleSave = () => {
    if (!draftBrush) return;
    onSaveBrush(draftBrush);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200/90 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New Brush Options (Illustrator)</h2>
              <p className="text-xs text-slate-500">Save selected vector shape as an Art or Pattern brush</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Brush Name Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Brush Name
            </label>
            <input
              type="text"
              value={brushName}
              onChange={(e) => setBrushName(e.target.value)}
              placeholder="e.g. My Custom Flourish"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
            />
          </div>

          {/* Brush Type Selector (Art Brush vs Pattern Brush) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Brush Type
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setBrushType('art')}
                className={`p-3.5 rounded-lg border text-left transition flex items-start gap-3 ${
                  brushType === 'art'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-md ${
                    brushType === 'art' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <StretchHorizontal size={18} />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Art Brush
                    {brushType === 'art' && <Check size={14} className="text-blue-600 font-bold" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Stretches your shape smoothly along the stroke from start to finish (calligraphy, ribbons, arrows).
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setBrushType('pattern')}
                className={`p-3.5 rounded-lg border text-left transition flex items-start gap-3 ${
                  brushType === 'pattern'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div
                  className={`p-2 rounded-md ${
                    brushType === 'pattern' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <Repeat size={18} />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    Pattern / Scatter Brush
                    {brushType === 'pattern' && <Check size={14} className="text-blue-600 font-bold" />}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                    Repeats the shape along the stroke at regular spacing intervals (beads, stitches, leaves, stars).
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Interactive Live Preview Box */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                Live Stroke Preview
                <span className="text-[10px] text-slate-400 font-normal">
                  (Simulated S-curve stroke)
                </span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                {brushType === 'art' ? 'Stretched along curve' : `Repeated along curve`}
              </span>
            </div>
            <div className="h-32 bg-slate-900 rounded-lg border border-slate-800 p-2 flex items-center justify-center relative overflow-hidden shadow-inner">
              {/* Subtle background grid */}
              <div
                className="absolute inset-0 opacity-15"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)',
                  backgroundSize: '16px 16px',
                }}
              />

              <svg
                viewBox={`0 0 ${previewStrokeWidth} ${previewStrokeHeight}`}
                className="w-full h-full relative z-10"
              >
                {/* Reference center stroke line */}
                <path
                  d={getPathData(sampleTarget.nodes, false)}
                  fill="none"
                  stroke="#334155"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* Deformed Brush Artwork */}
                {deformedElements.map((el, idx) => (
                  <path
                    key={idx}
                    d={getPathData(el.nodes, el.closed)}
                    fill={el.fill}
                    fillOpacity={el.fill === 'none' ? 0 : el.fillOpacity}
                    stroke={el.stroke === 'none' ? 'none' : el.stroke}
                    strokeWidth={el.strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </svg>
            </div>
          </div>

          {/* Configuration Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/70 p-4 rounded-lg border border-slate-200/80">
            {/* Direction */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                Stroke Flow Direction
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDirection('left-to-right')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition border ${
                    direction === 'left-to-right'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>Left to Right</span>
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setDirection('right-to-left')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition border ${
                    direction === 'right-to-left'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <ArrowLeft size={13} />
                  <span>Right to Left</span>
                </button>
              </div>
            </div>

            {/* Colorization Method (Illustrator Tints vs Original) */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1.5">
                Colorization Method
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setColorMode('tints')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition border ${
                    colorMode === 'tints'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Brush automatically takes the stroke color of the path it's applied to"
                >
                  <Palette size={13} />
                  <span>Tints (Use Stroke Color)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setColorMode('original')}
                  className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 transition border ${
                    colorMode === 'original'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Brush keeps its original shape colors"
                >
                  <span>Keep Original</span>
                </button>
              </div>
            </div>

            {/* Scale / Thickness Multiplier */}
            <div>
              <div className="flex justify-between text-[11px] font-semibold text-slate-700 mb-1">
                <span>Thickness Scale</span>
                <span className="font-mono text-slate-500">{scale.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="2.5"
                step="0.1"
                value={scale}
                onChange={(e) => setScale(parseFloat(e.target.value))}
                className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
              />
            </div>

            {/* Pattern Spacing Slider (Only for Pattern Brushes) */}
            {brushType === 'pattern' ? (
              <div>
                <div className="flex justify-between text-[11px] font-semibold text-slate-700 mb-1">
                  <span>Pattern Spacing</span>
                  <span className="font-mono text-slate-500">{spacing.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="2.5"
                  step="0.1"
                  value={spacing}
                  onChange={(e) => setSpacing(parseFloat(e.target.value))}
                  className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                />
              </div>
            ) : (
              /* Flip Options */
              <div className="flex items-center gap-4 pt-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flipAcross}
                    onChange={(e) => setFlipAcross(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-white border-slate-300"
                  />
                  <span>Flip Across (Vertical)</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flipAlong}
                    onChange={(e) => setFlipAlong(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-white border-slate-300"
                  />
                  <span>Flip Along (Reverse)</span>
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <HelpCircle size={13} className="text-slate-400" />
            <span>Applies directly to any selected path or new strokes</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer active:scale-98"
            >
              <Check size={14} />
              <span>Save Brush</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
