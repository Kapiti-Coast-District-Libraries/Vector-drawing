import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Move, Maximize, RotateCw } from 'lucide-react';
import { UnitType, pxToUnit, unitToPx, TransformOrigin } from '../utils/units';
import { PathElement } from '../types';
import { getCombinedBoundingBox } from '../utils/mirror-utils';

interface TransformPanelProps {
  selectedElements: PathElement[];
  unit: UnitType;
  onUnitChange: (unit: UnitType) => void;
  onUpdateDimensions: (params: {
    newWidth?: number;
    newHeight?: number;
    newX?: number;
    newY?: number;
    origin: TransformOrigin;
    lockAspectRatio: boolean;
  }) => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
  artboardWidth: number;
  artboardHeight: number;
  onUpdateArtboard?: (w: number, h: number) => void;
  showRulers: boolean;
  onToggleRulers: () => void;
}

export const TransformPanel: React.FC<TransformPanelProps> = ({
  selectedElements,
  unit,
  onUnitChange,
  onUpdateDimensions,
  onFlipHorizontal,
  onFlipVertical,
  artboardWidth,
  artboardHeight,
  showRulers,
  onToggleRulers,
}) => {
  const [lockAspect, setLockAspect] = useState<boolean>(true);
  const [origin, setOrigin] = useState<TransformOrigin>('top-left');

  // Local text input states so typing is smooth and does not jump mid-keystroke
  const [inputW, setInputW] = useState<string>('');
  const [inputH, setInputH] = useState<string>('');
  const [inputX, setInputX] = useState<string>('');
  const [inputY, setInputY] = useState<string>('');

  const hasSelection = selectedElements.length > 0;
  const box = hasSelection ? getCombinedBoundingBox(selectedElements) : null;

  // Sync inputs with current element bounding box whenever selection or box changes
  useEffect(() => {
    if (box) {
      const wVal = pxToUnit(box.width, unit);
      const hVal = pxToUnit(box.height, unit);
      const xVal = pxToUnit(box.minX, unit);
      const yVal = pxToUnit(box.minY, unit);

      setInputW(Number(wVal.toFixed(2)).toString());
      setInputH(Number(hVal.toFixed(2)).toString());
      setInputX(Number(xVal.toFixed(2)).toString());
      setInputY(Number(yVal.toFixed(2)).toString());
    } else {
      setInputW('');
      setInputH('');
      setInputX('');
      setInputY('');
    }
  }, [box?.minX, box?.minY, box?.width, box?.height, unit, hasSelection]);

  // Apply dimension changes
  const handleApplyWidth = () => {
    const parsed = parseFloat(inputW);
    if (!isNaN(parsed) && parsed > 0 && box) {
      const newWidthPx = unitToPx(parsed, unit);
      onUpdateDimensions({
        newWidth: newWidthPx,
        origin,
        lockAspectRatio: lockAspect,
      });
    }
  };

  const handleApplyHeight = () => {
    const parsed = parseFloat(inputH);
    if (!isNaN(parsed) && parsed > 0 && box) {
      const newHeightPx = unitToPx(parsed, unit);
      onUpdateDimensions({
        newHeight: newHeightPx,
        origin,
        lockAspectRatio: lockAspect,
      });
    }
  };

  const handleApplyX = () => {
    const parsed = parseFloat(inputX);
    if (!isNaN(parsed) && box) {
      const newXPx = unitToPx(parsed, unit);
      onUpdateDimensions({
        newX: newXPx,
        origin,
        lockAspectRatio: false,
      });
    }
  };

  const handleApplyY = () => {
    const parsed = parseFloat(inputY);
    if (!isNaN(parsed) && box) {
      const newYPx = unitToPx(parsed, unit);
      onUpdateDimensions({
        newY: newYPx,
        origin,
        lockAspectRatio: false,
      });
    }
  };

  // Quick scale multiplier (e.g. +10%, -10%, +25%, -25%)
  const handleQuickScale = (multiplier: number) => {
    if (!box || box.width <= 0 || box.height <= 0) return;
    const newWidthPx = box.width * multiplier;
    const newHeightPx = box.height * multiplier;
    onUpdateDimensions({
      newWidth: newWidthPx,
      newHeight: newHeightPx,
      origin,
      lockAspectRatio: lockAspect,
    });
  };

  return (
    <div className="p-4 border-b border-slate-200/80 bg-white">
      {/* Header with Unit Selector */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5">
          <Maximize size={14} className="text-blue-600" />
          <h3 className="text-xs font-bold uppercase text-slate-700 tracking-wider">
            {hasSelection ? 'Transform & Size' : 'Canvas & Measurements'}
          </h3>
        </div>

        {/* Unit Selector Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
          {(['mm', 'cm', 'in', 'px'] as UnitType[]).map(u => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase transition cursor-pointer ${
                unit === u
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title={`Switch measurement unit to ${u.toUpperCase()}`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {hasSelection && box ? (
        <div className="space-y-3">
          {/* Width and Height Inputs with Aspect Ratio Lock */}
          <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200/70 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                Dimensions ({unit})
              </span>
              <span className="text-[10px] text-blue-600 font-normal">
                {selectedElements.length} {selectedElements.length === 1 ? 'shape' : 'shapes'} selected
              </span>
            </div>

            <div className="flex items-center gap-2">
              {/* Width Input */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">WIDTH (W)</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step={unit === 'mm' ? '1' : '0.1'}
                    min="0.1"
                    value={inputW}
                    onChange={(e) => setInputW(e.target.value)}
                    onBlur={handleApplyWidth}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyWidth();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full pl-2 pr-7 py-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
                  />
                  <span className="absolute right-2 text-[10px] font-mono text-slate-400 pointer-events-none uppercase">
                    {unit}
                  </span>
                </div>
              </div>

              {/* Aspect Ratio Lock Toggle */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={() => setLockAspect(prev => !prev)}
                  className={`p-1.5 rounded-lg border transition cursor-pointer ${
                    lockAspect
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-2xs'
                      : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                  }`}
                  title={lockAspect ? 'Constrain Proportions: LOCKED (Proportional scaling)' : 'Constrain Proportions: UNLOCKED (Independent scaling)'}
                >
                  {lockAspect ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
              </div>

              {/* Height Input */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">HEIGHT (H)</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step={unit === 'mm' ? '1' : '0.1'}
                    min="0.1"
                    value={inputH}
                    onChange={(e) => setInputH(e.target.value)}
                    onBlur={handleApplyHeight}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyHeight();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full pl-2 pr-7 py-1 text-xs font-mono font-bold text-slate-800 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition shadow-2xs"
                  />
                  <span className="absolute right-2 text-[10px] font-mono text-slate-400 pointer-events-none uppercase">
                    {unit}
                  </span>
                </div>
              </div>
            </div>

            {/* X and Y Position Inputs */}
            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/50">
              {/* X Coordinate */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">POSITION X</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    value={inputX}
                    onChange={(e) => setInputX(e.target.value)}
                    onBlur={handleApplyX}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyX();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full pl-2 pr-7 py-1 text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition shadow-2xs"
                  />
                  <span className="absolute right-2 text-[10px] font-mono text-slate-400 pointer-events-none uppercase">
                    {unit}
                  </span>
                </div>
              </div>

              {/* Y Coordinate */}
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 mb-0.5">POSITION Y</label>
                <div className="relative flex items-center">
                  <input
                    type="number"
                    step="1"
                    value={inputY}
                    onChange={(e) => setInputY(e.target.value)}
                    onBlur={handleApplyY}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleApplyY();
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    className="w-full pl-2 pr-7 py-1 text-xs font-mono font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-500 transition shadow-2xs"
                  />
                  <span className="absolute right-2 text-[10px] font-mono text-slate-400 pointer-events-none uppercase">
                    {unit}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Reference Origin Point (Scale Anchor) */}
          <div className="flex items-center justify-between bg-slate-50/50 p-2 rounded-lg border border-slate-100">
            <span className="text-[11px] font-semibold text-slate-600">Scale Origin Anchor</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOrigin('top-left')}
                className={`px-2 py-1 text-[10px] rounded font-semibold transition cursor-pointer border ${
                  origin === 'top-left'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Scale from Top-Left corner"
              >
                Top-Left ↖
              </button>
              <button
                type="button"
                onClick={() => setOrigin('center')}
                className={`px-2 py-1 text-[10px] rounded font-semibold transition cursor-pointer border ${
                  origin === 'center'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
                title="Scale from Center"
              >
                Center ⊙
              </button>
            </div>
          </div>

          {/* Quick Resizing Scale Presets */}
          <div className="grid grid-cols-4 gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => handleQuickScale(0.9)}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700 transition cursor-pointer shadow-2xs text-center"
              title="Scale down by 10%"
            >
              -10%
            </button>
            <button
              type="button"
              onClick={() => handleQuickScale(1.1)}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700 transition cursor-pointer shadow-2xs text-center"
              title="Scale up by 10%"
            >
              +10%
            </button>
            <button
              type="button"
              onClick={() => handleQuickScale(0.75)}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700 transition cursor-pointer shadow-2xs text-center"
              title="Scale down by 25%"
            >
              -25%
            </button>
            <button
              type="button"
              onClick={() => handleQuickScale(1.25)}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700 transition cursor-pointer shadow-2xs text-center"
              title="Scale up by 25%"
            >
              +25%
            </button>
          </div>

          {/* Flip Buttons */}
          {(onFlipHorizontal || onFlipVertical) && (
            <div className="flex gap-2 pt-1">
              {onFlipHorizontal && (
                <button
                  type="button"
                  onClick={onFlipHorizontal}
                  className="flex-1 py-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold text-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  title="Flip shape horizontally across center axis"
                >
                  <span className="font-bold text-blue-600">↔</span> Flip H
                </button>
              )}
              {onFlipVertical && (
                <button
                  type="button"
                  onClick={onFlipVertical}
                  className="flex-1 py-1 px-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold text-slate-700 transition cursor-pointer flex items-center justify-center gap-1.5"
                  title="Flip shape vertically across center axis"
                >
                  <span className="font-bold text-blue-600">↕</span> Flip V
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty Selection / Canvas Document Settings in mm */
        <div className="space-y-3">
          <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/80 space-y-2">
            <div className="text-[11px] font-semibold text-blue-900 flex items-center justify-between">
              <span>Artboard Sheet</span>
              <span className="text-[10px] font-mono text-blue-600 font-bold uppercase">
                {pxToUnit(artboardWidth, unit).toFixed(0)} × {pxToUnit(artboardHeight, unit).toFixed(0)} {unit}
              </span>
            </div>
            <p className="text-[11px] text-blue-700 leading-relaxed">
              Select any object on the canvas to inspect and change its exact width and height in <span className="font-bold underline">{unit}</span>.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] font-semibold text-slate-600">Precision Rulers</span>
            <button
              type="button"
              onClick={onToggleRulers}
              className={`px-2.5 py-1 rounded text-[11px] font-semibold border transition cursor-pointer ${
                showRulers
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-2xs'
                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {showRulers ? 'Visible (mm)' : 'Hidden'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
