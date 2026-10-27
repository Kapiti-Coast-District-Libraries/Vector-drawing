import React, { useEffect, useRef } from 'react';
import {
  Copy,
  ClipboardPaste,
  Scissors,
  Trash2,
  ChevronsUp,
  ChevronsDown,
  ArrowUp,
  ArrowDown,
  FlipHorizontal,
  FlipVertical,
  Lock,
  Unlock,
  Type,
  Sparkles,
  Shapes,
  Code,
  Check,
  Ruler,
  Grid,
  Maximize2,
  Layers,
  MousePointerClick,
  Wand2
} from 'lucide-react';
import { PathElement, Point } from '../types';

export interface ContextMenuProps {
  x: number;
  y: number;
  canvasCoords: Point;
  targetElement: PathElement | null;
  selectedElements: PathElement[];
  hasClipboardContent: boolean;
  onClose: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onPasteAtPos: (pos: Point) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onToggleLock: () => void;
  onCreateOutlines?: () => void;
  onExpandAppearance?: () => void;
  onPathfinder?: (op: 'union' | 'subtract' | 'intersect' | 'exclude') => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleRulers: () => void;
  onToggleGrid: () => void;
  onResetZoom: () => void;
  onCopySvgCode?: () => void;
  showRulers: boolean;
  showGrid: boolean;
  isDirectSelectMode?: boolean;
  selectedNodesCount?: number;
  selectedSegment?: boolean;
  onOpenImageTrace?: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  canvasCoords,
  targetElement,
  selectedElements,
  hasClipboardContent,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onPasteAtPos,
  onDuplicate,
  onDelete,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onFlipHorizontal,
  onFlipVertical,
  onToggleLock,
  onCreateOutlines,
  onExpandAppearance,
  onPathfinder,
  onSelectAll,
  onDeselectAll,
  onToggleRulers,
  onToggleGrid,
  onResetZoom,
  onCopySvgCode,
  showRulers,
  showGrid,
  isDirectSelectMode,
  selectedNodesCount = 0,
  selectedSegment = false,
  onOpenImageTrace,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or escape key
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const hasSelection = selectedElements.length > 0;
  const isMultiSelection = selectedElements.length > 1;
  const isTargetLocked = targetElement?.locked ?? (hasSelection && selectedElements.every(el => el.locked));
  const hasTextSelected = selectedElements.some(el => el.type === 'text') || targetElement?.type === 'text';
  const hasBrushedOrStroked = selectedElements.some(el => el.brushId || (el.strokeWidth && el.strokeWidth > 0));

  // Viewport clamping so the menu never overflows off screen edges
  const menuWidth = 250;
  const menuHeight = hasSelection ? 430 : 280;
  const adjustedX = Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12));
  const adjustedY = Math.max(12, Math.min(y, window.innerHeight - menuHeight - 12));

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Context Menu"
      style={{
        left: `${adjustedX}px`,
        top: `${adjustedY}px`,
      }}
      className="fixed z-50 w-[248px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl border border-slate-200/90 text-slate-700 text-xs py-1.5 select-none animate-in fade-in zoom-in-95 duration-100 font-sans divide-y divide-slate-100"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. Header with contextual badge */}
      <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-semibold text-slate-500 bg-slate-50/60 rounded-t-xl">
        <div className="flex items-center gap-1.5 truncate">
          {hasSelection ? (
            <>
              <Layers size={13} className="text-blue-600 shrink-0" />
              <span className="font-bold text-slate-800 truncate">
                {isMultiSelection
                  ? `${selectedElements.length} Shapes Selected`
                  : targetElement?.name || 'Selected Shape'}
              </span>
            </>
          ) : (
            <>
              <MousePointerClick size={13} className="text-slate-400 shrink-0" />
              <span>Canvas Workspace</span>
            </>
          )}
        </div>
        {hasSelection && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold shrink-0">
            {hasTextSelected ? 'TEXT' : isMultiSelection ? 'MULTI' : 'PATH'}
          </span>
        )}
      </div>

      {/* 2. Clipboard & Primary Operations */}
      <div className="py-1">
        {/* Paste Here (prominent when clipboard content exists) */}
        {hasClipboardContent && (
          <button
            type="button"
            onClick={() => {
              onPasteAtPos(canvasCoords);
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-blue-50 text-blue-700 font-semibold cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-2">
              <ClipboardPaste size={14} className="text-blue-600 group-hover:scale-110 transition-transform" />
              <span>Paste Here</span>
            </div>
            <span className="text-[10px] font-mono text-blue-500 bg-blue-100/70 px-1 py-0.5 rounded">
              At cursor
            </span>
          </button>
        )}

        {/* Standard Paste */}
        <button
          type="button"
          disabled={!hasClipboardContent}
          onClick={() => {
            onPaste();
            onClose();
          }}
          className={`w-full px-3 py-1.5 flex items-center justify-between transition-colors ${
            hasClipboardContent
              ? 'hover:bg-slate-100 text-slate-700 cursor-pointer'
              : 'text-slate-300 cursor-not-allowed'
          }`}
        >
          <div className="flex items-center gap-2">
            <ClipboardPaste size={14} className={hasClipboardContent ? 'text-slate-600' : 'text-slate-300'} />
            <span>Paste</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Ctrl+V</span>
        </button>

        {/* Copy (only if selection) */}
        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onCopy();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Copy size={14} className="text-slate-600" />
              <span>Copy</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+C</span>
          </button>
        )}

        {/* Cut (only if selection) */}
        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onCut();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Scissors size={14} className="text-slate-600" />
              <span>Cut</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+X</span>
          </button>
        )}

        {/* Duplicate */}
        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onDuplicate();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Layers size={14} className="text-slate-600" />
              <span>Duplicate</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+D</span>
          </button>
        )}

        {/* Delete */}
        {(hasSelection || selectedNodesCount > 0 || selectedSegment) && (
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-red-50 text-red-600 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <Trash2 size={14} className="text-red-500" />
              <span className="font-medium">
                {selectedSegment
                  ? 'Delete Path Section'
                  : isDirectSelectMode && selectedNodesCount > 1
                  ? `Delete Section (${selectedNodesCount} nodes)`
                  : isDirectSelectMode && selectedNodesCount === 1
                  ? 'Delete Node / Section'
                  : 'Delete'}
              </span>
            </div>
            <span className="text-[10px] font-mono text-red-400">Del / ⌫</span>
          </button>
        )}
      </div>

      {/* 3. Stacking Order (Arrange: Bring to Front, Send to Back, etc.) */}
      {hasSelection && (
        <div className="py-1">
          <div className="px-3 py-1 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
            Arrange / Layer Order
          </div>
          <div className="grid grid-cols-4 gap-1 px-2 py-0.5">
            <button
              type="button"
              onClick={() => {
                onBringToFront();
                onClose();
              }}
              className="p-1.5 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 border border-transparent hover:border-slate-200 transition cursor-pointer"
              title="Bring to Front (Ctrl+Shift+])"
            >
              <ChevronsUp size={14} className="text-blue-600 mb-0.5" />
              <span className="text-[9px] font-medium leading-none">To Front</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onBringForward();
                onClose();
              }}
              className="p-1.5 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 border border-transparent hover:border-slate-200 transition cursor-pointer"
              title="Bring Forward (Ctrl+])"
            >
              <ArrowUp size={14} className="text-slate-600 mb-0.5" />
              <span className="text-[9px] font-medium leading-none">Forward</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSendBackward();
                onClose();
              }}
              className="p-1.5 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 border border-transparent hover:border-slate-200 transition cursor-pointer"
              title="Send Backward (Ctrl+[)"
            >
              <ArrowDown size={14} className="text-slate-600 mb-0.5" />
              <span className="text-[9px] font-medium leading-none">Backward</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onSendToBack();
                onClose();
              }}
              className="p-1.5 flex flex-col items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700 border border-transparent hover:border-slate-200 transition cursor-pointer"
              title="Send to Back (Ctrl+Shift+[)"
            >
              <ChevronsDown size={14} className="text-blue-600 mb-0.5" />
              <span className="text-[9px] font-medium leading-none">To Back</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. Transform & Orientation (Flip Horizontal & Vertical) */}
      {hasSelection && (
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              onFlipHorizontal();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <FlipHorizontal size={14} className="text-slate-600" />
              <span>Flip Horizontal</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">↔</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onFlipVertical();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              <FlipVertical size={14} className="text-slate-600" />
              <span>Flip Vertical</span>
            </div>
            <span className="text-[10px] font-bold text-slate-400">↕</span>
          </button>
        </div>
      )}

      {/* 5. Vector Outlines & Expansion */}
      {hasSelection && (hasTextSelected || hasBrushedOrStroked) && (
        <div className="py-1">
          {hasTextSelected && onCreateOutlines && (
            <button
              type="button"
              onClick={() => {
                onCreateOutlines();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-indigo-50 text-indigo-700 font-medium cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Type size={14} className="text-indigo-600" />
                <span>Create Outlines</span>
              </div>
              <span className="text-[10px] font-mono text-indigo-500">Ctrl+Shift+O</span>
            </button>
          )}

          {hasBrushedOrStroked && onExpandAppearance && (
            <button
              type="button"
              onClick={() => {
                onExpandAppearance();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-purple-50 text-purple-700 font-medium cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-purple-600" />
                <span>Expand Appearance</span>
              </div>
              <span className="text-[10px] font-mono text-purple-500">Ctrl+E</span>
            </button>
          )}
        </div>
      )}

      {/* 6. Pathfinder Operations (when 2+ shapes selected) */}
      {isMultiSelection && onPathfinder && (
        <div className="py-1">
          <div className="px-3 py-1 text-[10px] font-bold uppercase text-slate-400 tracking-wider">
            Pathfinder Boolean
          </div>
          <div className="grid grid-cols-2 gap-1 px-2 py-0.5">
            <button
              type="button"
              onClick={() => {
                onPathfinder('union');
                onClose();
              }}
              className="px-2 py-1 text-left rounded-md hover:bg-blue-50 text-blue-700 font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition"
            >
              <Shapes size={12} className="text-blue-600 shrink-0" />
              <span>Unite / Weld</span>
            </button>
            <button
              type="button"
              onClick={() => {
                onPathfinder('subtract');
                onClose();
              }}
              className="px-2 py-1 text-left rounded-md hover:bg-slate-100 text-slate-700 font-medium text-[11px] flex items-center gap-1.5 cursor-pointer transition"
            >
              <span className="font-bold text-red-500 shrink-0 text-xs">−</span>
              <span>Minus Front</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Lock / Unlock & Copy SVG */}
      {hasSelection && (
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              onToggleLock();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2">
              {isTargetLocked ? <Unlock size={14} className="text-amber-600" /> : <Lock size={14} className="text-slate-600" />}
              <span>{isTargetLocked ? 'Unlock Shape' : 'Lock Shape'}</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Ctrl+L</span>
          </button>

          {onCopySvgCode && (
            <button
              type="button"
              onClick={() => {
                onCopySvgCode();
                onClose();
              }}
              className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-2">
                <Code size={14} className="text-emerald-600" />
                <span>Copy as SVG Code</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">
                Code
              </span>
            </button>
          )}
        </div>
      )}

      {/* 8. Tools & Trace */}
      {onOpenImageTrace && (
        <div className="py-1">
          <button
            type="button"
            onClick={() => {
              onOpenImageTrace();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-purple-50 text-purple-700 cursor-pointer transition-colors group"
          >
            <div className="flex items-center gap-2">
              <Wand2 size={14} className="text-purple-600 group-hover:scale-110 transition-transform" />
              <span className="font-medium">Image Trace (Vectorize)...</span>
            </div>
            <span className="text-[10px] font-mono text-purple-600 bg-purple-100/70 px-1.5 py-0.5 rounded font-semibold">
              Trace
            </span>
          </button>
        </div>
      )}

      {/* 9. Workspace / Canvas Options */}
      <div className="py-1">
        <button
          type="button"
          onClick={() => {
            onSelectAll();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
        >
          <span>Select All</span>
          <span className="text-[10px] font-mono text-slate-400">Ctrl+A</span>
        </button>

        {hasSelection && (
          <button
            type="button"
            onClick={() => {
              onDeselectAll();
              onClose();
            }}
            className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
          >
            <span>Deselect All</span>
            <span className="text-[10px] font-mono text-slate-400">Esc</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            onToggleRulers();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2">
            <Ruler size={14} className="text-slate-500" />
            <span>Rulers ({showRulers ? 'Hide' : 'Show'})</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Ctrl+R</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onToggleGrid();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2">
            <Grid size={14} className="text-slate-500" />
            <span>Grid ({showGrid ? 'Hide' : 'Show'})</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Ctrl+'</span>
        </button>

        <button
          type="button"
          onClick={() => {
            onResetZoom();
            onClose();
          }}
          className="w-full px-3 py-1.5 flex items-center justify-between hover:bg-slate-100 text-slate-700 cursor-pointer transition-colors"
        >
          <div className="flex items-center gap-2">
            <Maximize2 size={14} className="text-slate-500" />
            <span>Fit Artboard / 100%</span>
          </div>
          <span className="text-[10px] font-mono text-slate-400">Ctrl+0</span>
        </button>
      </div>
    </div>
  );
};
