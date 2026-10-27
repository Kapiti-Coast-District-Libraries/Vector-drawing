import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Check,
  Wand2,
  Sliders,
  Upload,
  Eye,
  RotateCcw,
  Sparkles,
  Scissors,
  Image as ImageIcon,
  Zap,
  Layers,
  ArrowRight
} from 'lucide-react';
import { PathElement, Point, TracingImage } from '../types';
import {
  vectorizeImage,
  getImageDataFromSource,
  traceImage,
  TraceOptions
} from '../utils/image-tracer';
import { pointsToVectorNodes } from '../utils/stroke-to-path';
import { getPathData } from '../utils/vector-math';

export interface ImageTraceModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTracingImage?: TracingImage | null;
  referenceImage?: TracingImage | null;
  onApplyVectorTrace?: (elements: PathElement[], hideReferenceImage: boolean) => void;
  onApplyTrace?: (elements: PathElement[], hideReferenceImage: boolean) => void;
  artboardWidth?: number;
  artboardHeight?: number;
  currentStrokeColor?: string;
  currentFillColor?: string;
}

export const ImageTraceModal: React.FC<ImageTraceModalProps> = ({
  isOpen,
  onClose,
  activeTracingImage,
  referenceImage,
  onApplyVectorTrace,
  onApplyTrace,
  artboardWidth = 800,
  artboardHeight = 600,
  currentStrokeColor = '#2563eb',
  currentFillColor = '#111827',
}) => {
  const currentImage = activeTracingImage !== undefined ? activeTracingImage : (referenceImage ?? null);
  const applyCallback = onApplyVectorTrace || onApplyTrace;

  // Source image state (URL or data URL)
  const [imageSource, setImageSource] = useState<string>('');
  const [imageFileName, setImageFileName] = useState<string>('');

  // Vectorizer parameters
  const [threshold, setThreshold] = useState<number>(128);
  const [invert, setInvert] = useState<boolean>(false);
  const [smoothEpsilon, setSmoothEpsilon] = useState<number>(1.0);
  const [minPathLength, setMinPathLength] = useState<number>(4);
  const [renderMode, setRenderMode] = useState<'fills' | 'strokes' | 'both'>('fills');
  const [fillColor, setFillColor] = useState<string>(currentFillColor === 'none' ? '#111827' : currentFillColor);
  const [strokeColor, setStrokeColor] = useState<string>(currentStrokeColor);
  const [strokeWidth, setStrokeWidth] = useState<number>(1.5);
  const [hideReferenceAfterTrace, setHideReferenceAfterTrace] = useState<boolean>(true);

  // Preview display mode
  const [previewDisplay, setPreviewDisplay] = useState<'vector' | 'overlay' | 'original'>('vector');

  // Tracing computation status & results
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');
  const [tracedElements, setTracedElements] = useState<PathElement[]>([]);
  const [stats, setStats] = useState<{ paths: number; vertices: number; timeMs: number }>({
    paths: 0,
    vertices: 0,
    timeMs: 0,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (currentImage && currentImage.url) {
        setImageSource(currentImage.url);
        setImageFileName(currentImage.name || 'Canvas Reference Image');
      } else {
        // If no image is currently on canvas, provide a clean starter vector test badge
        setImageSource('');
        setImageFileName('');
      }
    }
  }, [isOpen, currentImage]);

  // Run vectorization whenever inputs change
  useEffect(() => {
    if (!isOpen || !imageSource) {
      setTracedElements([]);
      setPreviewDataUrl('');
      return;
    }

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(async () => {
      setIsProcessing(true);
      try {
        const targetPlacementX = currentImage ? currentImage.x : (artboardWidth - 400) / 2;
        const targetPlacementY = currentImage ? currentImage.y : (artboardHeight - 300) / 2;
        const targetScale = currentImage ? currentImage.scale : 1.0;
        const targetRotation = currentImage ? currentImage.rotate : 0;

        const result = await vectorizeImage(imageSource, {
          threshold,
          invert,
          smoothEpsilon,
          minPathLength,
          mode: renderMode,
          fillColor,
          strokeColor,
          strokeWidth,
          targetWidth: 500 * targetScale,
          offsetX: targetPlacementX,
          offsetY: targetPlacementY,
          rotationDeg: targetRotation,
        });

        setTracedElements(result.elements);
        setPreviewDataUrl(result.previewDataUrl);

        let totalVertices = 0;
        result.elements.forEach(el => {
          totalVertices += el.nodes.length;
        });

        setStats({
          paths: result.elements.length,
          vertices: totalVertices,
          timeMs: result.durationMs,
        });
      } catch (err) {
        console.error('Vectorize preview error:', err);
      } finally {
        setIsProcessing(false);
      }
    }, 120);

    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    isOpen,
    imageSource,
    threshold,
    invert,
    smoothEpsilon,
    minPathLength,
    renderMode,
    fillColor,
    strokeColor,
    strokeWidth,
    activeTracingImage,
    artboardWidth,
    artboardHeight,
  ]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setImageSource(dataUrl);
      setImageFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    if (tracedElements.length === 0) return;
    if (typeof applyCallback === 'function') {
      applyCallback(tracedElements, hideReferenceAfterTrace);
    }
    onClose();
  };

  // Presets
  const applyPreset = (preset: 'logo' | 'lineart' | 'silhouette' | 'smooth') => {
    switch (preset) {
      case 'logo':
        setThreshold(128);
        setSmoothEpsilon(1.0);
        setMinPathLength(4);
        setRenderMode('fills');
        setInvert(false);
        break;
      case 'lineart':
        setThreshold(160);
        setSmoothEpsilon(0.6);
        setMinPathLength(3);
        setRenderMode('strokes');
        setStrokeWidth(1.5);
        setInvert(false);
        break;
      case 'silhouette':
        setThreshold(110);
        setSmoothEpsilon(1.4);
        setMinPathLength(6);
        setRenderMode('fills');
        setInvert(false);
        break;
      case 'smooth':
        setThreshold(128);
        setSmoothEpsilon(2.2);
        setMinPathLength(5);
        setRenderMode('both');
        setInvert(false);
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Wand2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">Image Trace (Vectorize Bitmap)</h2>
              <p className="text-xs text-slate-500">
                Sub-pixel Marching Squares, Chaikin B-splines & Ramer-Douglas-Peucker simplification
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Left Column: Live Interactive Visualizer Preview */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Interactive Preview
              </span>
              <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px] font-semibold text-slate-600">
                <button
                  type="button"
                  onClick={() => setPreviewDisplay('vector')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    previewDisplay === 'vector' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
                  }`}
                >
                  Vector Only
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDisplay('overlay')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    previewDisplay === 'overlay' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
                  }`}
                >
                  Overlay
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDisplay('original')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    previewDisplay === 'original' ? 'bg-white text-blue-600 shadow-2xs' : 'hover:text-slate-900'
                  }`}
                >
                  Original
                </button>
              </div>
            </div>

            {/* Preview Box Container */}
            <div className="relative w-full aspect-4/3 bg-slate-900 rounded-xl border border-slate-200 overflow-hidden flex items-center justify-center p-4">
              {/* Checkerboard transparency background */}
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  backgroundImage: `radial-gradient(#ffffff 1px, transparent 1px)`,
                  backgroundSize: '16px 16px',
                }}
              />

              {imageSource ? (
                <div className="relative max-w-full max-h-full flex items-center justify-center">
                  {/* Original image underlay */}
                  {(previewDisplay === 'original' || previewDisplay === 'overlay') && (
                    <img
                      src={imageSource}
                      alt="Original Reference"
                      className={`max-w-full max-h-[300px] object-contain rounded transition-opacity ${
                        previewDisplay === 'overlay' ? 'opacity-40 filter grayscale' : 'opacity-100'
                      }`}
                    />
                  )}

                  {/* Traced Vector preview */}
                  {(previewDisplay === 'vector' || previewDisplay === 'overlay') && previewDataUrl && (
                    <img
                      src={previewDataUrl}
                      alt="Vector Trace Result"
                      className="max-w-full max-h-[300px] object-contain rounded"
                    />
                  )}

                  {isProcessing && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-2xs rounded">
                      <div className="flex items-center gap-2 bg-white/90 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-700 shadow-lg">
                        <Sparkles size={14} className="animate-spin" />
                        <span>Tracing paths...</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3 text-slate-300">
                    <ImageIcon size={24} />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-200 mb-1">No Image Loaded</h4>
                  <p className="text-xs text-slate-400 max-w-xs mb-4">
                    Upload an image or place a reference image on the canvas to vectorize it into real paths.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                  >
                    <Upload size={14} />
                    <span>Upload Image to Trace</span>
                  </button>
                </div>
              )}
            </div>

            {/* Real-time Processing Stats Bar */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-2.5 flex items-center justify-between text-xs text-slate-600">
              <div className="flex items-center gap-4">
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Paths</span>
                  <span className="font-bold text-slate-800 font-mono">{stats.paths}</span>
                </div>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Vertices</span>
                  <span className="font-bold text-blue-600 font-mono">{stats.vertices}</span>
                </div>
                <div className="h-6 w-px bg-slate-200" />
                <div>
                  <span className="text-slate-400 block text-[10px] font-semibold uppercase">Speed</span>
                  <span className="font-bold text-emerald-600 font-mono">{stats.timeMs}ms</span>
                </div>
              </div>

              {imageSource && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                >
                  <Upload size={12} />
                  <span>Change Image</span>
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />
          </div>

          {/* Right Column: Controls, Sliders & Presets */}
          <div className="md:col-span-5 flex flex-col gap-4">
            
            {/* Quick Presets */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Quick Presets
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => applyPreset('logo')}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Zap size={12} className="text-amber-500" />
                  <span>Logo / Graphic</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('lineart')}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Scissors size={12} className="text-blue-500" />
                  <span>Line Art / Cut</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('silhouette')}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Layers size={12} className="text-indigo-500" />
                  <span>Silhouette</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('smooth')}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Sparkles size={12} className="text-purple-500" />
                  <span>High Smooth</span>
                </button>
              </div>
            </div>

            {/* Threshold Slider */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Brightness Threshold</span>
                <span className="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {threshold} / 255
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="245"
                step="1"
                value={threshold}
                onChange={(e) => setThreshold(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Darker (Less)</span>
                <span>Lighter (More)</span>
              </div>
            </div>

            {/* Smoothing & Chaikin B-Spline Epsilon */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Smoothness / Fidelity (ε)</span>
                <span className="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                  {smoothEpsilon.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2.5"
                step="0.05"
                value={smoothEpsilon}
                onChange={(e) => setSmoothEpsilon(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>Sharp Details (0.0)</span>
                <span>Curved B-Splines (2.5)</span>
              </div>
            </div>

            {/* Noise / Dust Speck Filter */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-semibold text-slate-700">Dust & Speck Filter</span>
                <span className="font-mono font-bold text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                  min {minPathLength} pts
                </span>
              </div>
              <input
                type="range"
                min="2"
                max="24"
                step="1"
                value={minPathLength}
                onChange={(e) => setMinPathLength(parseInt(e.target.value))}
                className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-[10px] text-slate-400">
                Filters out small background artifacts and noise dots smaller than this length.
              </p>
            </div>

            {/* Output Presentation Mode */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                Vector Render Mode
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRenderMode('fills')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer ${
                    renderMode === 'fills'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Solid Fills
                </button>
                <button
                  type="button"
                  onClick={() => setRenderMode('strokes')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer ${
                    renderMode === 'strokes'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Cut Strokes
                </button>
                <button
                  type="button"
                  onClick={() => setRenderMode('both')}
                  className={`py-1.5 px-2 rounded-lg border text-center transition cursor-pointer ${
                    renderMode === 'both'
                      ? 'bg-blue-600 text-white border-blue-700 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Both
                </button>
              </div>
            </div>

            {/* Invert Polarity Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div>
                <div className="text-xs font-semibold text-slate-700">Invert Polarity</div>
                <div className="text-[10px] text-slate-400">Trace white shapes on dark background</div>
              </div>
              <button
                type="button"
                onClick={() => setInvert(v => !v)}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                  invert ? 'bg-blue-600 justify-end' : 'bg-slate-300 justify-start'
                }`}
              >
                <div className="w-4 h-4 rounded-full bg-white shadow-md" />
              </button>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              {renderMode !== 'strokes' && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Fill Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fillColor}
                      onChange={(e) => setFillColor(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <span className="text-[11px] font-mono text-slate-600">{fillColor}</span>
                  </div>
                </div>
              )}
              {renderMode !== 'fills' && (
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Stroke Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={strokeColor}
                      onChange={(e) => setStrokeColor(e.target.value)}
                      className="w-7 h-7 rounded border border-slate-200 cursor-pointer p-0"
                    />
                    <span className="text-[11px] font-mono text-slate-600">{strokeColor}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Hide reference option */}
            {currentImage && (
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hideReferenceAfterTrace}
                  onChange={(e) => setHideReferenceAfterTrace(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Hide reference image after vectorizing</span>
              </label>
            )}

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {imageFileName ? (
              <span className="truncate max-w-xs inline-block">
                Source: <strong className="text-slate-700">{imageFileName}</strong>
              </span>
            ) : (
              <span>Select or upload an image to begin</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={tracedElements.length === 0 || isProcessing}
              onClick={handleApply}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-semibold transition shadow-sm cursor-pointer ${
                tracedElements.length === 0 || isProcessing
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white active:scale-98'
              }`}
            >
              <Check size={14} />
              <span>Trace & Add to Canvas ({tracedElements.length} paths)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
