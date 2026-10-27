import React, { useMemo } from 'react';
import { UnitType, pxToUnit, unitToPx } from '../utils/units';

interface CanvasRulersProps {
  width: number;
  height: number;
  zoom: number;
  panOffset: { x: number; y: number };
  unit: UnitType;
  onUnitChange: (unit: UnitType) => void;
  mousePos: { x: number; y: number } | null;
  selectedBox: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number } | null;
  visible?: boolean;
}

const RULER_THICKNESS = 22; // px

export const CanvasRulers: React.FC<CanvasRulersProps> = ({
  width,
  height,
  zoom,
  panOffset,
  unit,
  onUnitChange,
  mousePos,
  selectedBox,
  visible = true,
}) => {
  const [isUnitMenuOpen, setIsUnitMenuOpen] = React.useState(false);

  // Compute adaptive step interval in current unit based on zoom
  const { majorStep, subStep } = useMemo(() => {
    // Target ~40-80px per major mark
    const targetPx = 60;
    const targetUnit = pxToUnit(targetPx / zoom, unit);

    let major = 10;
    if (unit === 'mm') {
      if (targetUnit <= 2) major = 2;
      else if (targetUnit <= 5) major = 5;
      else if (targetUnit <= 10) major = 10;
      else if (targetUnit <= 25) major = 25;
      else if (targetUnit <= 50) major = 50;
      else if (targetUnit <= 100) major = 100;
      else major = 250;
    } else if (unit === 'cm') {
      if (targetUnit <= 0.5) major = 0.5;
      else if (targetUnit <= 1) major = 1;
      else if (targetUnit <= 2) major = 2;
      else if (targetUnit <= 5) major = 5;
      else if (targetUnit <= 10) major = 10;
      else major = 20;
    } else if (unit === 'in') {
      if (targetUnit <= 0.25) major = 0.25;
      else if (targetUnit <= 0.5) major = 0.5;
      else if (targetUnit <= 1) major = 1;
      else if (targetUnit <= 2) major = 2;
      else if (targetUnit <= 4) major = 4;
      else major = 10;
    } else {
      // px
      if (targetUnit <= 20) major = 20;
      else if (targetUnit <= 50) major = 50;
      else if (targetUnit <= 100) major = 100;
      else if (targetUnit <= 200) major = 200;
      else major = 500;
    }

    const sub = major / 5;
    return { majorStep: major, subStep: sub };
  }, [unit, zoom]);

  // Horizontal Ruler Marks
  const horizontalTicks = useMemo(() => {
    const ticks: { pos: number; label?: string; isMajor: boolean }[] = [];
    if (width <= 0) return ticks;

    const startCanvasX = (RULER_THICKNESS - panOffset.x) / zoom;
    const endCanvasX = (width - panOffset.x) / zoom;

    const startUnitVal = pxToUnit(startCanvasX, unit);
    const endUnitVal = pxToUnit(endCanvasX, unit);

    const minU = Math.min(startUnitVal, endUnitVal);
    const maxU = Math.max(startUnitVal, endUnitVal);

    const firstTick = Math.floor(minU / subStep) * subStep;

    for (let u = firstTick; u <= maxU + majorStep; u += subStep) {
      const pxCoord = unitToPx(u, unit);
      const screenX = pxCoord * zoom + panOffset.x;

      if (screenX >= RULER_THICKNESS && screenX <= width) {
        // Check if it's close to a major tick
        const distToMajor = Math.abs(u / majorStep - Math.round(u / majorStep));
        const isMajor = distToMajor < 0.001;

        ticks.push({
          pos: screenX,
          isMajor,
          label: isMajor ? `${Math.round(u * 10) / 10}` : undefined,
        });
      }
    }
    return ticks;
  }, [width, zoom, panOffset.x, unit, majorStep, subStep]);

  // Vertical Ruler Marks
  const verticalTicks = useMemo(() => {
    const ticks: { pos: number; label?: string; isMajor: boolean }[] = [];
    if (height <= 0) return ticks;

    const startCanvasY = (RULER_THICKNESS - panOffset.y) / zoom;
    const endCanvasY = (height - panOffset.y) / zoom;

    const startUnitVal = pxToUnit(startCanvasY, unit);
    const endUnitVal = pxToUnit(endCanvasY, unit);

    const minU = Math.min(startUnitVal, endUnitVal);
    const maxU = Math.max(startUnitVal, endUnitVal);

    const firstTick = Math.floor(minU / subStep) * subStep;

    for (let u = firstTick; u <= maxU + majorStep; u += subStep) {
      const pxCoord = unitToPx(u, unit);
      const screenY = pxCoord * zoom + panOffset.y;

      if (screenY >= RULER_THICKNESS && screenY <= height) {
        const distToMajor = Math.abs(u / majorStep - Math.round(u / majorStep));
        const isMajor = distToMajor < 0.001;

        ticks.push({
          pos: screenY,
          isMajor,
          label: isMajor ? `${Math.round(u * 10) / 10}` : undefined,
        });
      }
    }
    return ticks;
  }, [height, zoom, panOffset.y, unit, majorStep, subStep]);

  // Selection projection coordinates on rulers
  const selX1 = selectedBox ? selectedBox.minX * zoom + panOffset.x : null;
  const selX2 = selectedBox ? selectedBox.maxX * zoom + panOffset.x : null;
  const selY1 = selectedBox ? selectedBox.minY * zoom + panOffset.y : null;
  const selY2 = selectedBox ? selectedBox.maxY * zoom + panOffset.y : null;

  if (!visible) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 select-none overflow-hidden font-mono text-[9px]">
      {/* Top Ruler (Horizontal) */}
      <div
        className="absolute top-0 left-[22px] right-0 h-[22px] bg-slate-100/95 backdrop-blur-xs border-b border-slate-300 pointer-events-auto"
        style={{ left: `${RULER_THICKNESS}px` }}
      >
        <svg width="100%" height={RULER_THICKNESS} className="overflow-visible">
          {/* Selected Object Span Highlight */}
          {selX1 !== null && selX2 !== null && (
            <rect
              x={Math.max(0, selX1 - RULER_THICKNESS)}
              y={0}
              width={Math.max(2, selX2 - selX1)}
              height={RULER_THICKNESS}
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          )}

          {/* Ruler Ticks and Labels */}
          {horizontalTicks.map((t, idx) => {
            const relX = t.pos - RULER_THICKNESS;
            return (
              <g key={idx} transform={`translate(${relX}, 0)`}>
                <line
                  x1={0}
                  y1={t.isMajor ? 8 : 15}
                  x2={0}
                  y2={RULER_THICKNESS}
                  stroke={t.isMajor ? '#475569' : '#94a3b8'}
                  strokeWidth={t.isMajor ? 1 : 0.75}
                />
                {t.isMajor && t.label !== undefined && (
                  <text
                    x={2}
                    y={10}
                    fill="#334155"
                    fontSize="9px"
                    fontFamily="monospace"
                    textAnchor="start"
                  >
                    {t.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Mouse tracking hairline */}
          {mousePos && mousePos.x >= RULER_THICKNESS && (
            <line
              x1={mousePos.x - RULER_THICKNESS}
              y1={0}
              x2={mousePos.x - RULER_THICKNESS}
              y2={RULER_THICKNESS}
              stroke="#ef4444"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {/* Left Ruler (Vertical) */}
      <div
        className="absolute top-[22px] left-0 bottom-0 w-[22px] bg-slate-100/95 backdrop-blur-xs border-r border-slate-300 pointer-events-auto"
        style={{ top: `${RULER_THICKNESS}px` }}
      >
        <svg width={RULER_THICKNESS} height="100%" className="overflow-visible">
          {/* Selected Object Span Highlight */}
          {selY1 !== null && selY2 !== null && (
            <rect
              x={0}
              y={Math.max(0, selY1 - RULER_THICKNESS)}
              width={RULER_THICKNESS}
              height={Math.max(2, selY2 - selY1)}
              fill="#3b82f6"
              fillOpacity={0.2}
            />
          )}

          {/* Ruler Ticks and Labels */}
          {verticalTicks.map((t, idx) => {
            const relY = t.pos - RULER_THICKNESS;
            return (
              <g key={idx} transform={`translate(0, ${relY})`}>
                <line
                  x1={t.isMajor ? 8 : 15}
                  y1={0}
                  x2={RULER_THICKNESS}
                  y2={0}
                  stroke={t.isMajor ? '#475569' : '#94a3b8'}
                  strokeWidth={t.isMajor ? 1 : 0.75}
                />
                {t.isMajor && t.label !== undefined && (
                  <text
                    x={2}
                    y={-2}
                    fill="#334155"
                    fontSize="8.5px"
                    fontFamily="monospace"
                    textAnchor="start"
                    transform="rotate(-90, 2, -2)"
                  >
                    {t.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Mouse tracking hairline */}
          {mousePos && mousePos.y >= RULER_THICKNESS && (
            <line
              x1={0}
              y1={mousePos.y - RULER_THICKNESS}
              x2={RULER_THICKNESS}
              y2={mousePos.y - RULER_THICKNESS}
              stroke="#ef4444"
              strokeWidth={1}
            />
          )}
        </svg>
      </div>

      {/* Top-Left Corner Box with Unit Switcher */}
      <div
        className="absolute top-0 left-0 w-[22px] h-[22px] bg-slate-200 border-r border-b border-slate-300 flex items-center justify-center pointer-events-auto cursor-pointer hover:bg-blue-50 transition z-30"
        onClick={() => setIsUnitMenuOpen(prev => !prev)}
        title={`Current Unit: ${unit.toUpperCase()} (Click to change)`}
      >
        <span className="text-[9px] font-bold text-slate-700 tracking-tighter">
          {unit}
        </span>
      </div>

      {/* Unit Selection Dropdown Popup */}
      {isUnitMenuOpen && (
        <div className="absolute top-[24px] left-[24px] bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50 pointer-events-auto w-32 animate-in fade-in duration-150">
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase text-slate-400 border-b border-slate-100">
            Ruler Unit
          </div>
          {(['mm', 'cm', 'in', 'px'] as UnitType[]).map(u => (
            <button
              key={u}
              type="button"
              onClick={() => {
                onUnitChange(u);
                setIsUnitMenuOpen(false);
              }}
              className={`w-full text-left px-2.5 py-1 text-xs flex items-center justify-between cursor-pointer transition ${
                unit === u ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <span className="uppercase">{u}</span>
              <span className="text-[10px] text-slate-400 font-normal">
                {u === 'mm' ? 'Millimeters' : u === 'cm' ? 'Centimeters' : u === 'in' ? 'Inches' : 'Pixels'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
