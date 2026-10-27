import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Pointer,
  PenTool,
  Square,
  Circle,
  Triangle,
  Trash2,
  Download,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Plus,
  Minus,
  Compass,
  Grid,
  Maximize2,
  MousePointerSquareDashed,
  Sliders,
  Image as ImageIcon,
  Check,
  RotateCcw,
  Sparkles,
  FileImage,
  Undo,
  Redo,
  Save,
  FolderOpen,
  Spline,
  Paintbrush,
  Shapes,
  MousePointer,
  Palette,
  Slash,
  Type,
  Ruler,
  Wand2
} from 'lucide-react';
import {
  Point,
  VectorNode,
  PathElement,
  Layer,
  TracingImage,
  ToolType,
  GridConfig,
  SnapConfig,
  NodeType,
  AlignmentGuide,
  BrushDefinition,
  BrushType,
  UnitType
} from './types';
import {
  getPathData,
  performPathfinder,
  snapPoint,
  distance,
  getSegmentCommand,
  snapAngle45,
  splitSegmentAtPoint,
  findNearestSegmentOnElement,
  snapPointOrthogonal,
  snapNodeToRightAngleWithAdjacent,
  snapPathNodesToRightAngles,
  deleteNodesAndBreakSections,
  deleteSegmentFromElement
} from './utils/vector-math';
import {
  getSpiralTemplate,
  getTeardropTemplate,
  getTwinLeafTemplate
} from './utils/starter-templates';
import { exportToDXF } from './utils/dxf-exporter';
import { mirrorElement, getCombinedBoundingBox, getElementBoundingBox } from './utils/mirror-utils';
import { convertStrokeToPath, StrokeToPathOptions, simplifyPoints, pointsToVectorNodes } from './utils/stroke-to-path';
import { DEFAULT_BRUSHES, applyBrushToStroke, createBrushFromSelection } from './utils/brush-engine';
import { BrushModal } from './components/BrushModal';
import { BrushesPanel } from './components/BrushesPanel';
import {
  INITIAL_FONTS,
  FontItem,
  queryLocalComputerFonts,
  loadFontFromFile,
  convertTextToOutlines,
  measureTextBoundingBox,
  isLocalFontAccessSupported
} from './utils/font-manager';
import { TextPropertiesPanel } from './components/TextPropertiesPanel';
import { ComputerFontModal } from './components/ComputerFontModal';
import { ImageTraceModal } from './components/ImageTraceModal';
import { CanvasRulers } from './components/CanvasRulers';
import { TransformPanel } from './components/TransformPanel';
import { ContextMenu } from './components/ContextMenu';
import {
  pxToUnit,
  unitToPx,
  formatUnit,
  resizeElementsToDimensions,
  PX_PER_MM,
  TransformOrigin,
  ARTBOARD_PRESETS
} from './utils/units';

// Professional designer color palette for vector assets
const ART_PALETTE = [
  { name: 'Bright Pink', value: '#ff007f', text: 'text-pink-500' },
  { name: 'Classic Red', value: '#991b1b', text: 'text-red-800' },
  { name: 'Warm Amber', value: '#eab308', text: 'text-yellow-600' },
  { name: 'Deep Teal', value: '#0f766e', text: 'text-teal-700' },
  { name: 'Emerald Green', value: '#15803d', text: 'text-green-700' },
  { name: 'Pure White', value: '#ffffff', text: 'text-neutral-100' },
  { name: 'Slate Gray', value: '#475569', text: 'text-slate-600' },
  { name: 'Waro Black', value: '#111827', text: 'text-neutral-900' },
  { name: 'None (Transparent)', value: 'none', text: 'text-neutral-400' },
];

export const POINTER_COLORS = [
  { id: 'dark', name: 'Dark Slate (Ultra Contrast)', value: '#0f172a', bgClass: 'bg-slate-900', desc: 'Ultra-visible on white' },
  { id: 'blue', name: 'Illustrator Blue', value: '#2563eb', bgClass: 'bg-blue-600', desc: 'Classic vector blue' },
  { id: 'red', name: 'Crimson Red', value: '#e11d48', bgClass: 'bg-rose-600', desc: 'High visibility red' },
  { id: 'emerald', name: 'Emerald Green', value: '#059669', bgClass: 'bg-emerald-600', desc: 'Vibrant green' },
  { id: 'purple', name: 'Electric Purple', value: '#7c3aed', bgClass: 'bg-purple-600', desc: 'Rich violet' },
  { id: 'amber', name: 'Amber Gold', value: '#d97706', bgClass: 'bg-amber-600', desc: 'Warm amber' },
  { id: 'white', name: 'Crisp White', value: '#ffffff', bgClass: 'bg-white', desc: 'White with black rim' },
  { id: 'system', name: 'System Default', value: 'system', bgClass: 'bg-slate-300', desc: 'Native OS cursor' },
];

export const CANVAS_BACKGROUNDS = [
  { id: 'white', name: 'Pure White', value: '#ffffff', bgClass: 'bg-white' },
  { id: 'artboard', name: 'Studio Gray', value: '#f1f5f9', bgClass: 'bg-slate-100' },
  { id: 'warm', name: 'Warm Cream', value: '#fcfbf7', bgClass: 'bg-amber-50/40' },
  { id: 'dark', name: 'Slate Darkroom', value: '#1e293b', bgClass: 'bg-slate-800' },
];

export default function App() {
  // --- Layers & Elements State ---
  const [layers, setLayers] = useState<Layer[]>(() => [
    {
      id: 'layer-1',
      name: 'Art Layer 1',
      elements: [], // Preload empty so the canvas is fresh and clean on load
      visible: true,
      locked: false,
    }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');

  // --- Undo/Redo Stacks & Refs ---
  const undoStack = useRef<Layer[][]>([]);
  const redoStack = useRef<Layer[][]>([]);
  const layersBeforeInteractionRef = useRef<Layer[] | null>(null);

  const pushHistory = (stateToSave: Layer[]) => {
    const clone = JSON.parse(JSON.stringify(stateToSave));
    const lastState = undoStack.current[undoStack.current.length - 1];
    
    // Only push if different from last state
    if (!lastState || JSON.stringify(lastState) !== JSON.stringify(clone)) {
      undoStack.current.push(clone);
      if (undoStack.current.length > 50) {
        undoStack.current.shift();
      }
      redoStack.current = []; // Clear redo stack on new action
    }
  };

  const handleUndo = () => {
    if (undoStack.current.length === 0) return;
    const prevState = undoStack.current.pop()!;
    const currentClone = JSON.parse(JSON.stringify(layers));
    redoStack.current.push(currentClone);
    setLayers(prevState);
  };

  const handleRedo = () => {
    if (redoStack.current.length === 0) return;
    const nextState = redoStack.current.pop()!;
    const currentClone = JSON.parse(JSON.stringify(layers));
    undoStack.current.push(currentClone);
    setLayers(nextState);
  };

  // --- Drawing Tool State ---
  const [tool, setTool] = useState<ToolType>('select');

  // --- Selection States ---
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ elementId: string; nodeId: string } | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<Array<{ elementId: string; nodeId: string }>>([]);
  const [selectedSegment, setSelectedSegment] = useState<{ elementId: string; fromIdx: number; toIdx: number } | null>(null);
  const initialSelectedNodesRef = useRef<Array<{ elementId: string; nodeId: string }>>([]);
  const [selectedHandle, setSelectedHandle] = useState<'anchor' | 'handleIn' | 'handleOut' | null>(null);

  const isNodeSelected = useCallback((elementId: string, nodeId: string) => {
    return selectedNodes.some(n => n.elementId === elementId && n.nodeId === nodeId) ||
      (selectedNodeInfo?.elementId === elementId && selectedNodeInfo?.nodeId === nodeId);
  }, [selectedNodes, selectedNodeInfo]);

  // --- Active Path Drawing State (Pen tool) ---
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [penPreviewPos, setPenPreviewPos] = useState<Point | null>(null);
  const [isDrawingDrag, setIsDrawingDrag] = useState<boolean>(false);

  // --- Canvas Settings & Precision Measurement State ---
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 50, y: 10 });
  const [grid, setGrid] = useState<GridConfig>({ size: Math.round(10 * PX_PER_MM), visible: true, snap: false });
  const [snapToPoints, setSnapToPoints] = useState<boolean>(true);
  const [snapRightAngle, setSnapRightAngle] = useState<boolean>(true); // 90° right angle / orthogonal snapping
  const [snapBadge, setSnapBadge] = useState<{ x: number; y: number; text: string } | null>(null);
  const dragStartNodeAnchorRef = useRef<Point | null>(null);

  // --- Units, Rulers & Artboard Dimensions (measured in mm) ---
  const [unit, setUnit] = useState<UnitType>('mm');
  const [showRulers, setShowRulers] = useState<boolean>(true);
  const [artboardWidth, setArtboardWidth] = useState<number>(210 * PX_PER_MM); // 210mm (A4 width)
  const [artboardHeight, setArtboardHeight] = useState<number>(297 * PX_PER_MM); // 297mm (A4 height)
  const [containerMousePos, setContainerMousePos] = useState<{ x: number; y: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 1200, height: 800 });

  // --- Background Reference Image State ---
  const [tracingImage, setTracingImage] = useState<TracingImage | null>(null);

  // --- Copy/Paste buffer ---
  const [copiedElements, setCopiedElements] = useState<PathElement[]>([]);

  // --- Right-Click Context Menu State ---
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    canvasCoords: Point;
    targetElementId: string | null;
  } | null>(null);

  // --- Current Properties For New Drawing Elements ---
  const [fillColor, setFillColor] = useState<string>('none');
  const [fillOpacity, setFillOpacity] = useState<number>(1);
  const [strokeColor, setStrokeColor] = useState<string>('#ff007f');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const lastNonZeroStrokeWidthRef = useRef<number>(3);

  // --- Editor Drag States ---
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartCanvasPos, setDragStartCanvasPos] = useState<Point>({ x: 0, y: 0 });
  const [dragStartElementsBackup, setDragStartElementsBackup] = useState<PathElement[]>([]);
  const [draggedSegment, setDraggedSegment] = useState<{
    elementId: string;
    fromNodeIdx: number;
    toNodeIdx: number;
    t: number;
    startNodes: VectorNode[];
  } | null>(null);
  const [dragImageStartPos, setDragImageStartPos] = useState<{ x: number; y: number } | null>(null);

  // --- New Illustrator-style selection box and middle-click panning states ---
  const [selectionBox, setSelectionBox] = useState<{ start: Point; current: Point } | null>(null);
  const [isMiddleClickPanning, setIsMiddleClickPanning] = useState<boolean>(false);
  const selectionStartWithShiftRef = useRef<boolean>(false);
  const initialSelectedIdsRef = useRef<string[]>([]);
  const [activeFlyout, setActiveFlyout] = useState<'pathfinder' | 'mirror' | 'strokeToPath' | 'brushes' | 'penTools' | 'pointerSettings' | null>(null);
  const [pointerColor, setPointerColor] = useState<string>(() => {
    return localStorage.getItem('vector_pointer_color') || '#0f172a';
  });
  const [canvasBg, setCanvasBg] = useState<string>(() => {
    return localStorage.getItem('vector_canvas_bg') || '#ffffff';
  });
  const [segmentHoverPreview, setSegmentHoverPreview] = useState<{
    elementId: string;
    fromIdx: number;
    toIdx: number;
    point: Point;
  } | null>(null);
  const [strokeToPathMode, setStrokeToPathMode] = useState<'outline' | 'dual-lines'>('outline');
  const [strokeToPathCap, setStrokeToPathCap] = useState<'round' | 'butt' | 'square'>('round');
  const [strokeToPathKeepOriginal, setStrokeToPathKeepOriginal] = useState<boolean>(false);

  // --- Illustrator Brush Engine State ---
  const [brushes, setBrushes] = useState<BrushDefinition[]>(() => {
    try {
      const saved = localStorage.getItem('vector_brushes_library');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const customIds = new Set(parsed.map((b: any) => b.id));
          const defaults = DEFAULT_BRUSHES.filter(d => !customIds.has(d.id));
          return [...defaults, ...parsed];
        }
      }
    } catch (e) {
      console.error('Error loading saved brushes', e);
    }
    return DEFAULT_BRUSHES;
  });
  const [activeBrushId, setActiveBrushId] = useState<string | null>(null);
  const [isBrushModalOpen, setIsBrushModalOpen] = useState<boolean>(false);
  const [expandToast, setExpandToast] = useState<string | null>(null);

  useEffect(() => {
    if (expandToast) {
      const timer = setTimeout(() => setExpandToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [expandToast]);

  // --- Computer Fonts & Typography Tool State ---
  const [fonts, setFonts] = useState<FontItem[]>(INITIAL_FONTS);
  const [isComputerFontsModalOpen, setIsComputerFontsModalOpen] = useState<boolean>(false);
  const [isScanningFonts, setIsScanningFonts] = useState<boolean>(false);
  const [isOutlining, setIsOutlining] = useState<boolean>(false);
  const fontFileInputRef = useRef<HTMLInputElement>(null);

  // --- Image Trace (Bitmap to Vector) State ---
  const [isImageTraceModalOpen, setIsImageTraceModalOpen] = useState<boolean>(false);

  // --- Resizing / Transforming States ---
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  const [resizeStartBox, setResizeStartBox] = useState<{
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  } | null>(null);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);

  // --- Illustrator-style repeat-transform (Ctrl+D) states ---
  const [lastTransform, setLastTransform] = useState<{ type: 'move' | 'duplicate'; dx: number; dy: number }>({
    type: 'duplicate',
    dx: 30,
    dy: 30,
  });
  const currentDragDeltaRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // --- Illustrator-style Modifier Keys and Dynamic States ---
  const [isCtrlKeyHeld, setIsCtrlKeyHeld] = useState<boolean>(false);
  const [isAltKeyHeld, setIsAltKeyHeld] = useState<boolean>(false);
  const [isShiftKeyHeld, setIsShiftKeyHeld] = useState<boolean>(false);
  const isCtrlHeldRef = useRef<boolean>(false);
  const isAltHeldRef = useRef<boolean>(false);
  const isShiftHeldRef = useRef<boolean>(false);

  // --- Click-and-Hold Drag to Size for Shapes ---
  const [isDrawingShape, setIsDrawingShape] = useState<boolean>(false);
  const shapeDragStartRef = useRef<Point | null>(null);
  const activeShapeIdRef = useRef<string | null>(null);
  const shapeToolTypeRef = useRef<ToolType | null>(null);

  // Helper to calculate shape nodes when dragging to size with Shift (1:1 aspect) and Alt (from center)
  const updateShapeGeometry = (
    shapeType: 'rect' | 'ellipse' | 'triangle' | 'spiral',
    startPt: Point,
    currentPt: Point,
    isShift: boolean,
    isAlt: boolean
  ): VectorNode[] => {
    let w = Math.abs(currentPt.x - startPt.x);
    let h = Math.abs(currentPt.y - startPt.y);

    if (isShift) {
      const maxDim = Math.max(w, h);
      w = maxDim;
      h = maxDim;
    }

    let x1: number, x2: number, y1: number, y2: number;
    if (isAlt) {
      x1 = startPt.x - w;
      x2 = startPt.x + w;
      y1 = startPt.y - h;
      y2 = startPt.y + h;
    } else {
      const signX = currentPt.x >= startPt.x ? 1 : -1;
      const signY = currentPt.y >= startPt.y ? 1 : -1;
      x1 = signX > 0 ? startPt.x : startPt.x - w;
      x2 = signX > 0 ? startPt.x + w : startPt.x;
      y1 = signY > 0 ? startPt.y : startPt.y - h;
      y2 = signY > 0 ? startPt.y + h : startPt.y;
    }

    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.max(1, (x2 - x1) / 2);
    const ry = Math.max(1, (y2 - y1) / 2);

    if (shapeType === 'rect') {
      return [
        { id: 'rn1', anchor: { x: x1, y: y1 }, type: 'corner' },
        { id: 'rn2', anchor: { x: x2, y: y1 }, type: 'corner' },
        { id: 'rn3', anchor: { x: x2, y: y2 }, type: 'corner' },
        { id: 'rn4', anchor: { x: x1, y: y2 }, type: 'corner' },
      ];
    } else if (shapeType === 'ellipse') {
      const kappaX = rx * 0.5522847498;
      const kappaY = ry * 0.5522847498;
      return [
        {
          id: 'en1',
          anchor: { x: cx, y: cy - ry },
          handleIn: { x: cx - kappaX, y: cy - ry },
          handleOut: { x: cx + kappaX, y: cy - ry },
          type: 'symmetric',
        },
        {
          id: 'en2',
          anchor: { x: cx + rx, y: cy },
          handleIn: { x: cx + rx, y: cy - kappaY },
          handleOut: { x: cx + rx, y: cy + kappaY },
          type: 'symmetric',
        },
        {
          id: 'en3',
          anchor: { x: cx, y: cy + ry },
          handleIn: { x: cx + kappaX, y: cy + ry },
          handleOut: { x: cx - kappaX, y: cy + ry },
          type: 'symmetric',
        },
        {
          id: 'en4',
          anchor: { x: cx - rx, y: cy },
          handleIn: { x: cx - rx, y: cy + kappaY },
          handleOut: { x: cx - rx, y: cy - kappaY },
          type: 'symmetric',
        },
      ];
    } else if (shapeType === 'triangle') {
      return [
        { id: 'tn1', anchor: { x: cx, y: y1 }, type: 'corner' },
        { id: 'tn2', anchor: { x: x2, y: y2 }, type: 'corner' },
        { id: 'tn3', anchor: { x: x1, y: y2 }, type: 'corner' },
      ];
    } else {
      // Spiral template rescaled to match bounding box
      const baseSpiral = getSpiralTemplate();
      const origBox = getElementBoundingBox(baseSpiral);
      const scaleX = (x2 - x1) / Math.max(origBox.width, 1);
      const scaleY = (y2 - y1) / Math.max(origBox.height, 1);
      return baseSpiral.nodes.map(n => ({
        ...n,
        anchor: {
          x: x1 + (n.anchor.x - origBox.minX) * scaleX,
          y: y1 + (n.anchor.y - origBox.minY) * scaleY,
        },
        handleIn: n.handleIn
          ? {
              x: x1 + (n.handleIn.x - origBox.minX) * scaleX,
              y: y1 + (n.handleIn.y - origBox.minY) * scaleY,
            }
          : undefined,
        handleOut: n.handleOut
          ? {
              x: x1 + (n.handleOut.x - origBox.minX) * scaleX,
              y: y1 + (n.handleOut.y - origBox.minY) * scaleY,
            }
          : undefined,
      }));
    }
  };

  // --- Drag-over Overlay for file tracing loading ---
  const [isDragOverCanvas, setIsDragOverCanvas] = useState<boolean>(false);
  
  // Reference for file picker triggers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

  // Synchronous refs to prevent race conditions during rapid zooms/pans
  const zoomRef = useRef<number>(zoom);
  const panOffsetRef = useRef<Point>(panOffset);
  const lastMousePosRef = useRef<Point | null>(null);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  // Track canvas container dimensions for precision rulers
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const updateSize = () => {
      if (canvasContainerRef.current) {
        const rect = canvasContainerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(canvasContainerRef.current);
    return () => observer.disconnect();
  }, []);

  /**
   * Zooms smoothly and deterministically to targetZoom, pivoting exactly at the specified screen point
   * (the mouse position over the canvas, or viewport center if cursor is outside).
   */
  const zoomToPoint = useCallback((targetZoom: number, pivot?: Point) => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const currentZoom = zoomRef.current;
    const currentPan = panOffsetRef.current;

    const nextZoom = Math.max(0.15, Math.min(10, targetZoom));
    if (Math.abs(nextZoom - currentZoom) < 0.0001) return;

    // Determine pivot point in container coordinates (pixels relative to container top-left)
    let pivotX: number;
    let pivotY: number;

    if (pivot) {
      pivotX = pivot.x;
      pivotY = pivot.y;
    } else if (lastMousePosRef.current) {
      pivotX = lastMousePosRef.current.x;
      pivotY = lastMousePosRef.current.y;
    } else {
      const rect = container.getBoundingClientRect();
      pivotX = rect.width / 2;
      pivotY = rect.height / 2;
    }

    // Exact canvas-space coordinate of the pivot point before zoom
    const canvasPivotX = (pivotX - currentPan.x) / currentZoom;
    const canvasPivotY = (pivotY - currentPan.y) / currentZoom;

    // New pan offset so canvasPivot stays at the exact same screen pixel (pivotX, pivotY)
    const nextPanX = pivotX - canvasPivotX * nextZoom;
    const nextPanY = pivotY - canvasPivotY * nextZoom;

    // Keep synchronous refs immediately updated so rapid successive zooms (like wheel turns) stay in lockstep
    zoomRef.current = nextZoom;
    panOffsetRef.current = { x: nextPanX, y: nextPanY };

    setZoom(nextZoom);
    setPanOffset({ x: nextPanX, y: nextPanY });
  }, []);

  // Extract all elements across layers for calculations
  const getAllElements = () => {
    return layers.flatMap(l => l.elements);
  };

  // Helper to get active layer
  const getActiveLayer = () => {
    return layers.find(l => l.id === activeLayerId) || layers[0];
  };

  // Helper to locate which element and node is selected
  const getSelectedNode = (): VectorNode | null => {
    if (!selectedNodeInfo) return null;
    const allEl = getAllElements();
    const el = allEl.find(e => e.id === selectedNodeInfo.elementId);
    if (!el) return null;
    return el.nodes.find(n => n.id === selectedNodeInfo.nodeId) || null;
  };

  // Helper to change property in currently selected path elements
  const updateSelectedElementsProperty = (key: keyof PathElement, value: any, saveHistoryState = false) => {
    if (saveHistoryState) {
      pushHistory(layers);
    }
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (selectedElementIds.includes(el.id)) {
            return { ...el, [key]: value };
          }
          return el;
        }),
      }))
    );
  };

  // Resize and/or reposition selected element(s) to exact dimensions in the active unit (mm, in, px)
  const handleUpdateDimensions = useCallback((params: {
    newWidth?: number;
    newHeight?: number;
    newX?: number;
    newY?: number;
    origin: TransformOrigin;
    lockAspectRatio: boolean;
  }) => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);

    setLayers(prev =>
      prev.map(layer => {
        const selectedInLayer = layer.elements.filter(el => selectedElementIds.includes(el.id));
        if (selectedInLayer.length === 0) return layer;

        const updatedSelected = resizeElementsToDimensions(selectedInLayer, params);
        const map = new Map(updatedSelected.map(el => [el.id, el]));

        return {
          ...layer,
          elements: layer.elements.map(el => map.get(el.id) || el),
        };
      })
    );
  }, [selectedElementIds, layers]);

  // Update properties of a specific node
  const updateSelectedNodeProperty = (key: keyof VectorNode, value: any, saveHistoryState = false) => {
    if (!selectedNodeInfo) return;
    if (saveHistoryState) {
      pushHistory(layers);
    }
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (el.id === selectedNodeInfo.elementId) {
            return {
              ...el,
              nodes: el.nodes.map(n => {
                if (n.id === selectedNodeInfo.nodeId) {
                  return { ...n, [key]: value };
                }
                return n;
              }),
            };
          }
          return el;
        }),
      }))
    );
  };

  // --- High-Contrast Custom Vector Cursor Generator ---
  const getCustomCursor = (cursorType: 'select' | 'direct-select' | 'pen' | 'crosshair' | 'grab' | 'grabbing' | 'pointer') => {
    if (pointerColor === 'system') {
      switch (cursorType) {
        case 'direct-select': return 'crosshair';
        case 'select': return 'default';
        case 'pen': return 'crosshair';
        case 'crosshair': return 'crosshair';
        case 'grab': return 'grab';
        case 'grabbing': return 'grabbing';
        case 'pointer': return 'pointer';
        default: return 'default';
      }
    }

    const fill = encodeURIComponent(pointerColor);
    const stroke = pointerColor === '#ffffff' ? '%23000000' : '%23ffffff';

    if (cursorType === 'direct-select') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M4 2 L17 11.5 L11 12.8 L14.5 20.5 L12 21.5 L8.5 13.8 L4 17 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/><rect x="15" y="14" width="8" height="8" rx="1.5" fill="${stroke}" stroke="${fill}" stroke-width="2"/><rect x="17.5" y="16.5" width="3" height="3" fill="${fill}"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 2, auto`;
    }

    if (cursorType === 'select') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M4 2 L19 12 L11.5 13.5 L15.5 22 L12.5 23 L8.5 14.5 L4 18 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 2, default`;
    }

    if (cursorType === 'pen') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3 3 L9 4 L14 9 L15 14 L10 15 L5 10 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><circle cx="9" cy="9" r="1.5" fill="${stroke}"/><path d="M3 3 L8 8" stroke="${stroke}" stroke-width="1.5"/><path d="M14 9 L22 17 L17 22 L9 14 Z" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="1.2"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 3 3, crosshair`;
    }

    if (cursorType === 'crosshair') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="25" height="25" viewBox="0 0 25 25"><circle cx="12.5" cy="12.5" r="5" fill="none" stroke="${fill}" stroke-width="1.5"/><circle cx="12.5" cy="12.5" r="1.5" fill="${fill}"/><line x1="12.5" y1="2" x2="12.5" y2="7.5" stroke="${fill}" stroke-width="2" stroke-linecap="round"/><line x1="12.5" y1="17.5" x2="12.5" y2="23" stroke="${fill}" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="12.5" x2="7.5" y2="12.5" stroke="${fill}" stroke-width="2" stroke-linecap="round"/><line x1="17.5" y1="12.5" x2="23" y2="12.5" stroke="${fill}" stroke-width="2" stroke-linecap="round"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, crosshair`;
    }

    if (cursorType === 'grabbing') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M7 11 C6.4 11 6 11.4 6 12 C6 14.5 8 16.5 10.5 16.5 L13.5 16.5 C16 16.5 18 14.5 18 12 C18 11.4 17.6 11 17 11 C16.4 11 16 11.4 16 12 C16 11.4 15.6 11 15 11 C14.4 11 14 11.4 14 12 C14 11.4 13.6 11 13 11 C12.4 11 12 11.4 12 12 L12 10 C12 9.4 11.6 9 11 9 C10.4 9 10 9.4 10 10 L10 12 L8 12 C7.4 12 7 11.6 7 11 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 11 12, grabbing`;
    }

    if (cursorType === 'pointer') {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/><line x1="12" y1="3" x2="12" y2="7" stroke="${fill}" stroke-width="1.8" stroke-linecap="round"/><line x1="12" y1="17" x2="12" y2="21" stroke="${fill}" stroke-width="1.8" stroke-linecap="round"/><line x1="3" y1="12" x2="7" y2="12" stroke="${fill}" stroke-width="1.8" stroke-linecap="round"/><line x1="17" y1="12" x2="21" y2="12" stroke="${fill}" stroke-width="1.8" stroke-linecap="round"/></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, pointer`;
    }

    return 'default';
  };

  const getCurrentCanvasCursor = () => {
    if (isMiddleClickPanning) return getCustomCursor('grabbing');
    if (tool === 'direct-select') return getCustomCursor('direct-select');
    if (tool === 'select') return getCustomCursor('select');
    if (tool === 'pen') {
      if (isCtrlKeyHeld) return getCustomCursor('select');
      return getCustomCursor('pen');
    }
    return getCustomCursor('crosshair');
  };

  // Convert mouse events on SVG space to Canvas relative coordinates
  const getCanvasCoords = (e: React.MouseEvent<SVGSVGElement> | React.DragEvent<SVGSVGElement>) => {
    if (!canvasContainerRef.current) return { x: 0, y: 0 };
    const rect = canvasContainerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - panOffset.x) / zoom;
    const y = (e.clientY - rect.top - panOffset.y) / zoom;
    return { x, y };
  };

  // Snapped target generator
  const getSnappedCanvasCoords = (e: React.MouseEvent<SVGSVGElement>, ignorePointsId?: string) => {
    const raw = getCanvasCoords(e);
    // Filter out points of the element currently under drawing to prevent self-interfering snaps where unwanted
    const activeElements = getAllElements().filter(el => el.id !== ignorePointsId);
    const snapResult = snapPoint(raw, { size: grid.size, snap: grid.snap }, activeElements, 10 / zoom);
    return snapResult.point;
  };

  // --- Adding Starters ---
  const handleLoadTemplate = (type: 'spiral' | 'teardrop' | 'leaf') => {
    pushHistory(layers);
    let newElements: PathElement[] = [];
    if (type === 'spiral') {
      newElements = [getSpiralTemplate()];
    } else if (type === 'teardrop') {
      newElements = [getTeardropTemplate()];
    } else if (type === 'leaf') {
      newElements = getTwinLeafTemplate();
    }

    const uniqueElements = newElements.map(el => ({
      ...el,
      id: `${el.id}-${Math.random().toString(36).substr(2, 6)}`,
      name: `${el.name} (Copy)`
    }));

    setLayers(prev =>
      prev.map(layer =>
        layer.id === activeLayerId
          ? { ...layer, elements: [...layer.elements, ...uniqueElements] }
          : layer
      )
    );

    // Auto-select newly added elements
    setSelectedElementIds(uniqueElements.map(e => e.id));
    setTool('select');
  };

  // --- Pathfinder Handler ---
  const handlePathfinder = (op: 'union' | 'subtract' | 'intersect' | 'exclude') => {
    if (selectedElementIds.length < 2) {
      alert("Tēnā koa, whiria kia rua, maha rānei ngā āhua (Please select at least 2 overlapping shapes).");
      return;
    }

    pushHistory(layers);
    const allEls = getAllElements();
    const selectedEls = allEls.filter(el => selectedElementIds.includes(el.id));

    const result = performPathfinder(op, selectedEls);
    if (!result) {
      alert("Kua raru te mahi Pathfinder. Kia paparea ngā āhua (Pathfinder operation yielded no overlapping vector regions).");
      return;
    }

    // Replace the merged elements inside layers
    setLayers(prev =>
      prev.map(layer => {
        // Filter out original elements
        const filtered = layer.elements.filter(el => !selectedElementIds.includes(el.id));
        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...filtered, result],
          };
        }
        return { ...layer, elements: filtered };
      })
    );

    setSelectedElementIds([result.id]);
    alert(`Pathfinder ${op.toUpperCase()} angitū! (Operation completed)`);
  };

  // --- COPY, CUT, PASTE & CLIPBOARD ACTION ENGINES ---
  const handleCopy = () => {
    if (selectedElementIds.length === 0) return;
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    setCopiedElements(JSON.parse(JSON.stringify(selectedEls)));
    setExpandToast(`Copied ${selectedEls.length} shape${selectedEls.length > 1 ? 's' : ''}`);
    setTimeout(() => setExpandToast(null), 1500);
  };

  const handleCut = () => {
    if (selectedElementIds.length === 0) return;
    handleCopy();
    handleDeleteSelected();
  };

  const handleDuplicate = () => {
    if (selectedElementIds.length === 0) return;
    handleCopy();
    handlePaste();
  };

  const handleDeleteSelected = () => {
    // 1. Direct Selection: Selected Segment deletion
    if (tool === 'direct-select' && selectedSegment) {
      pushHistory(layers);
      const { elementId, fromIdx, toIdx } = selectedSegment;
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements
            .flatMap(el => {
              if (el.id === elementId) {
                return deleteSegmentFromElement(el, fromIdx, toIdx);
              }
              return [el];
            })
            .filter(el => el && el.nodes && el.nodes.length > 0),
        }))
      );
      setSelectedSegment(null);
      setSelectedNodes([]);
      setSelectedNodeInfo(null);
      setExpandToast('Deleted path section');
      return;
    }

    // 2. Direct Selection: Multiple or Single Node deletion (breaks path and removes sections)
    const nodesToDelete = selectedNodes.length > 0
      ? selectedNodes
      : (selectedNodeInfo ? [selectedNodeInfo] : []);

    if (nodesToDelete.length > 0 && tool === 'direct-select') {
      pushHistory(layers);
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements
            .flatMap(el => {
              const matchingIds = nodesToDelete
                .filter(n => n.elementId === el.id)
                .map(n => n.nodeId);
              if (matchingIds.length === 0) return [el];
              return deleteNodesAndBreakSections(el, matchingIds);
            })
            .filter(el => el && el.nodes && el.nodes.length > 0),
        }))
      );
      const count = nodesToDelete.length;
      setSelectedNodes([]);
      setSelectedNodeInfo(null);
      setSelectedSegment(null);
      setExpandToast(`Deleted section (${count} node${count > 1 ? 's' : ''} removed)`);
      return;
    }

    // 3. Element Deletion (Selection tool or entire elements selected)
    if (selectedElementIds.length > 0) {
      pushHistory(layers);
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.filter(el => !selectedElementIds.includes(el.id)),
        }))
      );
      setSelectedElementIds([]);
      setSelectedNodes([]);
      setSelectedNodeInfo(null);
      setSelectedSegment(null);
    }
  };

  const handlePaste = () => {
    if (copiedElements.length === 0) return;
    pushHistory(layers);
    const offset = 24; // offset grid step for copy placement so it is highly visible
    const newPastedElements = copiedElements.map(el => {
      const newNodes = el.nodes.map(node => {
        const anchor = { x: node.anchor.x + offset, y: node.anchor.y + offset };
        const handleIn = node.handleIn
          ? { x: node.handleIn.x + offset, y: node.handleIn.y + offset }
          : undefined;
        const handleOut = node.handleOut
          ? { x: node.handleOut.x + offset, y: node.handleOut.y + offset }
          : undefined;
        return {
          ...node,
          id: `node-${Math.random().toString(36).substr(2, 5)}`,
          anchor,
          handleIn,
          handleOut,
        };
      });
      return {
        ...el,
        id: `el-${Math.random().toString(36).substr(2, 9)}`,
        name: `${el.name} (Copy)`,
        nodes: newNodes,
      };
    });

    setLayers(prev =>
      prev.map(layer => {
        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...layer.elements, ...newPastedElements]
          };
        }
        return layer;
      })
    );

    const newIds = newPastedElements.map(el => el.id);
    setSelectedElementIds(newIds);
    setCopiedElements(newPastedElements);
  };

  const handlePasteAtPos = (targetCanvasPos: Point) => {
    if (copiedElements.length === 0) return;
    pushHistory(layers);

    const box = getCombinedBoundingBox(copiedElements);
    const centerX = box.minX + box.width / 2;
    const centerY = box.minY + box.height / 2;

    const dx = targetCanvasPos.x - centerX;
    const dy = targetCanvasPos.y - centerY;

    const newPastedElements = copiedElements.map(el => {
      const newNodes = el.nodes.map(node => {
        const anchor = { x: node.anchor.x + dx, y: node.anchor.y + dy };
        const handleIn = node.handleIn
          ? { x: node.handleIn.x + dx, y: node.handleIn.y + dy }
          : undefined;
        const handleOut = node.handleOut
          ? { x: node.handleOut.x + dx, y: node.handleOut.y + dy }
          : undefined;
        return {
          ...node,
          id: `node-${Math.random().toString(36).substr(2, 5)}`,
          anchor,
          handleIn,
          handleOut,
        };
      });
      return {
        ...el,
        id: `el-${Math.random().toString(36).substr(2, 9)}`,
        name: `${el.name} (Pasted)`,
        nodes: newNodes,
      };
    });

    setLayers(prev =>
      prev.map(layer => {
        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...layer.elements, ...newPastedElements]
          };
        }
        return layer;
      })
    );

    const newIds = newPastedElements.map(el => el.id);
    setSelectedElementIds(newIds);
  };

  // --- ARRANGE & STACKING ORDER ---
  const handleBringToFront = () => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => {
        const selected = layer.elements.filter(el => selectedElementIds.includes(el.id));
        if (selected.length === 0) return layer;
        const unselected = layer.elements.filter(el => !selectedElementIds.includes(el.id));
        return {
          ...layer,
          elements: [...unselected, ...selected]
        };
      })
    );
  };

  const handleSendToBack = () => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => {
        const selected = layer.elements.filter(el => selectedElementIds.includes(el.id));
        if (selected.length === 0) return layer;
        const unselected = layer.elements.filter(el => !selectedElementIds.includes(el.id));
        return {
          ...layer,
          elements: [...selected, ...unselected]
        };
      })
    );
  };

  const handleBringForward = () => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => {
        const els = [...layer.elements];
        for (let i = els.length - 2; i >= 0; i--) {
          if (selectedElementIds.includes(els[i].id) && !selectedElementIds.includes(els[i + 1].id)) {
            const temp = els[i];
            els[i] = els[i + 1];
            els[i + 1] = temp;
          }
        }
        return { ...layer, elements: els };
      })
    );
  };

  const handleSendBackward = () => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => {
        const els = [...layer.elements];
        for (let i = 1; i < els.length; i++) {
          if (selectedElementIds.includes(els[i].id) && !selectedElementIds.includes(els[i - 1].id)) {
            const temp = els[i];
            els[i] = els[i - 1];
            els[i - 1] = temp;
          }
        }
        return { ...layer, elements: els };
      })
    );
  };

  const handleToggleLock = () => {
    if (selectedElementIds.length === 0) return;
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (selectedElementIds.includes(el.id)) {
            return { ...el, locked: !el.locked };
          }
          return el;
        }),
      }))
    );
  };

  const handleCopySvgCode = () => {
    if (selectedElementIds.length === 0) return;
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    if (selectedEls.length === 0) return;
    const box = getCombinedBoundingBox(selectedEls);
    const paths = selectedEls.map(el => {
      if (el.type === 'text') {
        return `  <text x="${el.nodes[0]?.anchor.x || 0}" y="${el.nodes[0]?.anchor.y || 0}" fill="${el.fill}" font-family="${el.fontFamily || 'sans-serif'}" font-size="${el.fontSize || 48}">${el.text || ''}</text>`;
      }
      const d = getPathData(el.nodes, el.closed);
      return `  <path d="${d}" fill="${el.fill}" stroke="${el.stroke}" stroke-width="${el.strokeWidth}" fill-rule="evenodd" />`;
    }).join('\n');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.minX} ${box.minY} ${box.width} ${box.height}">\n${paths}\n</svg>`;
    navigator.clipboard?.writeText(svg).then(() => {
      setExpandToast('SVG code copied to clipboard!');
      setTimeout(() => setExpandToast(null), 2500);
    }).catch(() => {
      setExpandToast('SVG code ready');
    });
  };

  const handleSelectAll = () => {
    const selectableIds = getAllElements().filter(el => !el.locked && el.visible).map(el => el.id);
    setSelectedElementIds(selectableIds);
  };

  const handleDeselectAll = () => {
    setSelectedElementIds([]);
    setSelectedNodeInfo(null);
    setSelectedHandle(null);
  };

  const handleResetZoom = () => {
    const container = canvasContainerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      const targetZoom = 1;
      const targetPanX = Math.round((rect.width - artboardWidth * targetZoom) / 2);
      const targetPanY = Math.round((rect.height - artboardHeight * targetZoom) / 2);
      setZoom(targetZoom);
      setPanOffset({ x: Math.max(20, targetPanX), y: Math.max(20, targetPanY) });
      zoomRef.current = targetZoom;
      panOffsetRef.current = { x: Math.max(20, targetPanX), y: Math.max(20, targetPanY) };
    } else {
      setZoom(1);
      setPanOffset({ x: 50, y: 50 });
    }
  };

  const handleCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const canvasPt = getCanvasCoords(e);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      canvasCoords: canvasPt,
      targetElementId: null,
    });
  };

  const handleElementContextMenu = (e: React.MouseEvent, elementId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedElementIds.includes(elementId)) {
      if (e.shiftKey) {
        setSelectedElementIds(prev => [...prev, elementId]);
      } else {
        setSelectedElementIds([elementId]);
      }
    }
    const canvasPt = getCanvasCoords(e);
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      canvasCoords: canvasPt,
      targetElementId: elementId,
    });
  };

  const handleRepeatTransform = () => {
    if (selectedElementIds.length === 0) return;
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    if (selectedEls.length === 0) return;

    pushHistory(layers);
    const dx = lastTransform.dx;
    const dy = lastTransform.dy;

    const newRepeatedElements = selectedEls.map(el => {
      const newNodes = el.nodes.map(node => {
        const anchor = { x: node.anchor.x + dx, y: node.anchor.y + dy };
        const handleIn = node.handleIn
          ? { x: node.handleIn.x + dx, y: node.handleIn.y + dy }
          : undefined;
        const handleOut = node.handleOut
          ? { x: node.handleOut.x + dx, y: node.handleOut.y + dy }
          : undefined;
        return {
          ...node,
          id: `node-${Math.random().toString(36).substr(2, 5)}`,
          anchor,
          handleIn,
          handleOut,
        };
      });
      return {
        ...el,
        id: `el-${Math.random().toString(36).substr(2, 9)}`,
        name: `${el.name} (Repeat)`,
        nodes: newNodes,
      };
    });

    setLayers(prev =>
      prev.map(layer => {
        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...layer.elements, ...newRepeatedElements]
          };
        }
        return layer;
      })
    );

    const newIds = newRepeatedElements.map(el => el.id);
    setSelectedElementIds(newIds);
  };

  // --- MIRROR & SYMMETRY ACTIONS ---
  const handleMirrorAction = (type: 'flip-horizontal' | 'flip-vertical' | 'mirror-horizontal' | 'mirror-vertical') => {
    if (selectedElementIds.length === 0) return;

    // Get the selected elements
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    if (selectedEls.length === 0) return;

    pushHistory(layers);
    // Calculate bounding box center of the combined selection
    const box = getCombinedBoundingBox(selectedEls);

    if (type === 'flip-horizontal' || type === 'flip-vertical') {
      // Flips the existing elements in place
      const axis = type === 'flip-horizontal' ? 'horizontal' : 'vertical';
      const center = axis === 'horizontal' ? box.centerX : box.centerY;

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            if (selectedElementIds.includes(el.id)) {
              const mir = mirrorElement(el, axis, center);
              return {
                ...el,
                nodes: mir.nodes
              };
            }
            return el;
          })
        }))
      );
    } else {
      // Clones and mirrors, creating new elements!
      const axis = type === 'mirror-horizontal' ? 'horizontal' : 'vertical';
      const center = axis === 'horizontal' ? box.centerX : box.centerY;

      const newMirroredElements = selectedEls.map(el => {
        const cloned = mirrorElement(el, axis, center);
        cloned.name = `${el.name} (Symmetric)`;
        return cloned;
      });

      // Add them to the active layer
      setLayers(prev =>
        prev.map(layer => {
          if (layer.id === activeLayerId) {
            return {
              ...layer,
              elements: [...layer.elements, ...newMirroredElements]
            };
          }
          return layer;
        })
      );

      // Select the new mirrored elements
      const newIds = newMirroredElements.map(el => el.id);
      setSelectedElementIds(newIds);
    }
  };

  // --- STROKE TO PATH (OUTLINE STROKE) ACTION ---
  const handleStrokeToPath = (optionsOverride?: Partial<StrokeToPathOptions>) => {
    const allEls = getAllElements();
    const selectedEls = allEls.filter(el => selectedElementIds.includes(el.id));

    if (selectedEls.length === 0) {
      alert("Tēnā koa, whiria tētahi ara whiu (Please select at least one path with a stroke to convert).");
      return;
    }

    pushHistory(layers);

    const mergedOptions: StrokeToPathOptions = {
      mode: strokeToPathMode,
      cap: strokeToPathCap,
      keepOriginal: strokeToPathKeepOriginal,
      ...optionsOverride,
    };

    const newGeneratedElements: PathElement[] = [];
    const elementsToRemoveIds: string[] = [];

    selectedEls.forEach(el => {
      const generated = convertStrokeToPath(el, mergedOptions);
      if (generated.length > 0) {
        newGeneratedElements.push(...generated);
        if (!mergedOptions.keepOriginal) {
          elementsToRemoveIds.push(el.id);
        }
      }
    });

    if (newGeneratedElements.length === 0) {
      alert("Could not convert stroke to path. Please ensure the path has at least 2 anchor points and a stroke width.");
      return;
    }

    setLayers(prev =>
      prev.map(layer => {
        const remainingElements = elementsToRemoveIds.length > 0
          ? layer.elements.filter(el => !elementsToRemoveIds.includes(el.id))
          : layer.elements;

        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...remainingElements, ...newGeneratedElements],
          };
        }
        return {
          ...layer,
          elements: remainingElements,
        };
      })
    );

    const newIds = newGeneratedElements.map(e => e.id);
    setSelectedElementIds(newIds);
    setTool('select');
  };

  // --- ILLUSTRATOR BRUSH ENGINE ACTIONS ---

  // Save new custom brush created from selected shape(s)
  const handleSaveNewBrush = (newBrush: BrushDefinition) => {
    pushHistory(layers);
    setBrushes(prev => {
      const updated = [newBrush, ...prev];
      try {
        const customOnly = updated.filter(b => !b.isDefault);
        localStorage.setItem('vector_brushes_library', JSON.stringify(customOnly));
      } catch (err) {
        console.error('Failed to save brushes to localStorage', err);
      }
      return updated;
    });

    setActiveBrushId(newBrush.id);

    // If elements are selected, apply the newly saved brush immediately!
    if (selectedElementIds.length > 0) {
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el =>
            selectedElementIds.includes(el.id)
              ? { ...el, brushId: newBrush.id }
              : el
          ),
        }))
      );
    }
  };

  // Select / Apply brush to current selection or activate for next stroke
  const handleSelectBrush = (brushId: string | null) => {
    setActiveBrushId(brushId);

    if (selectedElementIds.length > 0) {
      pushHistory(layers);
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            if (selectedElementIds.includes(el.id)) {
              return { ...el, brushId: brushId || undefined };
            }
            return el;
          }),
        }))
      );
    }
  };

  // Delete custom brush
  const handleDeleteBrush = (brushId: string) => {
    setBrushes(prev => {
      const updated = prev.filter(b => b.id !== brushId);
      try {
        const customOnly = updated.filter(b => !b.isDefault);
        localStorage.setItem('vector_brushes_library', JSON.stringify(customOnly));
      } catch (err) {
        console.error('Failed to delete brush from localStorage', err);
      }
      return updated;
    });

    if (activeBrushId === brushId) {
      setActiveBrushId(null);
    }
  };

  // Illustrator "Expand / Expand Appearance" (Object > Expand / Expand Appearance)
  // Illustrator "Expand / Expand Appearance" (Object > Expand / Expand Appearance)
  // Bakes brushes, stroked paths, and text into independent, editable closed vector shapes!
  const handleExpandToShapes = async () => {
    const allEls = getAllElements();
    const selectedEls = allEls.filter(el => selectedElementIds.includes(el.id));

    if (selectedEls.length === 0) {
      alert("Please select at least one path, brush stroke, or text to expand into shapes.");
      return;
    }

    pushHistory(layers);

    const newlyCreatedIds: string[] = [];
    const elementsToRemoveIds: string[] = [];
    const newGeneratedElements: PathElement[] = [];

    for (const el of selectedEls) {
      // CASE 0: Text Element -> Expand into clean mathematical vector outline shapes!
      if (el.type === 'text') {
        try {
          const letterShapes = await convertTextToOutlines(el, fonts);
          if (letterShapes.length > 0) {
            letterShapes.forEach(s => {
              newGeneratedElements.push(s);
              newlyCreatedIds.push(s.id);
            });
            elementsToRemoveIds.push(el.id);
            continue;
          }
        } catch (err) {
          console.warn("Could not expand text outlines:", err);
        }
      }

      // CASE 1: Path has an applied brush (e.g. 4 rectangles or any custom brush)
      if (el.brushId) {
        const brush = brushes.find(b => b.id === el.brushId);
        if (brush) {
          const deformed = applyBrushToStroke(el, brush);
          deformed.forEach((dEl, idx) => {
            if (dEl.closed && dEl.fill !== 'none') {
              // Simplify points slightly so anchor nodes are clean and pleasant to edit with Direct Selection (A)
              const rawPts = dEl.nodes.map(n => n.anchor);
              const simplifiedPts = simplifyPoints(rawPts, 0.35);
              const cleanNodes = pointsToVectorNodes(simplifiedPts, true);

              const shapeEl: PathElement = {
                id: `expanded-shape-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
                name: `${el.name} Shape ${idx + 1}`,
                type: 'path',
                nodes: cleanNodes.length >= 3 ? cleanNodes : dEl.nodes,
                closed: true,
                fill: dEl.fill,
                fillOpacity: dEl.fillOpacity ?? 1,
                stroke: dEl.stroke !== 'none' ? dEl.stroke : 'none',
                strokeWidth: dEl.stroke !== 'none' ? dEl.strokeWidth : 0,
                visible: true,
                locked: false,
              };
              newGeneratedElements.push(shapeEl);
              newlyCreatedIds.push(shapeEl.id);
            } else {
              // Stroked brush part -> trace into closed outline shape!
              const outlineShapes = convertStrokeToPath(dEl, { mode: 'outline' });
              outlineShapes.forEach(s => {
                newGeneratedElements.push(s);
                newlyCreatedIds.push(s.id);
              });
            }
          });
          elementsToRemoveIds.push(el.id);
          continue;
        }
      }

      // CASE 2: Regular stroked path -> Outline Stroke into closed shape!
      if (el.nodes.length >= 2 && el.strokeWidth > 0 && el.stroke !== 'none') {
        const outlineShapes = convertStrokeToPath(el, { mode: 'outline' });
        if (outlineShapes.length > 0) {
          outlineShapes.forEach(s => {
            newGeneratedElements.push(s);
            newlyCreatedIds.push(s.id);
          });
          elementsToRemoveIds.push(el.id);
          continue;
        }
      }
    }

    if (newGeneratedElements.length === 0) {
      alert("Could not expand selected elements into shapes. Please ensure paths have a stroke, brush, or text applied.");
      return;
    }

    setLayers(prev =>
      prev.map(layer => {
        const remaining = layer.elements.filter(el => !elementsToRemoveIds.includes(el.id));
        if (layer.id === activeLayerId) {
          return {
            ...layer,
            elements: [...remaining, ...newGeneratedElements],
          };
        }
        return {
          ...layer,
          elements: remaining,
        };
      })
    );

    setSelectedElementIds(newlyCreatedIds);
    setTool('select');
    setExpandToast(`Kua whakatōkia ngā āhua! (${newGeneratedElements.length} closed vector shape${newGeneratedElements.length > 1 ? 's' : ''} created)`);
  };

  // Alias for backward compatibility with panel callbacks
  const handleExpandAppearance = handleExpandToShapes;

  // Scan Computer Fonts via Local Font Access API
  const handleScanComputerFonts = async () => {
    setIsScanningFonts(true);
    try {
      const localFonts = await queryLocalComputerFonts();
      if (localFonts.length > 0) {
        setFonts(prev => {
          const map = new Map<string, FontItem>();
          localFonts.forEach(f => map.set(f.family.toLowerCase(), f));
          prev.forEach(f => {
            if (!map.has(f.family.toLowerCase())) {
              map.set(f.family.toLowerCase(), f);
            }
          });
          return Array.from(map.values());
        });
        setExpandToast(`Loaded ${localFonts.length} local fonts from your computer!`);
        setIsComputerFontsModalOpen(false);
      }
    } catch (err: any) {
      setExpandToast(err.message || 'Could not query computer fonts');
    } finally {
      setIsScanningFonts(false);
    }
  };

  // Upload custom font file (.ttf, .otf, .woff)
  const handleFontFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      const newItems: FontItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const item = await loadFontFromFile(files[i]);
        newItems.push(item);
      }

      setFonts(prev => {
        const map = new Map<string, FontItem>();
        newItems.forEach(f => map.set(f.family.toLowerCase(), f));
        prev.forEach(f => {
          if (!map.has(f.family.toLowerCase())) {
            map.set(f.family.toLowerCase(), f);
          }
        });
        return Array.from(map.values());
      });

      if (selectedElementIds.length > 0 && newItems.length > 0) {
        updateSelectedTextElement({ fontFamily: newItems[0].family });
      }

      setExpandToast(`Loaded "${newItems.map(f => f.family).join(', ')}" font successfully!`);
      setIsComputerFontsModalOpen(false);
    } catch (err: any) {
      setExpandToast(err.message || 'Failed to parse font file');
    } finally {
      if (fontFileInputRef.current) fontFileInputRef.current.value = '';
    }
  };

  // Update selected text element properties
  const updateSelectedTextElement = (updates: Partial<PathElement>) => {
    const targetEl = getAllElements().find(el => selectedElementIds.includes(el.id) && el.type === 'text');
    if (!targetEl) return;
    pushHistory(layers);

    const updatedText = updates.text !== undefined ? updates.text : targetEl.text || 'Text';
    const updatedSize = updates.fontSize !== undefined ? updates.fontSize : targetEl.fontSize || 48;
    const updatedFamily = updates.fontFamily !== undefined ? updates.fontFamily : targetEl.fontFamily || 'Inter';
    const updatedWeight = updates.fontWeight !== undefined ? updates.fontWeight : targetEl.fontWeight || 600;
    const updatedStyle = updates.fontStyle !== undefined ? updates.fontStyle : targetEl.fontStyle || 'normal';
    const updatedSpacing = updates.letterSpacing !== undefined ? updates.letterSpacing : targetEl.letterSpacing || 0;

    const box = measureTextBoundingBox(updatedText, updatedSize, updatedFamily, updatedWeight, updatedStyle, updatedSpacing);
    const minX = targetEl.nodes.length > 0 ? Math.min(...targetEl.nodes.map(n => n.anchor.x)) : 100;
    const minY = targetEl.nodes.length > 0 ? Math.min(...targetEl.nodes.map(n => n.anchor.y)) : 100;
    const w = Math.max(20, box.width);
    const h = Math.max(20, box.height);

    const updatedNodes: VectorNode[] = [
      { id: `node-t-1`, anchor: { x: minX, y: minY }, type: 'corner' },
      { id: `node-t-2`, anchor: { x: minX + w, y: minY }, type: 'corner' },
      { id: `node-t-3`, anchor: { x: minX + w, y: minY + h }, type: 'corner' },
      { id: `node-t-4`, anchor: { x: minX, y: minY + h }, type: 'corner' },
    ];

    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el =>
          el.id === targetEl.id
            ? {
                ...el,
                ...updates,
                nodes: updatedNodes,
                name: updates.text ? `Text: ${updates.text.slice(0, 15)}` : el.name,
              }
            : el
        ),
      }))
    );
  };

  // Convert selected text into vector outlines (Illustrator Create Outlines / Ctrl+Shift+O)
  const handleCreateOutlines = async () => {
    const targetEl = getAllElements().find(el => selectedElementIds.includes(el.id) && el.type === 'text');
    if (!targetEl) return;
    setIsOutlining(true);
    pushHistory(layers);

    try {
      const outlines = await convertTextToOutlines(targetEl, fonts);
      if (outlines.length === 0) {
        setExpandToast('Could not convert text to vector outlines');
        setIsOutlining(false);
        return;
      }

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.flatMap(el =>
            el.id === targetEl.id ? outlines : [el]
          ),
        }))
      );

      setSelectedElementIds(outlines.map(o => o.id));
      setExpandToast(`Created outlines! (${outlines.length} editable vector paths with Bézier handles)`);
    } catch (err) {
      console.error('Error outlining text:', err);
      setExpandToast('Error converting text to outlines');
    } finally {
      setIsOutlining(false);
    }
  };

  // --- ILLUSTRATOR PEN TOOLS: ADD / DELETE / CONVERT / SUBDIVIDE ANCHOR NODES ---

  // Add an anchor point along an existing straight or curved segment (de Casteljau's algorithm)
  const handleAddNodeToSegment = (
    elementId: string,
    fromIdx: number,
    toIdx: number,
    clickPos: Point
  ) => {
    pushHistory(layers);
    const allEls = getAllElements();
    const el = allEls.find(item => item.id === elementId);
    if (!el || !el.nodes || el.nodes.length < 2) return;

    const fromNode = el.nodes[fromIdx];
    const toNode = el.nodes[toIdx];
    if (!fromNode || !toNode || !fromNode.anchor || !toNode.anchor) return;

    const splitRes = splitSegmentAtPoint(fromNode, toNode, clickPos);
    if (!splitRes || !splitRes.newNode || !splitRes.newNode.anchor) return;

    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(item => {
          if (item.id === elementId) {
            const validNodes = item.nodes.filter(n => n && n.anchor);
            if (fromIdx >= validNodes.length || toIdx >= validNodes.length) return item;

            const newNodes = [...validNodes];
            // Update previous node handleOut
            newNodes[fromIdx] = {
              ...newNodes[fromIdx],
              handleOut: splitRes.prevNodeHandleOut,
            };
            // Update next node handleIn
            newNodes[toIdx] = {
              ...newNodes[toIdx],
              handleIn: splitRes.nextNodeHandleIn,
            };
            // Insert new node immediately after fromIdx
            newNodes.splice(fromIdx + 1, 0, splitRes.newNode);

            return {
              ...item,
              nodes: newNodes.filter(n => n && n.anchor),
            };
          }
          return item;
        }),
      }))
    );

    setSelectedElementIds([elementId]);
    setSelectedNodeInfo({ elementId, nodeId: splitRes.newNode.id });
    setSelectedHandle('anchor');
    setSegmentHoverPreview(null);
    setExpandToast('Anchor point added on path (+)');
  };

  // Delete an anchor point from a path (Delete Anchor Point Tool / Pen-)
  const handleDeleteNode = (elementId: string, nodeId: string) => {
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements
          .flatMap(el => {
            if (el.id === elementId) {
              return deleteNodesAndBreakSections(el, [nodeId]);
            }
            return [el];
          })
          .filter(el => el && el.nodes && el.nodes.length > 0),
      }))
    );
    setSelectedNodes(prev => prev.filter(n => !(n.elementId === elementId && n.nodeId === nodeId)));
    setSelectedNodeInfo(null);
    setExpandToast('Anchor point removed (-)');
  };

  // Illustrator "Object > Path > Add Anchor Points" (Subdivides all segments)
  const handleAddAnchorPointsToPath = (elementId?: string) => {
    const targetIds = elementId ? [elementId] : selectedElementIds;
    if (targetIds.length === 0) return;
    pushHistory(layers);

    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (!targetIds.includes(el.id) || !el.nodes || el.nodes.length < 2) return el;

          const validNodes = el.nodes.filter(n => n && n.anchor);
          if (validNodes.length < 2) return el;

          const segCount = el.closed ? validNodes.length : validNodes.length - 1;
          const clonedNodes: VectorNode[] = validNodes.map(n => ({
            ...n,
            anchor: { ...n.anchor },
            handleIn: n.handleIn ? { ...n.handleIn } : undefined,
            handleOut: n.handleOut ? { ...n.handleOut } : undefined,
          }));

          const newNodes: VectorNode[] = [];

          for (let i = 0; i < segCount; i++) {
            const nextI = (i + 1) % clonedNodes.length;
            const n1 = clonedNodes[i];
            const n2 = clonedNodes[nextI];

            const p0 = n1.anchor;
            const p1 = n1.handleOut || p0;
            const p2 = n2.handleIn || n2.anchor;
            const p3 = n2.anchor;
            const midPt = {
              x: 0.125 * p0.x + 0.375 * p1.x + 0.375 * p2.x + 0.125 * p3.x,
              y: 0.125 * p0.y + 0.375 * p1.y + 0.375 * p2.y + 0.125 * p3.y,
            };

            const split = splitSegmentAtPoint(n1, n2, midPt);
            n1.handleOut = split.prevNodeHandleOut;
            n2.handleIn = split.nextNodeHandleIn;

            newNodes.push(n1);
            newNodes.push(split.newNode);
          }

          if (!el.closed) {
            newNodes.push(clonedNodes[clonedNodes.length - 1]);
          }

          return {
            ...el,
            nodes: newNodes.filter(n => n && n.anchor),
          };
        }),
      }))
    );
    setExpandToast('Added midpoint anchor points (Subdivided segments)');
  };

  // Convert Anchor Point between Corner and Smooth (Anchor Point Tool / Shift+C)
  const handleConvertNode = (elementId: string, nodeId: string, targetType: 'corner' | 'smooth') => {
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (el.id === elementId) {
            const nodeIdx = el.nodes.findIndex(n => n.id === nodeId);
            if (nodeIdx === -1) return el;
            const node = el.nodes[nodeIdx];

            if (targetType === 'corner') {
              return {
                ...el,
                nodes: el.nodes.map(n =>
                  n.id === nodeId ? { ...n, handleIn: undefined, handleOut: undefined, type: 'corner' } : n
                ),
              };
            } else {
              // Smooth: compute tangent handles
              const prevNode = nodeIdx > 0
                ? el.nodes[nodeIdx - 1]
                : el.closed && el.nodes.length > 2 ? el.nodes[el.nodes.length - 1] : null;
              const nextNode = nodeIdx < el.nodes.length - 1
                ? el.nodes[nodeIdx + 1]
                : el.closed && el.nodes.length > 2 ? el.nodes[0] : null;

              let handleIn: Point | undefined = undefined;
              let handleOut: Point | undefined = undefined;

              if (prevNode && nextNode) {
                const dx = nextNode.anchor.x - prevNode.anchor.x;
                const dy = nextNode.anchor.y - prevNode.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const d1 = distance(node.anchor, prevNode.anchor);
                const d2 = distance(node.anchor, nextNode.anchor);
                const handleLen = Math.max(15, Math.min(d1, d2) * 0.35);
                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;
                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
              } else if (nextNode) {
                const dx = nextNode.anchor.x - node.anchor.x;
                const dy = nextNode.anchor.y - node.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const handleLen = Math.max(15, len * 0.35);
                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
              } else if (prevNode) {
                const dx = node.anchor.x - prevNode.anchor.x;
                const dy = node.anchor.y - prevNode.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const handleLen = Math.max(15, len * 0.35);
                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;
                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
              } else {
                handleIn = { x: node.anchor.x - 30, y: node.anchor.y };
                handleOut = { x: node.anchor.x + 30, y: node.anchor.y };
              }

              return {
                ...el,
                nodes: el.nodes.map(n =>
                  n.id === nodeId ? { ...n, handleIn, handleOut, type: 'smooth' } : n
                ),
              };
            }
          }
          return el;
        }),
      }))
    );
  };

  // --- Tracing Image Loader ---
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement> | File) => {
    const file = e instanceof File ? e : e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const img: TracingImage = {
          id: `trace-img-${Date.now()}`,
          url: event.target.result,
          name: file.name,
          x: 100,
          y: 70,
          scale: 0.8,
          rotate: 0,
          opacity: 0.45, // perfect translucency out of the box for drawing
          visible: true,
          locked: false,
        };
        setTracingImage(img);
        alert(`Kua utaina te pikitia: ${file.name} (Successfully loaded tracing reference)`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverCanvas(true);
  };

  const handleDragLeave = () => {
    setIsDragOverCanvas(false);
  };

  const handleDrop = (e: React.DragEvent<SVGSVGElement>) => {
    e.preventDefault();
    setIsDragOverCanvas(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleImageFileChange(files[0]);
    }
  };

  // --- Vector Image Trace Handler (Marching Squares & Chaikin B-Spline) ---
  const handleApplyVectorTrace = (newElements: PathElement[], hideReferenceImage: boolean) => {
    if (newElements.length === 0) return;
    pushHistory(layers);

    setLayers(prev => {
      const targetLayerId = activeLayerId || prev[0]?.id;
      return prev.map(layer => {
        if (layer.id === targetLayerId) {
          return {
            ...layer,
            elements: [...layer.elements, ...newElements],
          };
        }
        return layer;
      });
    });

    // Select newly vectorized paths and switch to Select tool for immediate manipulation
    setSelectedElementIds(newElements.map(el => el.id));
    setSelectedNodeInfo(null);
    setSelectedNodes([]);
    setSelectedSegment(null);
    setTool('select');

    if (hideReferenceImage && tracingImage) {
      setTracingImage(prev => prev ? { ...prev, visible: false } : null);
    }

    setExpandToast(`Vectorized ${newElements.length} paths successfully with Chaikin & Marching Squares!`);
  };

  // --- CANVAS SVG CLICKS ---
  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // If middle click (button === 1), start middle-click panning!
    if (e.button === 1) {
      e.preventDefault();
      setIsMiddleClickPanning(true);
      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
      setDragImageStartPos({ x: panOffset.x, y: panOffset.y });
      return;
    }

    // Only pay attention to primary clicks
    if (e.button !== 0) return;

    e.preventDefault();

    setActiveFlyout(null);

    // Save starting state for undo/redo
    layersBeforeInteractionRef.current = JSON.parse(JSON.stringify(layers));

    const snappedPt = getSnappedCanvasCoords(e, activePathId || undefined);

    // --- TOOL: ADD ANCHOR POINT (OR PEN CLICK ON SEGMENT) ---
    if (segmentHoverPreview && (tool === 'pen' || tool === 'add-anchor')) {
      handleAddNodeToSegment(
        segmentHoverPreview.elementId,
        segmentHoverPreview.fromIdx,
        segmentHoverPreview.toIdx,
        segmentHoverPreview.point
      );
      return;
    }

    if (tool === 'add-anchor') {
      const allActive = getAllElements().filter(el => !el.locked);
      for (const el of allActive) {
        if (el.nodes.length >= 2) {
          const nearest = findNearestSegmentOnElement(el, snappedPt, 16 / zoom);
          if (nearest) {
            handleAddNodeToSegment(el.id, nearest.segmentIdx, nearest.nextSegmentIdx, nearest.projection);
            return;
          }
        }
      }
      return;
    }

    if (tool === 'delete-anchor' || tool === 'anchor-convert') {
      return;
    }

    // --- TOOL: PEN ---
    if (tool === 'pen') {
      // Illustrator behavior: Ctrl+Click on empty canvas completes/deselects the active path
      if (e.ctrlKey || e.metaKey) {
        setActivePathId(null);
        setPenPreviewPos(null);
        setSelectedElementIds([]);
        setSelectedNodeInfo(null);
        return;
      }

      if (!activePathId) {
        // Start a new path!
        const newPathId = `path-${Math.random().toString(36).substr(2, 9)}`;
        const newNode: VectorNode = {
          id: `node-${Math.random().toString(36).substr(2, 9)}`,
          anchor: snappedPt,
          type: 'smooth'
        };

        const newElement: PathElement = {
          id: newPathId,
          name: 'Pen Path',
          type: 'path',
          nodes: [newNode],
          closed: false,
          fill: 'none', // pen drawing defaults to clear fill so they can trace over images without obscuring background!
          fillOpacity: 1,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          brushId: activeBrushId || undefined,
          visible: true,
          locked: false
        };

        setLayers(prev =>
          prev.map(layer =>
            layer.id === activeLayerId
              ? { ...layer, elements: [...layer.elements, newElement] }
              : layer
          )
        );

        setActivePathId(newPathId);
        setSelectedElementIds([newPathId]);
        setSelectedNodeInfo({ elementId: newPathId, nodeId: newNode.id });
        setSelectedHandle('anchor');
        setIsDrawingDrag(true);
      } else {
        // Add point to active path
        const currentActivePath = getAllElements().find(el => el.id === activePathId);
        if (!currentActivePath) return;

        // Illustrator behavior: holding Shift snaps position in 45-degree increments from last anchor
        let targetPt = snappedPt;
        if (currentActivePath.nodes.length > 0) {
          const lastNode = currentActivePath.nodes[currentActivePath.nodes.length - 1];
          if (e.shiftKey) {
            targetPt = snapAngle45(lastNode.anchor, snappedPt);
          } else if (snapRightAngle) {
            const snapThreshold = 10 / zoom;
            if (Math.abs(snappedPt.x - lastNode.anchor.x) < snapThreshold) {
              targetPt = { x: lastNode.anchor.x, y: snappedPt.y };
            } else if (Math.abs(snappedPt.y - lastNode.anchor.y) < snapThreshold) {
              targetPt = { x: snappedPt.x, y: lastNode.anchor.y };
            }
          }
        }

        // Check if cursor clicked the first node to close the path
        if (currentActivePath.nodes.length > 2) {
          const firstNode = currentActivePath.nodes[0];
          const distToFirst = distance(targetPt, firstNode.anchor);
          if (distToFirst < 14 / zoom) {
            // Close path and finish!
            setLayers(prev =>
              prev.map(layer => ({
                ...layer,
                elements: layer.elements.map(el =>
                  el.id === activePathId ? { ...el, closed: true } : el
                ),
              }))
            );
            setActivePathId(null);
            setPenPreviewPos(null);
            setIsDrawingDrag(false);
            return;
          }
        }

        // Standard point insertion
        const newNodeId = `node-${Math.random().toString(36).substr(2, 9)}`;
        const newNode: VectorNode = {
          id: newNodeId,
          anchor: targetPt,
          type: 'smooth'
        };

        setLayers(prev =>
          prev.map(layer => ({
            ...layer,
            elements: layer.elements.map(el =>
              el.id === activePathId
                ? { ...el, nodes: [...el.nodes, newNode] }
                : el
            ),
          }))
        );

        setSelectedNodeInfo({ elementId: activePathId, nodeId: newNodeId });
        setSelectedHandle('anchor');
        setIsDrawingDrag(true);
      }
      return;
    }

    // --- TOOL: RECTANGLE / ELLIPSE / TRIANGLE / SPIRAL (Click and drag to size) ---
    if (tool === 'rect' || tool === 'ellipse' || tool === 'triangle' || tool === 'spiral') {
      const elId = `shape-${Math.random().toString(36).substr(2, 9)}`;
      const initialNodes = updateShapeGeometry(
        tool,
        snappedPt,
        snappedPt,
        e.shiftKey,
        e.altKey
      );

      const shapeName =
        tool === 'rect' ? 'Rectangle' :
        tool === 'ellipse' ? 'Ellipse' :
        tool === 'triangle' ? 'Triangle' : 'Spiral';

      const newElement: PathElement = {
        id: elId,
        name: shapeName,
        type: tool === 'triangle' ? 'polygon' : tool,
        nodes: initialNodes,
        closed: true,
        fill: fillColor,
        fillOpacity: fillOpacity,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        visible: true,
        locked: false,
      };

      setLayers(prev =>
        prev.map(layer =>
          layer.id === activeLayerId
            ? { ...layer, elements: [...layer.elements, newElement] }
            : layer
        )
      );

      setIsDrawingShape(true);
      activeShapeIdRef.current = elId;
      shapeDragStartRef.current = snappedPt;
      shapeToolTypeRef.current = tool;
      setSelectedElementIds([elId]);
      return;
    }

    // --- TOOL: TYPE / TEXT (Click canvas to create vector text element) ---
    if (tool === 'text') {
      const textId = `text-${Math.random().toString(36).substr(2, 9)}`;
      const defaultText = 'Vector Text';
      const defaultFamily = fonts[0]?.family || 'Inter';
      const defaultSize = 48;
      const metrics = measureTextBoundingBox(defaultText, defaultSize, defaultFamily, 600, 'normal', 0);
      const w = Math.max(80, metrics.width);
      const h = Math.max(36, metrics.height);

      const initialNodes: VectorNode[] = [
        { id: `node-t-1`, anchor: { x: snappedPt.x, y: snappedPt.y }, type: 'corner' },
        { id: `node-t-2`, anchor: { x: snappedPt.x + w, y: snappedPt.y }, type: 'corner' },
        { id: `node-t-3`, anchor: { x: snappedPt.x + w, y: snappedPt.y + h }, type: 'corner' },
        { id: `node-t-4`, anchor: { x: snappedPt.x, y: snappedPt.y + h }, type: 'corner' },
      ];

      const newElement: PathElement = {
        id: textId,
        name: `Text: ${defaultText}`,
        type: 'text',
        text: defaultText,
        fontSize: defaultSize,
        fontFamily: defaultFamily,
        fontWeight: 600,
        fontStyle: 'normal',
        textAlign: 'left',
        letterSpacing: 0,
        nodes: initialNodes,
        closed: true,
        fill: fillColor === 'none' ? '#111827' : fillColor,
        fillOpacity: 1,
        stroke: strokeWidth > 0 ? strokeColor : 'none',
        strokeWidth: strokeWidth,
        visible: true,
        locked: false,
      };

      setLayers(prev =>
        prev.map(layer =>
          layer.id === activeLayerId
            ? { ...layer, elements: [...layer.elements, newElement] }
            : layer
        )
      );

      setSelectedElementIds([textId]);
      setSelectedNodeInfo(null);
      setExpandToast("Placed text! Customize font, styling, or convert to outlines in Character panel.");
      return;
    }

    // --- TOOL: SELECT & DIRECT-SELECT (Clicking canvas starts Illustrator marquee selection) ---
    if (tool === 'select' || tool === 'direct-select') {
      const rawPos = getCanvasCoords(e);

      if (tool === 'select') {
        setSelectedNodes([]);
        setSelectedNodeInfo(null);
        setSelectedSegment(null);
        selectionStartWithShiftRef.current = e.shiftKey;
        initialSelectedIdsRef.current = e.shiftKey ? [...selectedElementIds] : [];
        if (!e.shiftKey) {
          setSelectedElementIds([]);
        }
      } else {
        // direct-select mode
        setSelectedSegment(null);
        selectionStartWithShiftRef.current = e.shiftKey;
        initialSelectedNodesRef.current = e.shiftKey ? [...selectedNodes] : [];
        if (!e.shiftKey) {
          setSelectedNodes([]);
          setSelectedNodeInfo(null);
          setSelectedElementIds([]);
        }
      }

      setSelectionBox({
        start: rawPos,
        current: rawPos
      });
      setIsDragging(true);
      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
    }
  };

  // --- ILLUSTRATOR-STYLE SCALING HELPER ---
  const getScaleAndOrigin = (
    handle: string,
    dx: number,
    dy: number,
    box: { minX: number; maxX: number; minY: number; maxY: number; width: number; height: number; centerX: number; centerY: number },
    shift: boolean,
    alt: boolean
  ) => {
    let originX = box.centerX;
    let originY = box.centerY;
    let scaleX = 1;
    let scaleY = 1;

    // 1. Determine origin (fixed point)
    if (!alt) {
      if (handle.includes('e')) originX = box.minX;
      else if (handle.includes('w')) originX = box.maxX;

      if (handle.includes('s')) originY = box.minY;
      else if (handle.includes('n')) originY = box.maxY;
    }

    // 2. Calculate raw scale factor based on handle
    const w = Math.max(1, box.width);
    const h = Math.max(1, box.height);

    if (alt) {
      // Scaling from center
      if (handle === 'e') {
        scaleX = (w/2 + dx) / (w/2);
      } else if (handle === 'w') {
        scaleX = (w/2 - dx) / (w/2);
      } else if (handle === 's') {
        scaleY = (h/2 + dy) / (h/2);
      } else if (handle === 'n') {
        scaleY = (h/2 - dy) / (h/2);
      } else if (handle === 'se') {
        scaleX = (w/2 + dx) / (w/2);
        scaleY = (h/2 + dy) / (h/2);
      } else if (handle === 'nw') {
        scaleX = (w/2 - dx) / (w/2);
        scaleY = (h/2 - dy) / (h/2);
      } else if (handle === 'ne') {
        scaleX = (w/2 + dx) / (w/2);
        scaleY = (h/2 - dy) / (h/2);
      } else if (handle === 'sw') {
        scaleX = (w/2 - dx) / (w/2);
        scaleY = (h/2 + dy) / (h/2);
      }
    } else {
      // Standard scaling (from opposite side/corner)
      if (handle === 'e') {
        scaleX = (w + dx) / w;
      } else if (handle === 'w') {
        scaleX = (w - dx) / w;
      } else if (handle === 's') {
        scaleY = (h + dy) / h;
      } else if (handle === 'n') {
        scaleY = (h - dy) / h;
      } else if (handle === 'se') {
        scaleX = (w + dx) / w;
        scaleY = (h + dy) / h;
      } else if (handle === 'nw') {
        scaleX = (w - dx) / w;
        scaleY = (h - dy) / h;
      } else if (handle === 'ne') {
        scaleX = (w + dx) / w;
        scaleY = (h - dy) / h;
      } else if (handle === 'sw') {
        scaleX = (w - dx) / w;
        scaleY = (h + dy) / h;
      }
    }

    // 3. Keep proportional if shift is held
    if (shift) {
      if (handle === 'e' || handle === 'w') {
        scaleY = scaleX;
      } else if (handle === 'n' || handle === 's') {
        scaleX = scaleY;
      } else {
        const scale = (scaleX + scaleY) / 2;
        scaleX = scale;
        scaleY = scale;
      }
    }

    // Avoid scaling to exactly 0 to prevent division by zero or negative flip if not wanted
    if (Math.abs(scaleX) < 0.001) scaleX = 0.001 * Math.sign(scaleX || 1);
    if (Math.abs(scaleY) < 0.001) scaleY = 0.001 * Math.sign(scaleY || 1);

    return { scaleX, scaleY, originX, originY };
  };

  // Drag over Canvas move trackers
  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    // Keep last mouse position updated in container coordinates
    if (canvasContainerRef.current) {
      const rect = canvasContainerRef.current.getBoundingClientRect();
      lastMousePosRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    // If middle-click panning is active, handle it immediately!
    if (isMiddleClickPanning && dragImageStartPos) {
      e.preventDefault();
      const dx = e.clientX - dragStartCanvasPos.x;
      const dy = e.clientY - dragStartCanvasPos.y;

      const newPan = {
        x: dragImageStartPos.x + dx,
        y: dragImageStartPos.y + dy,
      };
      panOffsetRef.current = newPan;
      setPanOffset(newPan);
      return;
    }

    const rawPos = getCanvasCoords(e);
    const snappedPos = getSnappedCanvasCoords(e, activePathId || undefined);

    // Update coordinates showing in pen mode visual guide
    if (activePathId) {
      let preview = snappedPos;
      const currentActivePath = getAllElements().find(el => el.id === activePathId);
      if (currentActivePath && currentActivePath.nodes.length > 0) {
        const lastNode = currentActivePath.nodes[currentActivePath.nodes.length - 1];
        if (e.shiftKey) {
          preview = snapAngle45(lastNode.anchor, snappedPos);
          if (Math.abs(preview.y - lastNode.anchor.y) < 1e-2) {
            setActiveGuides([{ type: 'horizontal', coord: lastNode.anchor.y, minVal: Math.min(lastNode.anchor.x, preview.x) - 50, maxVal: Math.max(lastNode.anchor.x, preview.x) + 50 }]);
            setSnapBadge({ x: preview.x, y: preview.y, text: '0° Horizontal Right Angle' });
          } else if (Math.abs(preview.x - lastNode.anchor.x) < 1e-2) {
            setActiveGuides([{ type: 'vertical', coord: lastNode.anchor.x, minVal: Math.min(lastNode.anchor.y, preview.y) - 50, maxVal: Math.max(lastNode.anchor.y, preview.y) + 50 }]);
            setSnapBadge({ x: preview.x, y: preview.y, text: '90° Vertical Right Angle' });
          } else {
            setActiveGuides([]);
            setSnapBadge({ x: preview.x, y: preview.y, text: '45° Diagonal' });
          }
        } else if (snapRightAngle) {
          const snapThreshold = 10 / zoom;
          if (Math.abs(snappedPos.x - lastNode.anchor.x) < snapThreshold) {
            preview = { x: lastNode.anchor.x, y: snappedPos.y };
            setActiveGuides([{ type: 'vertical', coord: lastNode.anchor.x, minVal: Math.min(lastNode.anchor.y, preview.y) - 50, maxVal: Math.max(lastNode.anchor.y, preview.y) + 50 }]);
            setSnapBadge({ x: preview.x, y: preview.y, text: '90° Vertical (Right Angle)' });
          } else if (Math.abs(snappedPos.y - lastNode.anchor.y) < snapThreshold) {
            preview = { x: snappedPos.x, y: lastNode.anchor.y };
            setActiveGuides([{ type: 'horizontal', coord: lastNode.anchor.y, minVal: Math.min(lastNode.anchor.x, preview.x) - 50, maxVal: Math.max(lastNode.anchor.x, preview.x) + 50 }]);
            setSnapBadge({ x: preview.x, y: preview.y, text: '0° Horizontal (Right Angle)' });
          } else {
            setActiveGuides([]);
            setSnapBadge(null);
          }
        }
      }
      setPenPreviewPos(preview);
    }

    // --- CASE SHAPE DRAG: Sizing shape interactively on drag ---
    if (isDrawingShape && activeShapeIdRef.current && shapeDragStartRef.current && shapeToolTypeRef.current) {
      const currentPos = snappedPos;
      const startPos = shapeDragStartRef.current;
      const shapeType = shapeToolTypeRef.current as 'rect' | 'ellipse' | 'triangle' | 'spiral';
      const updatedNodes = updateShapeGeometry(
        shapeType,
        startPos,
        currentPos,
        e.shiftKey,
        e.altKey
      );

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el =>
            el.id === activeShapeIdRef.current
              ? { ...el, nodes: updatedNodes }
              : el
          ),
        }))
      );
      return;
    }

    // --- CASE 1: Drawing curves interactively while laying Pen Nodes (drag out handles in real time!) ---
    if ((tool === 'pen' || tool === 'anchor-convert') && isDrawingDrag && selectedNodeInfo) {
      // Click-dragging updates the handleOut of the clicked anchor, and mirrors handleIn
      const { elementId, nodeId } = selectedNodeInfo;
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            if (el.id === elementId) {
              return {
                ...el,
                nodes: el.nodes.map(node => {
                  if (node.id === nodeId) {
                    // Illustrator behavior: holding Shift snaps handle angle in 45-degree increments
                    let targetPos = rawPos;
                    if (e.shiftKey) {
                      targetPos = snapAngle45(node.anchor, rawPos);
                    }

                    const dx = targetPos.x - node.anchor.x;
                    const dy = targetPos.y - node.anchor.y;

                    // handleOut follows mouse
                    const handleOut = { x: targetPos.x, y: targetPos.y };

                    // Illustrator behavior: holding Alt breaks symmetry so handleIn is unchanged!
                    if (e.altKey) {
                      return {
                        ...node,
                        handleOut,
                        type: 'corner',
                      };
                    }

                    // Symmetric handleIn
                    const handleIn = { x: node.anchor.x - dx, y: node.anchor.y - dy };

                    return {
                      ...node,
                      handleIn,
                      handleOut,
                      type: 'symmetric',
                    };
                  }
                  return node;
                }),
              };
            }
            return el;
          }),
        }))
      );
      return;
    }

    // --- CASE 2.5: Dragging and bending a path segment ---
    if (tool === 'direct-select' && isDragging && draggedSegment) {
      const { elementId, fromNodeIdx, toNodeIdx, t, startNodes } = draggedSegment;
      const dx = rawPos.x - dragStartCanvasPos.x;
      const dy = rawPos.y - dragStartCanvasPos.y;

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            if (el.id === elementId) {
              const newNodes = [...el.nodes];

              // Fetch the original node states from the start backup
              const fromNodeStart = startNodes[fromNodeIdx];
              const toNodeStart = startNodes[toNodeIdx];
              if (!fromNodeStart?.anchor || !toNodeStart?.anchor) return el;

              // Base anchors are fixed during a segment drag
              const A = fromNodeStart.anchor;
              const B = toNodeStart.anchor;

              // Initialize handle start values if undefined, using anchor as origin
              const h1_start = fromNodeStart.handleOut || { x: A.x, y: A.y };
              const h2_start = toNodeStart.handleIn || { x: B.x, y: B.y };

              // Apply the calculated weighted offset to bend the curve
              // We use 1.33 as the cubic bezier factor for intuitive cursor tracking
              const h1_new = {
                x: h1_start.x + dx * (1 - t) * 1.33,
                y: h1_start.y + dy * (1 - t) * 1.33,
              };

              const h2_new = {
                x: h2_start.x + dx * t * 1.33,
                y: h2_start.y + dy * t * 1.33,
              };

              // Update the node objects inside the array.
              newNodes[fromNodeIdx] = {
                ...newNodes[fromNodeIdx],
                handleOut: h1_new,
                type: newNodes[fromNodeIdx].type === 'corner' ? 'corner' : 'smooth',
              };

              newNodes[toNodeIdx] = {
                ...newNodes[toNodeIdx],
                handleIn: h2_new,
                type: newNodes[toNodeIdx].type === 'corner' ? 'corner' : 'smooth',
              };

              return {
                ...el,
                nodes: newNodes,
              };
            }
            return el;
          }),
        }))
      );
      return;
    }

    // --- CASE 2: Dragging selected anchor point or bezier handle (Node Editor) ---
    if ((tool === 'direct-select' || tool === 'pen') && isDragging && selectedNodeInfo && selectedHandle) {
      const { elementId, nodeId } = selectedNodeInfo;
      const activeEl = getAllElements().find(item => item.id === elementId);
      const nodeIdx = activeEl ? activeEl.nodes.findIndex(n => n.id === nodeId) : -1;
      const prevNode = activeEl && nodeIdx !== -1
        ? (nodeIdx > 0 ? activeEl.nodes[nodeIdx - 1] : (activeEl.closed ? activeEl.nodes[activeEl.nodes.length - 1] : null))
        : null;
      const nextNode = activeEl && nodeIdx !== -1
        ? (nodeIdx < activeEl.nodes.length - 1 ? activeEl.nodes[nodeIdx + 1] : (activeEl.closed ? activeEl.nodes[0] : null))
        : null;
      const initialAnchor = dragStartNodeAnchorRef.current || (activeEl && nodeIdx !== -1 ? activeEl.nodes[nodeIdx].anchor : rawPos);

      let targetAnchor = snappedPos;
      let handleOut = rawPos;
      let handleIn = rawPos;
      const guides: AlignmentGuide[] = [];
      let badgeText = '';

      if (selectedHandle === 'anchor') {
        if (e.shiftKey) {
          // Illustrator Shift: lock strictly to right angles (0°, 90°, 180°, 270°) or 45°
          // Origin: adjacent node if exists, else initial anchor position
          const originPt = prevNode ? prevNode.anchor : (nextNode ? nextNode.anchor : initialAnchor);
          targetAnchor = snapAngle45(originPt, rawPos);

          if (Math.abs(targetAnchor.y - originPt.y) < 1e-2) {
            badgeText = '0° Horizontal Right Angle';
            guides.push({
              type: 'horizontal',
              coord: originPt.y,
              minVal: Math.min(originPt.x, targetAnchor.x) - 100,
              maxVal: Math.max(originPt.x, targetAnchor.x) + 100,
            });
          } else if (Math.abs(targetAnchor.x - originPt.x) < 1e-2) {
            badgeText = '90° Vertical Right Angle';
            guides.push({
              type: 'vertical',
              coord: originPt.x,
              minVal: Math.min(originPt.y, targetAnchor.y) - 100,
              maxVal: Math.max(originPt.y, targetAnchor.y) + 100,
            });
          } else {
            badgeText = '45° Diagonal Snap';
          }
        } else if (snapRightAngle) {
          const snapThreshold = 10 / zoom;
          let snappedX = false;
          let snappedY = false;

          // 1. Magnetic right angle to connected adjacent nodes (so segment becomes 0° or 90° to page axes)
          const adjacentNodes = [prevNode, nextNode].filter(Boolean) as VectorNode[];
          for (const adj of adjacentNodes) {
            if (!snappedX && Math.abs(targetAnchor.x - adj.anchor.x) < snapThreshold) {
              targetAnchor.x = adj.anchor.x;
              snappedX = true;
              badgeText = '90° Vertical Right Angle to Page';
              guides.push({
                type: 'vertical',
                coord: adj.anchor.x,
                minVal: Math.min(adj.anchor.y, targetAnchor.y) - 60,
                maxVal: Math.max(adj.anchor.y, targetAnchor.y) + 60,
              });
            }
            if (!snappedY && Math.abs(targetAnchor.y - adj.anchor.y) < snapThreshold) {
              targetAnchor.y = adj.anchor.y;
              snappedY = true;
              badgeText = badgeText ? '90° Corner Snapped' : '0° Horizontal Right Angle to Page';
              guides.push({
                type: 'horizontal',
                coord: adj.anchor.y,
                minVal: Math.min(adj.anchor.x, targetAnchor.x) - 60,
                maxVal: Math.max(adj.anchor.x, targetAnchor.x) + 60,
              });
            }
          }

          // 2. Right angle to initial position (orthogonal move along X or Y axis)
          if (!snappedX && Math.abs(targetAnchor.x - initialAnchor.x) < snapThreshold) {
            targetAnchor.x = initialAnchor.x;
            snappedX = true;
            badgeText = '90° Axis Lock';
            guides.push({
              type: 'vertical',
              coord: initialAnchor.x,
              minVal: Math.min(initialAnchor.y, targetAnchor.y) - 60,
              maxVal: Math.max(initialAnchor.y, targetAnchor.y) + 60,
            });
          }
          if (!snappedY && Math.abs(targetAnchor.y - initialAnchor.y) < snapThreshold) {
            targetAnchor.y = initialAnchor.y;
            snappedY = true;
            badgeText = badgeText ? '90° Corner Snapped' : '0° Axis Lock';
            guides.push({
              type: 'horizontal',
              coord: initialAnchor.y,
              minVal: Math.min(initialAnchor.x, targetAnchor.x) - 60,
              maxVal: Math.max(initialAnchor.x, targetAnchor.x) + 60,
            });
          }

          // 3. Align with other nodes in the same element
          if ((!snappedX || !snappedY) && activeEl) {
            for (const otherNode of activeEl.nodes) {
              if (otherNode.id === nodeId) continue;
              if (!snappedX && Math.abs(targetAnchor.x - otherNode.anchor.x) < snapThreshold) {
                targetAnchor.x = otherNode.anchor.x;
                snappedX = true;
                badgeText = badgeText || 'Aligned X (90°)';
                guides.push({
                  type: 'vertical',
                  coord: otherNode.anchor.x,
                  minVal: Math.min(otherNode.anchor.y, targetAnchor.y) - 60,
                  maxVal: Math.max(otherNode.anchor.y, targetAnchor.y) + 60,
                });
              }
              if (!snappedY && Math.abs(targetAnchor.y - otherNode.anchor.y) < snapThreshold) {
                targetAnchor.y = otherNode.anchor.y;
                snappedY = true;
                badgeText = badgeText || 'Aligned Y (0°)';
                guides.push({
                  type: 'horizontal',
                  coord: otherNode.anchor.y,
                  minVal: Math.min(otherNode.anchor.x, targetAnchor.x) - 60,
                  maxVal: Math.max(otherNode.anchor.x, targetAnchor.x) + 60,
                });
              }
            }
          }
        }
        setActiveGuides(guides);
        if (badgeText) setSnapBadge({ x: targetAnchor.x, y: targetAnchor.y, text: badgeText });
        else setSnapBadge(null);
      } else if (selectedHandle === 'handleOut') {
        const snapThreshold = 10 / zoom;
        const currentNode = activeEl?.nodes.find(n => n.id === nodeId);
        const anchor = currentNode?.anchor || rawPos;
        if (e.shiftKey) {
          handleOut = snapAngle45(anchor, rawPos);
          if (Math.abs(handleOut.y - anchor.y) < 1e-2) badgeText = '0° Horizontal Handle';
          else if (Math.abs(handleOut.x - anchor.x) < 1e-2) badgeText = '90° Vertical Handle';
          else badgeText = '45° Tangent Angle';
        } else if (snapRightAngle) {
          if (Math.abs(rawPos.y - anchor.y) < snapThreshold) {
            handleOut.y = anchor.y;
            badgeText = '0° Horizontal Handle (Right Angle)';
            guides.push({
              type: 'horizontal',
              coord: anchor.y,
              minVal: Math.min(anchor.x, handleOut.x) - 40,
              maxVal: Math.max(anchor.x, handleOut.x) + 40,
            });
          } else if (Math.abs(rawPos.x - anchor.x) < snapThreshold) {
            handleOut.x = anchor.x;
            badgeText = '90° Vertical Handle (Right Angle)';
            guides.push({
              type: 'vertical',
              coord: anchor.x,
              minVal: Math.min(anchor.y, handleOut.y) - 40,
              maxVal: Math.max(anchor.y, handleOut.y) + 40,
            });
          }
        }
        setActiveGuides(guides);
        if (badgeText) setSnapBadge({ x: handleOut.x, y: handleOut.y, text: badgeText });
        else setSnapBadge(null);
      } else if (selectedHandle === 'handleIn') {
        const snapThreshold = 10 / zoom;
        const currentNode = activeEl?.nodes.find(n => n.id === nodeId);
        const anchor = currentNode?.anchor || rawPos;
        if (e.shiftKey) {
          handleIn = snapAngle45(anchor, rawPos);
          if (Math.abs(handleIn.y - anchor.y) < 1e-2) badgeText = '0° Horizontal Handle';
          else if (Math.abs(handleIn.x - anchor.x) < 1e-2) badgeText = '90° Vertical Handle';
          else badgeText = '45° Tangent Angle';
        } else if (snapRightAngle) {
          if (Math.abs(rawPos.y - anchor.y) < snapThreshold) {
            handleIn.y = anchor.y;
            badgeText = '0° Horizontal Handle (Right Angle)';
            guides.push({
              type: 'horizontal',
              coord: anchor.y,
              minVal: Math.min(anchor.x, handleIn.x) - 40,
              maxVal: Math.max(anchor.x, handleIn.x) + 40,
            });
          } else if (Math.abs(rawPos.x - anchor.x) < snapThreshold) {
            handleIn.x = anchor.x;
            badgeText = '90° Vertical Handle (Right Angle)';
            guides.push({
              type: 'vertical',
              coord: anchor.x,
              minVal: Math.min(anchor.y, handleIn.y) - 40,
              maxVal: Math.max(anchor.y, handleIn.y) + 40,
            });
          }
        }
        setActiveGuides(guides);
        if (badgeText) setSnapBadge({ x: handleIn.x, y: handleIn.y, text: badgeText });
        else setSnapBadge(null);
      }

      const targetNode = activeEl?.nodes.find(n => n.id === nodeId);
      const prevAnchor = targetNode ? targetNode.anchor : targetAnchor;
      const dx = targetAnchor.x - prevAnchor.x;
      const dy = targetAnchor.y - prevAnchor.y;

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            const hasSelectedNode = el.nodes.some(n => isNodeSelected(el.id, n.id));
            if (!hasSelectedNode && el.id !== elementId) return el;

            return {
              ...el,
              nodes: el.nodes.map(node => {
                if (selectedHandle === 'anchor') {
                  const nodeSelected = isNodeSelected(el.id, node.id);
                  if (nodeSelected) {
                    const newAnchor = node.id === nodeId ? targetAnchor : { x: node.anchor.x + dx, y: node.anchor.y + dy };
                    const updatedHandleIn = node.handleIn
                      ? { x: node.handleIn.x + dx, y: node.handleIn.y + dy }
                      : undefined;
                    const updatedHandleOut = node.handleOut
                      ? { x: node.handleOut.x + dx, y: node.handleOut.y + dy }
                      : undefined;

                    return {
                      ...node,
                      anchor: newAnchor,
                      handleIn: updatedHandleIn,
                      handleOut: updatedHandleOut,
                    };
                  }
                  return node;
                }

                if (el.id === elementId && node.id === nodeId) {
                  if (selectedHandle === 'handleOut') {
                    const hdx = handleOut.x - node.anchor.x;
                    const hdy = handleOut.y - node.anchor.y;

                    let updateIn = node.handleIn;
                    if (!e.altKey && node.type === 'symmetric') {
                      updateIn = { x: node.anchor.x - hdx, y: node.anchor.y - hdy };
                    } else if (!e.altKey && node.type === 'smooth' && node.handleIn) {
                      const distIn = distance(node.anchor, node.handleIn);
                      const angle = Math.atan2(hdy, hdx) + Math.PI;
                      updateIn = {
                        x: node.anchor.x + Math.cos(angle) * distIn,
                        y: node.anchor.y + Math.sin(angle) * distIn,
                      };
                    }

                    return {
                      ...node,
                      handleOut,
                      handleIn: updateIn,
                      type: e.altKey ? 'corner' : node.type,
                    };
                  } else if (selectedHandle === 'handleIn') {
                    const hdx = handleIn.x - node.anchor.x;
                    const hdy = handleIn.y - node.anchor.y;

                    let updateOut = node.handleOut;
                    if (!e.altKey && node.type === 'symmetric') {
                      updateOut = { x: node.anchor.x - hdx, y: node.anchor.y - hdy };
                    } else if (!e.altKey && node.type === 'smooth' && node.handleOut) {
                      const distOut = distance(node.anchor, node.handleOut);
                      const angle = Math.atan2(hdy, hdx) + Math.PI;
                      updateOut = {
                        x: node.anchor.x + Math.cos(angle) * distOut,
                        y: node.anchor.y + Math.sin(angle) * distOut,
                      };
                    }

                    return {
                      ...node,
                      handleIn,
                      handleOut: updateOut,
                      type: e.altKey ? 'corner' : node.type,
                    };
                  }
                }
                return node;
              }),
            };
          }),
        }))
      );
      return;
    }

    // --- CASE 3: Dragging entire selected element to move / scale (Transform editor) ---
    if ((tool === 'select' || tool === 'direct-select') && isDragging && selectedElementIds.length > 0 && !selectionBox && !selectedHandle && !draggedSegment) {
      const currentMouseScreen = { x: e.clientX, y: e.clientY };
      const rawDelta = {
        x: (currentMouseScreen.x - dragStartCanvasPos.x) / zoom,
        y: (currentMouseScreen.y - dragStartCanvasPos.y) / zoom,
      };

      let adjustedDeltaX = rawDelta.x;
      let adjustedDeltaY = rawDelta.y;
      const guides: AlignmentGuide[] = [];

      const otherEls = getAllElements().filter(el => !selectedElementIds.includes(el.id) && el.visible);
      if (otherEls.length > 0 && selectedElementIds.length > 0) {
        const selectedElsBackup = dragStartElementsBackup.filter(el => selectedElementIds.includes(el.id));
        if (selectedElsBackup.length > 0) {
          const startBox = getCombinedBoundingBox(selectedElsBackup);
          const otherBoxes = otherEls.map(el => getElementBoundingBox(el));
          
          const snapThreshold = 8 / zoom;

          // Find vertical alignment (adjusting X)
          let bestXAdjustment = 0;
          let minDiffX = snapThreshold;
          let targetXForGuide = null;
          let guideYRange = { min: startBox.minY + rawDelta.y, max: startBox.maxY + rawDelta.y };

          const activeXs = [
            { val: startBox.minX + rawDelta.x, ref: 'left' },
            { val: startBox.centerX + rawDelta.x, ref: 'center' },
            { val: startBox.maxX + rawDelta.x, ref: 'right' }
          ];

          otherBoxes.forEach(ob => {
            const obXs = [
              { val: ob.minX, ref: 'left' },
              { val: ob.centerX, ref: 'center' },
              { val: ob.maxX, ref: 'right' }
            ];
            activeXs.forEach(ax => {
              obXs.forEach(ox => {
                const diff = ax.val - ox.val;
                if (Math.abs(diff) < minDiffX) {
                  minDiffX = Math.abs(diff);
                  bestXAdjustment = -diff; // we need to subtract diff to make them equal
                  targetXForGuide = ox.val;
                  guideYRange.min = Math.min(guideYRange.min, ob.minY, startBox.minY + rawDelta.y);
                  guideYRange.max = Math.max(guideYRange.max, ob.maxY, startBox.maxY + rawDelta.y);
                }
              });
            });
          });

          if (targetXForGuide !== null) {
            adjustedDeltaX += bestXAdjustment;
            guides.push({
              type: 'vertical',
              coord: targetXForGuide,
              minVal: guideYRange.min,
              maxVal: guideYRange.max
            });
          }

          // Find horizontal alignment (adjusting Y)
          let bestYAdjustment = 0;
          let minDiffY = snapThreshold;
          let targetYForGuide = null;
          let guideXRange = { min: startBox.minX + rawDelta.x, max: startBox.maxX + rawDelta.x };

          const activeYs = [
            { val: startBox.minY + rawDelta.y, ref: 'top' },
            { val: startBox.centerY + rawDelta.y, ref: 'center' },
            { val: startBox.maxY + rawDelta.y, ref: 'bottom' }
          ];

          otherBoxes.forEach(ob => {
            const obYs = [
              { val: ob.minY, ref: 'top' },
              { val: ob.centerY, ref: 'center' },
              { val: ob.maxY, ref: 'bottom' }
            ];
            activeYs.forEach(ay => {
              obYs.forEach(oy => {
                const diff = ay.val - oy.val;
                if (Math.abs(diff) < minDiffY) {
                  minDiffY = Math.abs(diff);
                  bestYAdjustment = -diff;
                  targetYForGuide = oy.val;
                  guideXRange.min = Math.min(guideXRange.min, ob.minX, startBox.minX + rawDelta.x);
                  guideXRange.max = Math.max(guideXRange.max, ob.maxX, startBox.maxX + rawDelta.x);
                }
              });
            });
          });

          if (targetYForGuide !== null) {
            adjustedDeltaY += bestYAdjustment;
            guides.push({
              type: 'horizontal',
              coord: targetYForGuide,
              minVal: guideXRange.min,
              maxVal: guideXRange.max
            });
          }
        }
      }

      if (e.shiftKey) {
        // Constrain movement strictly to horizontal or vertical right angles to the page
        if (Math.abs(adjustedDeltaX) > Math.abs(adjustedDeltaY)) {
          adjustedDeltaY = 0;
          setSnapBadge({ x: e.clientX, y: e.clientY, text: '0° Horizontal Axis Lock' });
        } else {
          adjustedDeltaX = 0;
          setSnapBadge({ x: e.clientX, y: e.clientY, text: '90° Vertical Axis Lock' });
        }
      }

      currentDragDeltaRef.current = { x: adjustedDeltaX, y: adjustedDeltaY };
      setActiveGuides(guides);

      // Limit moving to valid translation delta. Map previous states
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            const backup = dragStartElementsBackup.find(b => b.id === el.id);
            if (backup && selectedElementIds.includes(el.id)) {
              // Offset all node anchors and handles
              return {
                ...el,
                nodes: backup.nodes.map(node => ({
                  ...node,
                  anchor: { x: node.anchor.x + adjustedDeltaX, y: node.anchor.y + adjustedDeltaY },
                  handleIn: node.handleIn
                    ? { x: node.handleIn.x + adjustedDeltaX, y: node.handleIn.y + adjustedDeltaY }
                    : undefined,
                  handleOut: node.handleOut
                    ? { x: node.handleOut.x + adjustedDeltaX, y: node.handleOut.y + adjustedDeltaY }
                    : undefined,
                })),
              };
            }
            return el;
          }),
        }))
      );
      return;
    }

    // --- CASE 3.5: Resizing/Transforming elements using bounding box handles ---
    if (tool === 'select' && isResizing && resizingHandle && resizeStartBox) {
      const currentMouseScreen = { x: e.clientX, y: e.clientY };
      const rawDeltaX = (currentMouseScreen.x - dragStartCanvasPos.x) / zoom;
      const rawDeltaY = (currentMouseScreen.y - dragStartCanvasPos.y) / zoom;

      // Snapping during resize:
      let adjustedDx = rawDeltaX;
      let adjustedDy = rawDeltaY;
      const guides: AlignmentGuide[] = [];

      const otherEls = getAllElements().filter(el => !selectedElementIds.includes(el.id) && el.visible);
      if (otherEls.length > 0 && selectedElementIds.length > 0) {
        const otherBoxes = otherEls.map(el => getElementBoundingBox(el));
        const snapThreshold = 8 / zoom;

        // Check if we are dragging a handle that affects X
        if (resizingHandle.includes('e') || resizingHandle.includes('w')) {
          const activeX = resizingHandle.includes('e') ? resizeStartBox.maxX + rawDeltaX : resizeStartBox.minX + rawDeltaX;
          let bestXAdjustment = 0;
          let minDiffX = snapThreshold;
          let targetXForGuide = null;
          let guideYRange = { min: resizeStartBox.minY, max: resizeStartBox.maxY };

          otherBoxes.forEach(ob => {
            const obXs = [ob.minX, ob.centerX, ob.maxX];
            obXs.forEach(ox => {
              const diff = activeX - ox;
              if (Math.abs(diff) < minDiffX) {
                minDiffX = Math.abs(diff);
                bestXAdjustment = -diff;
                targetXForGuide = ox;
                guideYRange.min = Math.min(guideYRange.min, ob.minY, resizeStartBox.minY);
                guideYRange.max = Math.max(guideYRange.max, ob.maxY, resizeStartBox.maxY);
              }
            });
          });

          if (targetXForGuide !== null) {
            adjustedDx += bestXAdjustment;
            guides.push({
              type: 'vertical',
              coord: targetXForGuide,
              minVal: guideYRange.min,
              maxVal: guideYRange.max
            });
          }
        }

        // Check if we are dragging a handle that affects Y
        if (resizingHandle.includes('s') || resizingHandle.includes('n')) {
          const activeY = resizingHandle.includes('s') ? resizeStartBox.maxY + rawDeltaY : resizeStartBox.minY + rawDeltaY;
          let bestYAdjustment = 0;
          let minDiffY = snapThreshold;
          let targetYForGuide = null;
          let guideXRange = { min: resizeStartBox.minX, max: resizeStartBox.maxX };

          otherBoxes.forEach(ob => {
            const obYs = [ob.minY, ob.centerY, ob.maxY];
            obYs.forEach(oy => {
              const diff = activeY - oy;
              if (Math.abs(diff) < minDiffY) {
                minDiffY = Math.abs(diff);
                bestYAdjustment = -diff;
                targetYForGuide = oy;
                guideXRange.min = Math.min(guideXRange.min, ob.minX, resizeStartBox.minX);
                guideXRange.max = Math.max(guideXRange.max, ob.maxX, resizeStartBox.maxX);
              }
            });
          });

          if (targetYForGuide !== null) {
            adjustedDy += bestYAdjustment;
            guides.push({
              type: 'horizontal',
              coord: targetYForGuide,
              minVal: guideXRange.min,
              maxVal: guideXRange.max
            });
          }
        }
      }

      setActiveGuides(guides);

      // Perform scaling transformation relative to origin using scaleX and scaleY
      const { scaleX, scaleY, originX, originY } = getScaleAndOrigin(
        resizingHandle,
        adjustedDx,
        adjustedDy,
        resizeStartBox,
        e.shiftKey,
        e.altKey
      );

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            const backup = dragStartElementsBackup.find(b => b.id === el.id);
            if (backup && selectedElementIds.includes(el.id)) {
              // Scale nodes relative to origin
              return {
                ...el,
                fontSize: el.type === 'text' && backup.fontSize
                  ? Math.max(8, Math.round(backup.fontSize * Math.abs(scaleY)))
                  : el.fontSize,
                nodes: backup.nodes.map(node => {
                  const scalePoint = (p: Point) => ({
                    x: originX + (p.x - originX) * scaleX,
                    y: originY + (p.y - originY) * scaleY,
                  });

                  return {
                    ...node,
                    anchor: scalePoint(node.anchor),
                    handleIn: node.handleIn ? scalePoint(node.handleIn) : undefined,
                    handleOut: node.handleOut ? scalePoint(node.handleOut) : undefined,
                  };
                }),
              };
            }
            return el;
          }),
        }))
      );
      return;
    }

    // --- CASE 4: Dragging Tracing Reference Image positions ---
    if (isDragging && dragImageStartPos && tracingImage && !tracingImage.locked) {
      if (e.shiftKey || tool === 'eraser') {
        // We can let them pan background if they hold shift
      } else {
        const currentMouseScreen = { x: e.clientX, y: e.clientY };
        const dx = (currentMouseScreen.x - dragStartCanvasPos.x) / zoom;
        const dy = (currentMouseScreen.y - dragStartCanvasPos.y) / zoom;

        setTracingImage(prev =>
          prev
            ? {
                ...prev,
                x: (dragImageStartPos.x || 0) + dx,
                y: (dragImageStartPos.y || 0) + dy,
              }
            : null
        );
        return;
      }
    }

    // --- CASE 5: Marquee Selection Box (Illustrator style) ---
    if ((tool === 'select' || tool === 'direct-select') && isDragging && selectionBox) {
      const currentRaw = getCanvasCoords(e);
      const updatedBox = { ...selectionBox, current: currentRaw };
      setSelectionBox(updatedBox);

      // Calculate bounds of selection box
      const xMin = Math.min(updatedBox.start.x, updatedBox.current.x);
      const xMax = Math.max(updatedBox.start.x, updatedBox.current.x);
      const yMin = Math.min(updatedBox.start.y, updatedBox.current.y);
      const yMax = Math.max(updatedBox.start.y, updatedBox.current.y);

      if (tool === 'select') {
        // Find all elements within layer(s) that intersect this box
        const intersectingElIds = getAllElements()
          .filter(el => {
            if (!el.visible || el.locked) return false;
            const box = getElementBoundingBox(el);
            // Standard box intersection test:
            return !(box.maxX < xMin || box.minX > xMax || box.maxY < yMin || box.minY > yMax);
          })
          .map(el => el.id);

        const baseIds = selectionStartWithShiftRef.current ? initialSelectedIdsRef.current : [];
        const combined = Array.from(new Set([...baseIds, ...intersectingElIds]));
        setSelectedElementIds(combined);
      } else {
        // tool === 'direct-select'
        // Highlight & select all anchor nodes inside the selection marquee
        const matchedNodes: Array<{ elementId: string; nodeId: string }> = [];
        const matchedElementIds = new Set<string>();

        getAllElements().forEach(el => {
          if (!el.visible || el.locked || !el.nodes) return;
          el.nodes.forEach(node => {
            if (!node || !node.anchor) return;
            if (
              node.anchor.x >= xMin &&
              node.anchor.x <= xMax &&
              node.anchor.y >= yMin &&
              node.anchor.y <= yMax
            ) {
              matchedNodes.push({ elementId: el.id, nodeId: node.id });
              matchedElementIds.add(el.id);
            }
          });
        });

        const baseNodes = selectionStartWithShiftRef.current ? initialSelectedNodesRef.current : [];
        const combinedNodes = [...baseNodes];
        matchedNodes.forEach(m => {
          if (!combinedNodes.some(b => b.elementId === m.elementId && b.nodeId === m.nodeId)) {
            combinedNodes.push(m);
          }
        });

        setSelectedNodes(combinedNodes);
        if (combinedNodes.length > 0) {
          setSelectedNodeInfo(combinedNodes[combinedNodes.length - 1]);
          const baseElIds = selectionStartWithShiftRef.current ? selectedElementIds : [];
          setSelectedElementIds(Array.from(new Set([...baseElIds, ...Array.from(matchedElementIds)])));
        } else {
          setSelectedNodeInfo(null);
          if (!selectionStartWithShiftRef.current) {
            setSelectedElementIds([]);
          }
        }
      }
    }

    // --- Segment Hover Preview in Pen & Add Anchor Mode ---
    if (!isDragging && !isDrawingDrag && !isDrawingShape && !isResizing && (tool === 'pen' || tool === 'add-anchor')) {
      const activeOrSelectedEls = getAllElements().filter(
        el => !el.locked && el.visible && (selectedElementIds.includes(el.id) || el.id === activePathId || tool === 'add-anchor')
      );
      let foundHover: { elementId: string; fromIdx: number; toIdx: number; point: Point } | null = null;
      for (const el of activeOrSelectedEls) {
        if (el.nodes.length >= 2) {
          const nearest = findNearestSegmentOnElement(el, rawPos, 14 / zoom);
          if (nearest) {
            foundHover = {
              elementId: el.id,
              fromIdx: nearest.segmentIdx,
              toIdx: nearest.nextSegmentIdx,
              point: nearest.projection,
            };
            break;
          }
        }
      }
      setSegmentHoverPreview(foundHover);
    } else if (segmentHoverPreview) {
      setSegmentHoverPreview(null);
    }
  };

  const handleCanvasMouseUp = () => {
    // Check if dragging to create shape is active and finalize it
    if (isDrawingShape && activeShapeIdRef.current && shapeDragStartRef.current && shapeToolTypeRef.current) {
      const startPos = shapeDragStartRef.current;
      const el = getAllElements().find(v => v.id === activeShapeIdRef.current);
      if (el) {
        const box = getElementBoundingBox(el);
        // If the user just clicked without dragging (tiny box < 6px), generate standard 80x80 shape
        if (box.width < 6 && box.height < 6) {
          const defaultSize = 80;
          const defaultNodes = updateShapeGeometry(
            shapeToolTypeRef.current as any,
            { x: startPos.x - defaultSize / 2, y: startPos.y - defaultSize / 2 },
            { x: startPos.x + defaultSize / 2, y: startPos.y + defaultSize / 2 },
            false,
            false
          );
          setLayers(prev =>
            prev.map(layer => ({
              ...layer,
              elements: layer.elements.map(item =>
                item.id === activeShapeIdRef.current
                  ? { ...item, nodes: defaultNodes }
                  : item
              ),
            }))
          );
        }
      }

      setIsDrawingShape(false);
      activeShapeIdRef.current = null;
      shapeDragStartRef.current = null;
      shapeToolTypeRef.current = null;
      setTool('select');
    }

    // Check if layers changed during interaction and save starting state to undo stack
    if (layersBeforeInteractionRef.current) {
      if (JSON.stringify(layers) !== JSON.stringify(layersBeforeInteractionRef.current)) {
        pushHistory(layersBeforeInteractionRef.current);
      }
      layersBeforeInteractionRef.current = null;
    }

    if (tool === 'select' && isDragging && selectedElementIds.length > 0) {
      const delta = currentDragDeltaRef.current;
      if (Math.abs(delta.x) > 0.5 || Math.abs(delta.y) > 0.5) {
        setLastTransform({
          type: 'move',
          dx: delta.x,
          dy: delta.y,
        });
      }
    }
    setIsDragging(false);
    setIsDrawingDrag(false);
    setSelectedHandle(null);
    setDragImageStartPos(null);
    setDraggedSegment(null);
    setIsResizing(false);
    setResizingHandle(null);
    setResizeStartBox(null);
    setActiveGuides([]);
    setSnapBadge(null);
    dragStartNodeAnchorRef.current = null;
    setIsMiddleClickPanning(false);
    setSelectionBox(null);
  };

  // --- DOUBLE CLICK TO TOGGLE SMOOTH / CORNER NODE CONVERSION (ILLUSTRATOR STYLE) ---
  const handleSharpenNode = (elementId: string, nodeId: string) => {
    pushHistory(layers);
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (el.id === elementId) {
            const nodeIdx = el.nodes.findIndex(n => n.id === nodeId);
            if (nodeIdx === -1) return el;
            const node = el.nodes[nodeIdx];

            const hasHandles = !!(node.handleIn || node.handleOut);
            if (hasHandles) {
              // Smooth -> Corner: remove handles
              return {
                ...el,
                nodes: el.nodes.map(n =>
                  n.id === nodeId
                    ? { ...n, handleIn: undefined, handleOut: undefined, type: 'corner' }
                    : n
                ),
              };
            } else {
              // Corner -> Smooth: calculate smooth tangent handles from neighboring nodes
              const prevNode = nodeIdx > 0
                ? el.nodes[nodeIdx - 1]
                : el.closed && el.nodes.length > 2 ? el.nodes[el.nodes.length - 1] : null;
              const nextNode = nodeIdx < el.nodes.length - 1
                ? el.nodes[nodeIdx + 1]
                : el.closed && el.nodes.length > 2 ? el.nodes[0] : null;

              let handleIn: Point | undefined = undefined;
              let handleOut: Point | undefined = undefined;

              if (prevNode && nextNode) {
                const dx = nextNode.anchor.x - prevNode.anchor.x;
                const dy = nextNode.anchor.y - prevNode.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const d1 = distance(node.anchor, prevNode.anchor);
                const d2 = distance(node.anchor, nextNode.anchor);
                const handleLen = Math.max(15, Math.min(d1, d2) * 0.35);

                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;

                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
              } else if (nextNode) {
                const dx = nextNode.anchor.x - node.anchor.x;
                const dy = nextNode.anchor.y - node.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const handleLen = Math.max(15, len * 0.35);
                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
              } else if (prevNode) {
                const dx = node.anchor.x - prevNode.anchor.x;
                const dy = node.anchor.y - prevNode.anchor.y;
                const len = Math.hypot(dx, dy) || 1;
                const handleLen = Math.max(15, len * 0.35);
                const ux = (dx / len) * handleLen;
                const uy = (dy / len) * handleLen;
                handleIn = { x: node.anchor.x - ux, y: node.anchor.y - uy };
                handleOut = { x: node.anchor.x + ux, y: node.anchor.y + uy };
              } else {
                handleIn = { x: node.anchor.x - 30, y: node.anchor.y };
                handleOut = { x: node.anchor.x + 30, y: node.anchor.y };
              }

              return {
                ...el,
                nodes: el.nodes.map(n =>
                  n.id === nodeId
                    ? { ...n, handleIn, handleOut, type: 'smooth' }
                    : n
                ),
              };
            }
          }
          return el;
        }),
      }))
    );
  };

  const handleSegmentMouseDown = (
    e: React.MouseEvent,
    elId: string,
    fromIdx: number,
    toIdx: number,
    fromNode: VectorNode,
    toNode: VectorNode
  ) => {
    if (e.button === 1) return; // Allow middle-click to bubble to canvas for panning
    if (e.button !== 0) return; // Only left-click starts dragging

    // Save starting state for undo/redo
    layersBeforeInteractionRef.current = JSON.parse(JSON.stringify(layers));

    e.stopPropagation();

    // In Pen or Add-Anchor mode, clicking a segment inserts a new anchor node!
    if (tool === 'pen' || tool === 'add-anchor') {
      const canvasPos = getCanvasCoords(e);
      handleAddNodeToSegment(elId, fromIdx, toIdx, canvasPos);
      return;
    }

    // Ensure we are in direct-select tool to bend curves
    if (tool !== 'direct-select') {
      setTool('direct-select');
    }

    // Select the element if not already selected
    if (!selectedElementIds.includes(elId)) {
      setSelectedElementIds([elId]);
    }

    // In direct-select mode, mark this segment and its bounding nodes as selected
    setSelectedSegment({ elementId: elId, fromIdx, toIdx });
    setSelectedNodes([
      { elementId: elId, nodeId: fromNode.id },
      { elementId: elId, nodeId: toNode.id }
    ]);
    setSelectedNodeInfo({ elementId: elId, nodeId: toNode.id });
    setSelectedHandle(null);

    const canvasPos = getCanvasCoords(e);
    
    // Find the actual element
    const allEls = getAllElements();
    const el = allEls.find(item => item.id === elId);
    if (!el) return;

    // Calculate approximate parameter t along the clicked segment
    const distA = distance(fromNode.anchor, canvasPos);
    const distB = distance(toNode.anchor, canvasPos);
    const t = Math.max(0.15, Math.min(0.85, distA / (distA + distB || 1)));

    setDraggedSegment({
      elementId: elId,
      fromNodeIdx: fromIdx,
      toNodeIdx: toIdx,
      t,
      startNodes: JSON.parse(JSON.stringify(el.nodes)),
    });

    setDragStartCanvasPos(canvasPos);
    setIsDragging(true);
  };

  // --- NODE ELEMENT CLICKS (Anchor selection & Handle Grab starting) ---
  const handleNodeMouseDown = (
    e: React.MouseEvent,
    elementId: string,
    nodeId: string,
    handleType: 'anchor' | 'handleIn' | 'handleOut'
  ) => {
    if (e.button === 1) return; // Allow middle-click to bubble to canvas for panning
    if (e.button !== 0) return; // Only left-click starts dragging

    // Save starting state for undo/redo
    layersBeforeInteractionRef.current = JSON.parse(JSON.stringify(layers));

    e.stopPropagation(); // prevent background canvas drags

    // Illustrator behavior: Ctrl/Cmd + click directly selects node without exiting Pen tool
    if (e.ctrlKey || e.metaKey) {
      setSelectedElementIds([elementId]);
      setSelectedNodeInfo({ elementId, nodeId });
      setSelectedHandle(handleType);
      setIsDragging(true);
      const raw = getCanvasCoords(e as any);
      setDragStartCanvasPos({ x: raw.x, y: raw.y });
      const el = getAllElements().find(item => item.id === elementId);
      const targetNode = el?.nodes.find(n => n.id === nodeId);
      if (targetNode) {
        dragStartNodeAnchorRef.current = { ...targetNode.anchor };
      }
      return;
    }

    // Illustrator behavior: Alt + click converts anchor (retracts handles if present, or prepares to drag new handles)
    if (tool === 'pen' && e.altKey) {
      if (handleType === 'anchor') {
        const el = getAllElements().find(item => item.id === elementId);
        const targetNode = el?.nodes.find(n => n.id === nodeId);
        if (targetNode) {
          if (targetNode.handleIn || targetNode.handleOut) {
            setLayers(prev =>
              prev.map(layer => ({
                ...layer,
                elements: layer.elements.map(item =>
                  item.id === elementId
                    ? {
                        ...item,
                        nodes: item.nodes.map(n =>
                          n.id === nodeId
                            ? { ...n, handleIn: undefined, handleOut: undefined, type: 'corner' }
                            : n
                        ),
                      }
                    : item
                ),
              }))
            );
          }
          setSelectedElementIds([elementId]);
          setSelectedNodeInfo({ elementId, nodeId });
          setSelectedHandle('handleOut');
          setIsDrawingDrag(true);
          return;
        }
      } else if (handleType === 'handleIn' || handleType === 'handleOut') {
        // Alt-dragging an existing handle converts anchor to corner and moves that handle independently
        setSelectedElementIds([elementId]);
        setSelectedNodeInfo({ elementId, nodeId });
        setSelectedHandle(handleType);
        setIsDragging(true);
        const raw = getCanvasCoords(e as any);
        setDragStartCanvasPos({ x: raw.x, y: raw.y });
        setLayers(prev =>
          prev.map(layer => ({
            ...layer,
            elements: layer.elements.map(item =>
              item.id === elementId
                ? {
                    ...item,
                    nodes: item.nodes.map(n =>
                      n.id === nodeId ? { ...n, type: 'corner' } : n
                    ),
                  }
                : item
            ),
          }))
        );
        return;
      }
    }

    if (tool === 'pen') {
      const el = getAllElements().find(item => item.id === elementId);
      if (el && !el.closed) {
        const isStartNode = el.nodes[0].id === nodeId;
        const isEndNode = el.nodes[el.nodes.length - 1].id === nodeId;

        // If clicking last anchor of active path without Alt, retract handleOut so next segment is sharp!
        if (activePathId === elementId && isEndNode && handleType === 'anchor') {
          setLayers(prev =>
            prev.map(layer => ({
              ...layer,
              elements: layer.elements.map(item =>
                item.id === elementId
                  ? {
                      ...item,
                      nodes: item.nodes.map(n =>
                        n.id === nodeId ? { ...n, handleOut: undefined, type: 'corner' } : n
                      ),
                    }
                  : item
              ),
            }))
          );
          return;
        }

        if (isStartNode || isEndNode) {
          // If we clicked the start node of the ACTIVE path, close it!
          if (activePathId === elementId && isStartNode && el.nodes.length > 2) {
            setLayers(prev =>
              prev.map(layer => ({
                ...layer,
                elements: layer.elements.map(item =>
                  item.id === activePathId ? { ...item, closed: true } : item
                ),
              }))
            );
            setActivePathId(null);
            setPenPreviewPos(null);
            setIsDrawingDrag(false);
            return;
          }

          // Otherwise, we want to resume drawing/building from this endpoint!
          if (isStartNode) {
            // Reverse nodes array so we always append to the end of the array
            setLayers(prev =>
              prev.map(layer => ({
                ...layer,
                elements: layer.elements.map(item => {
                  if (item.id === elementId) {
                    return {
                      ...item,
                      nodes: [...item.nodes].reverse().map(node => ({
                        ...node,
                        handleIn: node.handleOut,
                        handleOut: node.handleIn,
                      })),
                    };
                  }
                  return item;
                }),
              }))
            );
          }

          setActivePathId(elementId);
          setSelectedElementIds([elementId]);
          setSelectedNodeInfo({ elementId, nodeId });
          setSelectedHandle('anchor');
          setIsDrawingDrag(true);
          return;
        }
      }
    }

    // Delete Anchor Point Tool:
    if (tool === 'delete-anchor') {
      if (handleType === 'anchor') {
        handleDeleteNode(elementId, nodeId);
      }
      return;
    }

    // Anchor Point Tool (Convert Anchor / Shift+C):
    if (tool === 'anchor-convert') {
      if (handleType === 'anchor') {
        const el = getAllElements().find(item => item.id === elementId);
        const targetNode = el?.nodes.find(n => n.id === nodeId);
        if (targetNode) {
          if (targetNode.handleIn || targetNode.handleOut) {
            handleConvertNode(elementId, nodeId, 'corner');
          }
          setSelectedElementIds([elementId]);
          setSelectedNodeInfo({ elementId, nodeId });
          setSelectedHandle('handleOut');
          setIsDrawingDrag(true);
          return;
        }
      } else if (handleType === 'handleIn' || handleType === 'handleOut') {
        setSelectedElementIds([elementId]);
        setSelectedNodeInfo({ elementId, nodeId });
        setSelectedHandle(handleType);
        setIsDragging(true);
        const raw = getCanvasCoords(e as any);
        setDragStartCanvasPos({ x: raw.x, y: raw.y });
        setLayers(prev =>
          prev.map(layer => ({
            ...layer,
            elements: layer.elements.map(item =>
              item.id === elementId
                ? {
                    ...item,
                    nodes: item.nodes.map(n =>
                      n.id === nodeId ? { ...n, type: 'corner' } : n
                    ),
                  }
                : item
            ),
          }))
        );
        return;
      }
    }

    // Pen Tool: clicking an existing anchor when not actively drawing deletes the anchor
    if (tool === 'pen' && handleType === 'anchor' && !activePathId) {
      handleDeleteNode(elementId, nodeId);
      return;
    }

    if (tool !== 'direct-select' && tool !== 'pen' && tool !== 'add-anchor') {
      // Toggle back to direct select tool if they clicked individual nodes
      setTool('direct-select');
    }

    if (e.shiftKey) {
      setSelectedNodes(prev => {
        const exists = prev.some(n => n.elementId === elementId && n.nodeId === nodeId);
        if (exists) {
          return prev.filter(n => !(n.elementId === elementId && n.nodeId === nodeId));
        } else {
          return [...prev, { elementId, nodeId }];
        }
      });
      setSelectedElementIds(prev => (prev.includes(elementId) ? prev : [...prev, elementId]));
    } else {
      setSelectedNodes(prev => {
        const exists = prev.some(n => n.elementId === elementId && n.nodeId === nodeId);
        return exists ? prev : [{ elementId, nodeId }];
      });
      if (!selectedElementIds.includes(elementId)) {
        setSelectedElementIds([elementId]);
      }
    }

    setSelectedNodeInfo({ elementId, nodeId });
    setSelectedSegment(null);
    setSelectedHandle(handleType);
    setIsDragging(true);

    const raw = getCanvasCoords(e as any);
    setDragStartCanvasPos({ x: raw.x, y: raw.y });
    const el = getAllElements().find(item => item.id === elementId);
    const targetNode = el?.nodes.find(n => n.id === nodeId);
    if (targetNode) {
      dragStartNodeAnchorRef.current = { ...targetNode.anchor };
    }
  };

  // --- DETECT ELEMENT ENTIRE OUTLINE CLICK FOR SELECTING/TRANSFORMING ---
  const handleElementMouseDown = (e: React.MouseEvent, elementId: string) => {
    if (e.button === 1) return; // Allow middle-click to bubble to canvas for panning
    if (e.button !== 0) return; // Only left-click starts dragging

    // Save starting state for undo/redo
    layersBeforeInteractionRef.current = JSON.parse(JSON.stringify(layers));

    e.stopPropagation();
    e.preventDefault();

    setActiveFlyout(null);

    const el = getAllElements().find(v => v.id === elementId);
    if (el?.locked) return; // locked elements cannot be interacted with

    // Illustrator behavior: Ctrl/Cmd + click selects element without restarting pen path
    if (tool === 'pen' && (e.ctrlKey || e.metaKey)) {
      setSelectedElementIds([elementId]);
      return;
    }

    if (tool === 'add-anchor') {
      const canvasPos = getCanvasCoords(e);
      if (el && el.nodes.length >= 2) {
        const found = findNearestSegmentOnElement(el, canvasPos, 24 / zoom);
        if (found) {
          handleAddNodeToSegment(elementId, found.segmentIdx, found.nextSegmentIdx, found.projection);
          return;
        }
      }
      setSelectedElementIds([elementId]);
      return;
    }

    if (tool === 'pen') {
      if (el && el.closed && el.nodes.length >= 2) {
        const canvasPos = getCanvasCoords(e);
        const found = findNearestSegmentOnElement(el, canvasPos, 18 / zoom);
        if (found) {
          handleAddNodeToSegment(elementId, found.segmentIdx, found.nextSegmentIdx, found.projection);
          return;
        }
        setSelectedElementIds([elementId]);
        return;
      }

      if (el && !el.closed) {
        // Find if closest endpoint is start or end
        const canvasPos = getCanvasCoords(e);
        const distToStart = distance(canvasPos, el.nodes[0].anchor);
        const distToEnd = distance(canvasPos, el.nodes[el.nodes.length - 1].anchor);

        const targetNodeId = distToStart < distToEnd ? el.nodes[0].id : el.nodes[el.nodes.length - 1].id;

        if (distToStart < distToEnd) {
          // Reverse nodes so that we can append to the end of the array
          setLayers(prev =>
            prev.map(layer => ({
              ...layer,
              elements: layer.elements.map(item => {
                if (item.id === elementId) {
                  return {
                    ...item,
                    nodes: [...item.nodes].reverse().map(node => ({
                      ...node,
                      handleIn: node.handleOut,
                      handleOut: node.handleIn,
                    })),
                  };
                }
                return item;
              }),
            }))
          );
        }

        // Set this path as the active drawing path
        setActivePathId(elementId);
        setSelectedElementIds([elementId]);
        setSelectedNodeInfo({ elementId, nodeId: targetNodeId });
        setSelectedHandle('anchor');
        setPenPreviewPos(null);
        return;
      } else if (el) {
        // If it's already closed, make it selected
        setSelectedElementIds([elementId]);
        return;
      }
    }

    if (tool === 'direct-select') {
      setIsDragging(true);
      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
      currentDragDeltaRef.current = { x: 0, y: 0 };
      setDragStartElementsBackup(JSON.parse(JSON.stringify(getAllElements())));
      setSelectedElementIds([elementId]);
      if (!e.shiftKey) {
        setSelectedNodes([]);
        setSelectedNodeInfo(null);
        setSelectedSegment(null);
      }
      setSelectedHandle(null);
      return;
    }

    if (tool === 'text') {
      setSelectedElementIds([elementId]);
      setSelectedNodeInfo(null);
      return;
    }

    if (tool === 'eraser') {
      // Instantly delete clicked element
      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.filter(item => item.id !== elementId),
        }))
      );
      setSelectedElementIds([]);
      return;
    }

    if (tool === 'select') {
      setIsDragging(true);
      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
      currentDragDeltaRef.current = { x: 0, y: 0 };

      // Save initial positions coordinates to cleanly support drag relative delta
      const currentEls = getAllElements();

      let nextSelectedIds = [...selectedElementIds];
      if (e.shiftKey) {
        if (nextSelectedIds.includes(elementId)) {
          nextSelectedIds = nextSelectedIds.filter(id => id !== elementId);
        } else {
          nextSelectedIds.push(elementId);
        }
      } else {
        if (!nextSelectedIds.includes(elementId)) {
          nextSelectedIds = [elementId];
        }
      }

      if (e.altKey) {
        const elsToDuplicate = currentEls.filter(el => nextSelectedIds.includes(el.id));
        const duplicatedElements = elsToDuplicate.map(el => {
          const newNodes = el.nodes.map(node => ({
            ...node,
            id: `node-${Math.random().toString(36).substr(2, 5)}`,
            anchor: { ...node.anchor },
            handleIn: node.handleIn ? { ...node.handleIn } : undefined,
            handleOut: node.handleOut ? { ...node.handleOut } : undefined,
          }));
          return {
            ...el,
            id: `el-${Math.random().toString(36).substr(2, 9)}`,
            name: `${el.name} (Copy)`,
            nodes: newNodes,
          };
        });

        // Add duplicated elements to their layers
        setLayers(prev =>
          prev.map(layer => {
            const layerElIds = layer.elements.map(item => item.id);
            const dupesForThisLayer = duplicatedElements.filter((_, idx) =>
              layerElIds.includes(elsToDuplicate[idx].id)
            );
            if (dupesForThisLayer.length > 0) {
              return {
                ...layer,
                elements: [...layer.elements, ...dupesForThisLayer],
              };
            }
            return layer;
          })
        );

        const newDuplicatedIds = duplicatedElements.map(el => el.id);
        setSelectedElementIds(newDuplicatedIds);

        // Backup has all elements, including new duplicates, at their starting positions
        const allElementsWithDupes = [...currentEls, ...duplicatedElements];
        setDragStartElementsBackup(JSON.parse(JSON.stringify(allElementsWithDupes)));
      } else {
        setSelectedElementIds(nextSelectedIds);
        setDragStartElementsBackup(JSON.parse(JSON.stringify(currentEls)));
      }
      setSelectedNodeInfo(null);
    }
  };

  // --- Layer operations ---
  const handleAddLayer = () => {
    pushHistory(layers);
    const newId = `layer-${Date.now()}`;
    const newLayer: Layer = {
      id: newId,
      name: `Art Layer ${layers.length + 1}`,
      elements: [],
      visible: true,
      locked: false,
    };
    setLayers(prev => [...prev, newLayer]);
    setActiveLayerId(newId);
  };

  const handleDeleteLayer = (layerId: string) => {
    if (layers.length <= 1) {
      alert("Kia wātea kia kotahi te paparanga (Must keep at least one paint layer active).");
      return;
    }
    pushHistory(layers);
    setLayers(prev => prev.filter(l => l.id !== layerId));
    if (activeLayerId === layerId) {
      const remaining = layers.filter(l => l.id !== layerId);
      setActiveLayerId(remaining[0].id);
    }
  };

  const toggleLayerVisible = (layerId: string) => {
    setLayers(prev =>
      prev.map(l => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  const toggleLayerLocked = (layerId: string) => {
    setLayers(prev =>
      prev.map(l => (l.id === layerId ? { ...l, locked: !l.locked } : l))
    );
  };

  const handleReorderLayer = (index: number, dir: 'up' | 'down') => {
    const newIdx = dir === 'up' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= layers.length) return;

    pushHistory(layers);
    const updated = [...layers];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIdx, 0, moved);
    setLayers(updated);
  };

  const activatePenTool = () => {
    setTool('pen');
    const selectedEls = getAllElements().filter(e => selectedElementIds.includes(e.id));
    if (selectedEls.length === 1 && !selectedEls[0].closed) {
      const el = selectedEls[0];
      setActivePathId(el.id);
      if (el.nodes.length > 0) {
        // Determine which node to continue from based on current selectedNodeInfo if any
        let targetNode = el.nodes[el.nodes.length - 1];
        const hasSelectedNode = selectedNodeInfo && selectedNodeInfo.elementId === el.id;
        const isStartSelected = hasSelectedNode && el.nodes[0] && selectedNodeInfo.nodeId === el.nodes[0].id;
        const isEndSelected = hasSelectedNode && el.nodes[el.nodes.length - 1] && selectedNodeInfo.nodeId === el.nodes[el.nodes.length - 1].id;

        if (hasSelectedNode && (isStartSelected || isEndSelected)) {
          if (isStartSelected) {
            // Reverse nodes so that start node becomes the end node we append to!
            setLayers(prev =>
              prev.map(layer => ({
                ...layer,
                elements: layer.elements.map(item => {
                  if (item.id === el.id) {
                    const revNodes = [...item.nodes].reverse().map(node => ({
                      ...node,
                      handleIn: node.handleOut,
                      handleOut: node.handleIn,
                    }));
                    return {
                      ...item,
                      nodes: revNodes,
                    };
                  }
                  return item;
                }),
              }))
            );
            // The target node is now the first node (which becomes the last node after reversing)
            targetNode = el.nodes[0];
          } else {
            targetNode = el.nodes[el.nodes.length - 1];
          }
        } else {
          // Default to last node
          targetNode = el.nodes[el.nodes.length - 1];
        }

        setSelectedNodeInfo({ elementId: el.id, nodeId: targetNode.id });
        setSelectedHandle('anchor');
      }
    } else {
      setActivePathId(null);
    }
    setPenPreviewPos(null);
  };

  // Delete key stroke to instantly delete selected nodes or elements & modifier key tracking
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlHeldRef.current = true;
        setIsCtrlKeyHeld(true);
      }
      if (e.key === 'Alt') {
        isAltHeldRef.current = true;
        setIsAltKeyHeld(true);
      }
      if (e.key === 'Shift') {
        isShiftHeldRef.current = true;
        setIsShiftKeyHeld(true);
      }

      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;

      const isModKey = e.ctrlKey || e.metaKey;

      if (isModKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopy();
      } else if (isModKey && (e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        handleCut();
      } else if (isModKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handlePaste();
      } else if (isModKey && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        handleSelectAll();
      } else if (isModKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        handleToggleLock();
      } else if (isModKey && e.shiftKey && e.key === ']') {
        e.preventDefault();
        handleBringToFront();
      } else if (isModKey && !e.shiftKey && e.key === ']') {
        e.preventDefault();
        handleBringForward();
      } else if (isModKey && e.shiftKey && e.key === '[') {
        e.preventDefault();
        handleSendToBack();
      } else if (isModKey && !e.shiftKey && e.key === '[') {
        e.preventDefault();
        handleSendBackward();
      } else if (isModKey && e.key === '0') {
        e.preventDefault();
        handleResetZoom();
      } else if (isModKey && e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        const hasTextSelected = getAllElements().some(el => selectedElementIds.includes(el.id) && el.type === 'text');
        if (hasTextSelected) {
          handleCreateOutlines();
        } else {
          handleStrokeToPath();
        }
      } else if (isModKey && !e.shiftKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        handleExpandToShapes();
      } else if (isModKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleRepeatTransform();
      } else if (isModKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        setShowRulers(prev => !prev);
      } else if (isModKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
      } else if (isModKey && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDeleteSelected();
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (activePathId) {
          // Finish drawing current path
          setActivePathId(null);
          setPenPreviewPos(null);
        }
      } else if (isModKey && (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd')) {
        e.preventDefault();
        zoomToPoint(zoomRef.current * 1.25);
      } else if (isModKey && (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract')) {
        e.preventDefault();
        zoomToPoint(zoomRef.current / 1.25);
      } else if (isModKey && (e.key === '0' || e.code === 'Numpad0')) {
        e.preventDefault();
        zoomToPoint(1);
      } else if (!isModKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        setTool('add-anchor');
      } else if (!isModKey && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setTool('delete-anchor');
      } else if (e.shiftKey && !isModKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        setTool('anchor-convert');
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        activatePenTool();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setTool('direct-select');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        if (e.shiftKey) {
          setTool('triangle');
        } else {
          setTool('text');
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setTool('rect');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setTool('ellipse');
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setTool('select');
      } else if (!isModKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setSnapRightAngle(prev => {
          const next = !prev;
          setExpandToast(next ? "Right-Angle (90°) Snapping: ON" : "Right-Angle (90°) Snapping: OFF");
          return next;
        });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control' || e.key === 'Meta') {
        isCtrlHeldRef.current = false;
        setIsCtrlKeyHeld(false);
      }
      if (e.key === 'Alt') {
        isAltHeldRef.current = false;
        setIsAltKeyHeld(false);
      }
      if (e.key === 'Shift') {
        isShiftHeldRef.current = false;
        setIsShiftKeyHeld(false);
      }
    };

    const handleWindowBlur = () => {
      isCtrlHeldRef.current = false;
      setIsCtrlKeyHeld(false);
      isAltHeldRef.current = false;
      setIsAltKeyHeld(false);
      isShiftHeldRef.current = false;
      setIsShiftKeyHeld(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [selectedElementIds, selectedNodeInfo, selectedNodes, selectedSegment, activePathId, tool, copiedElements, layers, activeLayerId, lastTransform, handleDeleteSelected]);

  // --- MOUSE WHEEL ZOOM ON CANVAS ---
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Keep latest mouse position tracked for any subsequent zoom actions
      lastMousePosRef.current = { x: mouseX, y: mouseY };

      let factor = 1;
      if (e.ctrlKey) {
        // Pinch-to-zoom on touchpad / trackpad or Ctrl + Wheel
        factor = Math.exp(-e.deltaY * 0.01);
      } else {
        // Discrete mouse wheel or smooth scrolling
        if (Math.abs(e.deltaY) >= 40) {
          factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        } else {
          factor = Math.exp(-e.deltaY * 0.002);
        }
      }

      zoomToPoint(zoomRef.current * factor, { x: mouseX, y: mouseY });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [zoomToPoint]);

  // --- SVG DOWNLOAD GENERATOR ---
  const handleExportSVG = () => {
    let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%">\n`;

    // Render layers in reverse order so bottom layer renders inside back!
    const activeLayers = [...layers].reverse();

    activeLayers.forEach(l => {
      if (!l.visible) return;
      svgContent += `  <!-- Layer: ${l.name} -->\n`;
      l.elements.forEach(el => {
        if (!el.visible) return;

        if (el.type === 'text') {
          const minX = Math.min(...el.nodes.map(n => n.anchor.x));
          const minY = Math.min(...el.nodes.map(n => n.anchor.y));
          const fontSize = el.fontSize || 48;
          const baselineY = minY + fontSize * 0.82;
          const fillAttr = el.fill === 'none' ? 'none' : el.fill;
          const strokeAttr = (el.strokeWidth === 0 || el.stroke === 'none')
            ? 'stroke="none"'
            : `stroke="${el.stroke}" stroke-width="${el.strokeWidth}"`;
          const fontFam = el.fontFamily || 'Inter';
          svgContent += `  <text x="${minX}" y="${baselineY}" font-family="${fontFam}, sans-serif" font-size="${fontSize}px" font-weight="${el.fontWeight || 600}" font-style="${el.fontStyle || 'normal'}" fill="${fillAttr}" ${strokeAttr}>${el.text || ''}</text>\n`;
        } else {
          const appliedBrush = el.brushId ? brushes.find(b => b.id === el.brushId) : null;
          const deformedBrushEls = appliedBrush ? applyBrushToStroke(el, appliedBrush) : null;

          if (deformedBrushEls && deformedBrushEls.length > 0) {
            deformedBrushEls.forEach(bEl => {
              const bD = getPathData(bEl.nodes, bEl.closed);
              const fillAttr = bEl.fill === 'none' ? 'none' : bEl.fill;
              const opacityAttr = bEl.fill === 'none' ? '' : ` fill-opacity="${bEl.fillOpacity}"`;
              const strokeAttr = (bEl.strokeWidth === 0 || bEl.stroke === 'none')
                ? 'stroke="none" stroke-width="0"'
                : `stroke="${bEl.stroke}" stroke-width="${bEl.strokeWidth}"`;
              svgContent += `  <path d="${bD}" fill="${fillAttr}"${opacityAttr} ${strokeAttr} stroke-linecap="round" stroke-linejoin="round" />\n`;
            });
          } else {
            const d = getPathData(el.nodes, el.closed);
            const fillAttr = el.fill === 'none' ? 'none' : el.fill;
            const opacityAttr = el.fill === 'none' ? '' : ` fill-opacity="${el.fillOpacity}"`;
            const strokeAttr = (el.strokeWidth === 0 || el.stroke === 'none')
              ? 'stroke="none" stroke-width="0"'
              : `stroke="${el.stroke}" stroke-width="${el.strokeWidth}"`;
            svgContent += `  <path d="${d}" fill="${fillAttr}"${opacityAttr} ${strokeAttr} stroke-linecap="round" stroke-linejoin="round" />\n`;
          }
        }
      });
    });

    svgContent += `</svg>`;

    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector-design-${Date.now()}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- DXF DOWNLOAD GENERATOR ---
  const handleExportDXF = () => {
    const allVisibleElements = getAllElements().filter(el => el.visible);
    const dxfElements: PathElement[] = [];

    allVisibleElements.forEach(el => {
      const appliedBrush = el.brushId ? brushes.find(b => b.id === el.brushId) : null;
      const deformedBrushEls = appliedBrush ? applyBrushToStroke(el, appliedBrush) : null;
      if (deformedBrushEls && deformedBrushEls.length > 0) {
        dxfElements.push(...deformedBrushEls);
      } else {
        dxfElements.push(el);
      }
    });

    const dxfContent = exportToDXF(dxfElements);

    const blob = new Blob([dxfContent], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector-design-${Date.now()}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- PROJECT SAVE & LOAD (WORKING FILE JSON) ---
  const handleExportProject = () => {
    const projectData = {
      version: "1.1",
      layers,
      activeLayerId,
      tracingImage,
      grid,
      snapToPoints,
      snapRightAngle,
      customBrushes: brushes.filter(b => !b.isDefault),
    };
    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vector-project-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportProject = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.layers)) {
          alert("Kāore i whaimana te kōnae project (Invalid vector project file format).");
          return;
        }

        setLayers(parsed.layers);
        if (parsed.activeLayerId) {
          setActiveLayerId(parsed.activeLayerId);
        } else if (parsed.layers.length > 0) {
          setActiveLayerId(parsed.layers[0].id);
        }

        if (parsed.tracingImage !== undefined) {
          setTracingImage(parsed.tracingImage);
        }
        if (parsed.grid) {
          setGrid(parsed.grid);
        }
        if (parsed.snapToPoints !== undefined) {
          setSnapToPoints(parsed.snapToPoints);
        }
        if (parsed.snapRightAngle !== undefined) {
          setSnapRightAngle(parsed.snapRightAngle);
        }

        if (Array.isArray(parsed.customBrushes)) {
          setBrushes(prev => {
            const existingIds = new Set(prev.map(b => b.id));
            const newCustom = parsed.customBrushes.filter((b: any) => !existingIds.has(b.id));
            const merged = [...prev, ...newCustom];
            try {
              const customOnly = merged.filter(b => !b.isDefault);
              localStorage.setItem('vector_brushes_library', JSON.stringify(customOnly));
            } catch (err) {
              console.error(err);
            }
            return merged;
          });
        }

        // Reset selections to avoid stale references
        setSelectedElementIds([]);
        setSelectedNodeInfo(null);
        setSelectedHandle(null);

        alert("Kua rari te kōnae mahi! Project file successfully loaded.");
      } catch (err) {
        alert("Ngaro i te pānui kōnae (Error reading project file): " + (err as Error).message);
      }
      // Reset input value so same file can be uploaded again
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const selectedElements = getAllElements().filter(e => selectedElementIds.includes(e.id));
  const activeSelectedElement = selectedElements[0] || null;

  // Sync inspector controls with active selected element properties
  useEffect(() => {
    if (activeSelectedElement) {
      if (typeof activeSelectedElement.strokeWidth === 'number') {
        setStrokeWidth(activeSelectedElement.strokeWidth);
        if (activeSelectedElement.strokeWidth > 0) {
          lastNonZeroStrokeWidthRef.current = activeSelectedElement.strokeWidth;
        }
      }
      if (activeSelectedElement.stroke) {
        setStrokeColor(activeSelectedElement.stroke);
      }
      if (activeSelectedElement.fill) {
        setFillColor(activeSelectedElement.fill);
      }
      if (typeof activeSelectedElement.fillOpacity === 'number') {
        setFillOpacity(activeSelectedElement.fillOpacity);
      }
    }
  }, [activeSelectedElement?.id]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50/60 font-sans text-slate-900 overflow-hidden">
      {/* --- Top Navbar --- */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-lg font-bold leading-none">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Kāpiti Libraries Vector Design
            </h1>
            <p className="text-xs text-slate-500">Illustrator-style Pen Tool, Bezier Node Editor & Tracing studio.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">

          <button
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold text-xs transition shadow-sm"
          >
            <ImageIcon size={14} />
            Import Trace Image
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageFileChange}
            accept="image/*"
            className="hidden"
          />

          <button
            onClick={() => setIsImageTraceModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 rounded-lg text-white font-semibold text-xs transition shadow-sm cursor-pointer"
            title="Image Trace: Vectorize bitmap images into clean Bézier paths using Marching Squares and Chaikin subdivision"
          >
            <Wand2 size={14} />
            Image Trace
          </button>

          <button
            onClick={handleExportProject}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg font-semibold text-xs transition shadow-sm cursor-pointer"
            title="Save working project file (.json) to resume later"
          >
            <Save size={14} />
            Save Project
          </button>

          <button
            onClick={() => {
              if (projectFileInputRef.current) projectFileInputRef.current.click();
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 rounded-lg font-semibold text-xs transition shadow-sm cursor-pointer"
            title="Open/Upload a previously saved working project file (.json)"
          >
            <FolderOpen size={14} />
            Open Project
          </button>
          <input
            type="file"
            ref={projectFileInputRef}
            onChange={handleImportProject}
            accept=".json,application/json"
            className="hidden"
          />

          <div className="h-6 w-[1px] bg-slate-200 my-auto mx-0.5"></div>

          {/* Undo Button */}
          <button
            onClick={handleUndo}
            disabled={undoStack.current.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs transition shadow-sm border ${
              undoStack.current.length > 0
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer'
                : 'bg-slate-50/50 border-slate-100 text-slate-300 cursor-not-allowed'
            }`}
            title="MahiWhakatika-Whakahoki - Undo Last Action (Ctrl+Z)"
          >
            <Undo size={14} />
            Undo
          </button>

          {/* Redo Button */}
          <button
            onClick={handleRedo}
            disabled={redoStack.current.length === 0}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-semibold text-xs transition shadow-sm border ${
              redoStack.current.length > 0
                ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:text-slate-900 cursor-pointer'
                : 'bg-slate-50/50 border-slate-100 text-slate-300 cursor-not-allowed'
            }`}
            title="MahiWhakatika-Taurua - Redo Last Action (Ctrl+Y or Ctrl+Shift+Z)"
          >
            <Redo size={14} />
            Redo
          </button>

          <div className="h-6 w-[1px] bg-slate-200 my-auto mx-1"></div>

          {/* Pointer Color & Theme Customizer Button */}
          <div className="relative">
            <button
              onClick={() => setActiveFlyout(prev => prev === 'pointerSettings' ? null : 'pointerSettings')}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-semibold text-xs transition shadow-sm border cursor-pointer ${
                activeFlyout === 'pointerSettings'
                  ? 'bg-blue-50 border-blue-300 text-blue-700 ring-2 ring-blue-500/10'
                  : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700'
              }`}
              title="Change mouse pointer color & canvas background"
            >
              <div
                className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs shrink-0"
                style={{ backgroundColor: pointerColor === 'system' ? '#94a3b8' : pointerColor }}
              />
              <span className="hidden sm:inline">Pointer Color</span>
              <ChevronDown size={12} className="text-slate-400" />
            </button>

            {/* Pointer & Canvas Appearance Flyout */}
            {activeFlyout === 'pointerSettings' && (
              <div className="absolute top-full mt-2 right-0 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <MousePointer size={16} className="text-blue-600" />
                    <h4 className="font-bold text-xs text-slate-800">Pointer & Canvas Appearance</h4>
                  </div>
                  <button
                    onClick={() => setActiveFlyout(null)}
                    className="text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Section 1: Pointer Color */}
                <div className="mb-4">
                  <div className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center justify-between">
                    <span>Mouse Pointer Color:</span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {pointerColor === 'system' ? 'OS System' : pointerColor}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 mb-2.5">
                    {POINTER_COLORS.map(c => {
                      const isSelected = pointerColor === c.value;
                      return (
                        <button
                          key={c.id}
                          onClick={() => {
                            setPointerColor(c.value);
                            localStorage.setItem('vector_pointer_color', c.value);
                            setExpandToast(`Pointer color set to ${c.name.split(' (')[0]}`);
                          }}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer text-left ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 text-blue-900 ring-2 ring-blue-500/20 font-bold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                          title={c.desc}
                        >
                          <div
                            className={`w-4 h-4 rounded-full border border-black/15 shrink-0 ${c.bgClass}`}
                            style={c.value !== 'system' ? { backgroundColor: c.value } : {}}
                          />
                          <div className="truncate">
                            <div className="text-[11px] font-semibold leading-tight">{c.name.split(' (')[0]}</div>
                            <div className="text-[9px] text-slate-400 leading-tight">{c.desc}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom color picker */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <label className="text-[10px] font-semibold text-slate-500">Custom Color:</label>
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="color"
                        value={pointerColor === 'system' ? '#0f172a' : pointerColor}
                        onChange={(e) => {
                          setPointerColor(e.target.value);
                          localStorage.setItem('vector_pointer_color', e.target.value);
                        }}
                        className="w-7 h-7 rounded border border-slate-200 cursor-pointer bg-transparent"
                      />
                      <input
                        type="text"
                        value={pointerColor}
                        onChange={(e) => {
                          setPointerColor(e.target.value);
                          localStorage.setItem('vector_pointer_color', e.target.value);
                        }}
                        placeholder="#0f172a"
                        className="flex-1 px-2 py-1 text-[11px] font-mono border border-slate-200 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: Canvas Background */}
                <div className="pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-semibold text-slate-600 mb-2">Canvas Background Theme:</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CANVAS_BACKGROUNDS.map(bg => {
                      const isSelected = canvasBg === bg.value;
                      return (
                        <button
                          key={bg.id}
                          onClick={() => {
                            setCanvasBg(bg.value);
                            localStorage.setItem('vector_canvas_bg', bg.value);
                            setExpandToast(`Canvas background set to ${bg.name}`);
                          }}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition cursor-pointer ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/60 text-blue-900 ring-2 ring-blue-500/20 font-bold'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div
                            className="w-4 h-4 rounded border border-slate-300 shrink-0"
                            style={{ backgroundColor: bg.value }}
                          />
                          <span className="truncate">{bg.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-200 my-auto mx-1"></div>

          <button
            onClick={handleExportSVG}
            className="flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white font-semibold text-xs transition shadow-sm"
            title="Download vector as pristine .svg"
          >
            <Download size={14} />
            Export SVG
          </button>

          <button
            onClick={handleExportDXF}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-semibold text-xs transition shadow-sm"
            title="Download vector as CAD-compatible .dxf"
          >
            <Download size={14} />
            Export DXF
          </button>
        </div>
      </header>

      {/* --- Main workspace grid --- */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* --- Left Tool Rail (Drawing Tools) --- */}
        <div className="w-16 bg-white border-r border-slate-200/80 flex flex-col items-center py-4 gap-2 z-30 select-none overflow-y-auto max-h-full scrollbar-none">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Tools</div>

          <button
            onClick={() => {
              setTool('select');
              setSelectedNodeInfo(null);
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'select' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Selection/Move Tool (V)"
          >
            <Pointer size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Selection Tool (V)
            </span>
          </button>

          <button
            onClick={() => {
              setTool('direct-select');
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'direct-select' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Direct Node Select Tool (A)"
          >
            <MousePointerSquareDashed size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Node Editor (handles) (A)
            </span>
          </button>

          {/* Illustrator Pen Tools Family Button (P, +, -, Shift+C) */}
          <div className="relative group">
            <button
              onClick={() => {
                if (tool === 'pen' || tool === 'add-anchor' || tool === 'delete-anchor' || tool === 'anchor-convert') {
                  setActiveFlyout(prev => prev === 'penTools' ? null : 'penTools');
                } else {
                  activatePenTool();
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setActiveFlyout('penTools');
              }}
              className={`p-3 rounded-lg transition relative ${
                tool === 'pen' || tool === 'add-anchor' || tool === 'delete-anchor' || tool === 'anchor-convert'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`}
              title="Pen Tools Family (Click to switch, right-click or click arrow for Add/Delete/Convert Tools)"
            >
              <div className="relative">
                {tool === 'add-anchor' ? (
                  <div className="relative">
                    <PenTool size={18} />
                    <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 rounded-full w-3 h-3 flex items-center justify-center text-[10px] font-black leading-none shadow-xs">
                      +
                    </span>
                  </div>
                ) : tool === 'delete-anchor' ? (
                  <div className="relative">
                    <PenTool size={18} />
                    <span className="absolute -bottom-1 -right-1 bg-white text-red-600 rounded-full w-3 h-3 flex items-center justify-center text-[10px] font-black leading-none shadow-xs">
                      -
                    </span>
                  </div>
                ) : tool === 'anchor-convert' ? (
                  <div className="relative flex items-center justify-center w-[18px] h-[18px]">
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 19 L12 5 L19 19" />
                    </svg>
                  </div>
                ) : (
                  <PenTool size={18} />
                )}
                {/* Illustrator corner flyout triangle */}
                <div className="absolute -bottom-1 -right-1 w-0 h-0 border-t-[3px] border-t-transparent border-r-[4px] border-r-current border-b-[3px] border-b-current opacity-80"></div>
              </div>
              <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
                {tool === 'add-anchor'
                  ? 'Add Anchor Point Tool (+)'
                  : tool === 'delete-anchor'
                  ? 'Delete Anchor Point Tool (-)'
                  : tool === 'anchor-convert'
                  ? 'Anchor Point Tool (Shift+C)'
                  : 'Pen Tool (P) - Click for Add/Delete/Convert'}
              </span>
            </button>
          </div>

          <div className="w-8 h-[1px] bg-slate-200 my-2"></div>

          <button
            onClick={() => setTool('rect')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'rect' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Rectangle Tool (R)"
          >
            <Square size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Rectangle (R)
            </span>
          </button>

          <button
            onClick={() => setTool('ellipse')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'ellipse' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Ellipse Tool (E)"
          >
            <Circle size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Ellipse (E)
            </span>
          </button>

          <button
            onClick={() => setTool('text')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'text' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Type / Text Tool (T)"
          >
            <Type size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Type Tool (T)
            </span>
          </button>

          <button
            onClick={() => setTool('triangle')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'triangle' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Triangle Tool (Shift+T)"
          >
            <Triangle size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Triangle (Shift+T)
            </span>
          </button>

          <button
            onClick={() => setTool('eraser')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'eraser' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Eraser / Delete Asset"
          >
            <Trash2 size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Eraser / Delete (E)
            </span>
          </button>

          <div className="w-8 h-[1px] bg-slate-200 my-2"></div>

          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Actions</div>

          {/* Pathfinder Flyout Button */}
          <button
            onClick={() => setActiveFlyout(prev => prev === 'pathfinder' ? null : 'pathfinder')}
            className={`p-3 rounded-lg transition relative group ${
              activeFlyout === 'pathfinder'
                ? 'bg-blue-600 text-white shadow-sm'
                : selectedElementIds.length >= 2
                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100'
                : 'text-slate-300 hover:bg-slate-50'
            }`}
            title="Pathfinder Operations (Union, Subtract, Intersect, Exclude)"
          >
            <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="12" r="6" fill="currentColor" fillOpacity={activeFlyout === 'pathfinder' ? 0.3 : 0.1} />
              <circle cx="15" cy="12" r="6" fill="currentColor" fillOpacity={activeFlyout === 'pathfinder' ? 0.5 : 0.25} />
            </svg>
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Boolean Pathfinder {selectedElementIds.length < 2 ? '(Select 2+ shapes)' : ''}
            </span>
          </button>

          {/* Mirror & Symmetry Flyout Button */}
          <button
            onClick={() => setActiveFlyout(prev => prev === 'mirror' ? null : 'mirror')}
            className={`p-3 rounded-lg transition relative group ${
              activeFlyout === 'mirror'
                ? 'bg-blue-600 text-white shadow-sm'
                : selectedElementIds.length > 0
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100'
                : 'text-slate-300 hover:bg-slate-50'
            }`}
            title="Mirror & Symmetry Actions"
          >
            <Compass size={18} className={selectedElementIds.length > 0 ? "animate-spin-slow" : ""} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Mirror & Symmetry {selectedElementIds.length === 0 ? '(Select 1+ shapes)' : ''}
            </span>
          </button>

          {/* Stroke to Path (Outline Stroke) Flyout Button */}
          <button
            onClick={() => setActiveFlyout(prev => prev === 'strokeToPath' ? null : 'strokeToPath')}
            className={`p-3 rounded-lg transition relative group ${
              activeFlyout === 'strokeToPath'
                ? 'bg-purple-600 text-white shadow-sm'
                : selectedElementIds.length > 0
                ? 'bg-purple-50 text-purple-600 hover:bg-purple-100 border border-purple-100'
                : 'text-slate-300 hover:bg-slate-50'
            }`}
            title="Stroke to Path / Outline Stroke (Ctrl+Shift+O)"
          >
            <Spline size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Stroke to Path (Outline Stroke) {selectedElementIds.length === 0 ? '(Select 1+ paths)' : ''}
            </span>
          </button>

          {/* Illustrator Brushes Library Flyout Button */}
          <button
            onClick={() => setActiveFlyout(prev => prev === 'brushes' ? null : 'brushes')}
            className={`p-3 rounded-lg transition relative group ${
              activeFlyout === 'brushes'
                ? 'bg-blue-600 text-white shadow-sm'
                : activeBrushId || (selectedElements.length > 0 && selectedElements.some(e => e.brushId))
                ? 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Brush Library (Art & Pattern Brushes)"
          >
            <Paintbrush size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Brush Library (Art & Pattern Brushes)
            </span>
          </button>

          {/* Expand into Shapes Button (Object > Expand) */}
          <button
            onClick={() => handleExpandToShapes()}
            disabled={selectedElementIds.length === 0}
            className={`p-3 rounded-lg transition relative group ${
              selectedElementIds.length > 0
                ? 'bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200 cursor-pointer shadow-xs'
                : 'text-slate-300 hover:bg-slate-50 cursor-not-allowed'
            }`}
            title="Expand into Shapes (Object > Expand) [Ctrl+E]"
          >
            <Shapes size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Expand into Shapes (Ctrl+E) {selectedElementIds.length === 0 ? '(Select paths)' : ''}
            </span>
          </button>

          <div className="flex-1 min-h-[20px]"></div>

          {/* Canvas Controls */}
          <div className="w-8 h-[1px] bg-slate-200 my-2"></div>

          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setShowRulers(r => !r)}
              className={`p-2 rounded transition ${showRulers ? 'text-indigo-600 bg-indigo-50 border border-indigo-200 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Precision Rulers (mm) [Hotkey: Ctrl+R]"
            >
              <Ruler size={16} />
            </button>
            <button
              onClick={() => setGrid(g => ({ ...g, visible: !g.visible }))}
              className={`p-2 rounded transition ${grid.visible ? 'text-blue-600 bg-blue-50 border border-blue-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Grid Lines"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setGrid(g => ({ ...g, snap: !g.snap }))}
              className={`p-2 rounded transition ${grid.snap ? 'text-blue-600 bg-blue-50 border border-blue-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Toggle Grid Snapping"
            >
              <Maximize2 size={14} className={grid.snap ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={() => setSnapToPoints(s => !s)}
              className={`p-2 rounded transition ${snapToPoints ? 'text-red-600 bg-red-50 border border-red-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
              title="Snap to Node Anchors"
            >
              <Compass size={14} />
            </button>
            <button
              onClick={() => {
                setSnapRightAngle(s => {
                  const next = !s;
                  setExpandToast(next ? "Right-Angle (90°) Snapping: ON" : "Right-Angle (90°) Snapping: OFF");
                  return next;
                });
              }}
              className={`p-2 rounded transition flex items-center gap-1.5 ${
                snapRightAngle
                  ? 'text-indigo-600 bg-indigo-50 border border-indigo-200 shadow-sm font-semibold'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
              title="Toggle Right Angle / Orthogonal Snapping (90° to Page) [Hotkey: O]"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20 L20 20" />
                <path d="M4 20 L4 4" />
                <rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span className="text-[11px]">90° Snap</span>
            </button>

            <button
              onClick={() => setActiveFlyout(prev => prev === 'pointerSettings' ? null : 'pointerSettings')}
              className={`p-2 rounded transition flex items-center justify-center relative ${
                activeFlyout === 'pointerSettings'
                  ? 'bg-blue-50 border border-blue-200 text-blue-600 shadow-sm'
                  : 'text-slate-400 hover:bg-slate-50'
              }`}
              title="Pointer Color & Canvas Appearance"
            >
              <Palette size={15} />
              <div
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-white shadow-xs"
                style={{ backgroundColor: pointerColor === 'system' ? '#94a3b8' : pointerColor }}
              />
            </button>
          </div>
        </div>

        {/* --- Floating Submenus / Flyouts (placed as sibling outside the scrollable parent to prevent overflow clipping) --- */}
        {activeFlyout === 'penTools' && (
          <div className="absolute left-16 top-[135px] w-64 bg-white border border-slate-200 rounded-xl shadow-xl py-2 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1.5 flex justify-between items-center">
              <span>Illustrator Pen Suite</span>
              <span className="font-mono text-[9px] text-blue-600 font-semibold">P</span>
            </div>

            <button
              onClick={() => {
                activatePenTool();
                setActiveFlyout(null);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition cursor-pointer ${
                tool === 'pen' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <PenTool size={15} className="text-blue-600 shrink-0" />
                <div>
                  <div className="font-semibold text-[11px]">Pen Tool</div>
                  <div className="text-[10px] text-slate-400 font-normal">Draw and edit paths</div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-slate-400 font-bold">P</span>
            </button>

            <button
              onClick={() => {
                setTool('add-anchor');
                setActiveFlyout(null);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition cursor-pointer ${
                tool === 'add-anchor' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <PenTool size={15} className="text-blue-600" />
                  <span className="absolute -bottom-1 -right-1 bg-white text-blue-600 rounded-full w-2.5 h-2.5 flex items-center justify-center text-[9px] font-black leading-none border border-blue-200">
                    +
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-[11px]">Add Anchor Point Tool</div>
                  <div className="text-[10px] text-slate-400 font-normal">Add nodes on path segments</div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-slate-400 font-bold">+</span>
            </button>

            <button
              onClick={() => {
                setTool('delete-anchor');
                setActiveFlyout(null);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition cursor-pointer ${
                tool === 'delete-anchor' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative shrink-0">
                  <PenTool size={15} className="text-red-600" />
                  <span className="absolute -bottom-1 -right-1 bg-white text-red-600 rounded-full w-2.5 h-2.5 flex items-center justify-center text-[9px] font-black leading-none border border-red-200">
                    -
                  </span>
                </div>
                <div>
                  <div className="font-semibold text-[11px]">Delete Anchor Point Tool</div>
                  <div className="text-[10px] text-slate-400 font-normal">Click nodes to remove</div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-slate-400 font-bold">-</span>
            </button>

            <button
              onClick={() => {
                setTool('anchor-convert');
                setActiveFlyout(null);
              }}
              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition cursor-pointer ${
                tool === 'anchor-convert' ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-[15px] h-[15px] flex items-center justify-center shrink-0">
                  <svg className="w-[15px] h-[15px] text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 19 L12 5 L19 19" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-[11px]">Anchor Point Tool</div>
                  <div className="text-[10px] text-slate-400 font-normal">Convert corner/smooth curves</div>
                </div>
              </div>
              <span className="font-mono text-[10px] text-slate-400 font-bold">Shift+C</span>
            </button>
          </div>
        )}

        {activeFlyout === 'pathfinder' && (
          <div className="absolute left-16 top-[410px] w-56 bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1.5 flex justify-between items-center">
              <span>Boolean Pathfinder</span>
              {selectedElementIds.length >= 2 ? (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                  {selectedElementIds.length} Shapes
                </span>
              ) : (
                <span className="text-[9px] text-amber-500 font-medium">Select 2+ shapes</span>
              )}
            </div>
            <button
              onClick={() => {
                if (selectedElementIds.length >= 2) {
                  handlePathfinder('union');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length < 2}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length >= 2 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <svg className={`w-4 h-4 ${selectedElementIds.length >= 2 ? 'text-blue-600' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
                <rect x="11" y="3" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
              </svg>
              <span className="font-medium">Union (Combine)</span>
            </button>
            <button
              onClick={() => {
                if (selectedElementIds.length >= 2) {
                  handlePathfinder('subtract');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length < 2}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length >= 2 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <svg className={`w-4 h-4 ${selectedElementIds.length >= 2 ? 'text-red-600' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
                <rect x="11" y="3" width="10" height="10" rx="1.5" fill="none" strokeDasharray="3 3" />
              </svg>
              <span className="font-medium">Subtract (Carve)</span>
            </button>
            <button
              onClick={() => {
                if (selectedElementIds.length >= 2) {
                  handlePathfinder('intersect');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length < 2}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length >= 2 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <svg className={`w-4 h-4 ${selectedElementIds.length >= 2 ? 'text-emerald-600' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="10" height="10" rx="1.5" fill="none" />
                <rect x="11" y="3" width="10" height="10" rx="1.5" fill="none" />
                <rect x="11" y="11" width="2" height="2" fill="currentColor" fillOpacity="0.4" />
              </svg>
              <span className="font-medium">Intersect</span>
            </button>
            <button
              onClick={() => {
                if (selectedElementIds.length >= 2) {
                  handlePathfinder('exclude');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length < 2}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length >= 2 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <svg className={`w-4 h-4 ${selectedElementIds.length >= 2 ? 'text-amber-600' : 'text-slate-300'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
                <rect x="11" y="3" width="10" height="10" rx="1.5" fill="currentColor" fillOpacity="0.15" />
              </svg>
              <span className="font-medium">Exclude (XOR)</span>
            </button>
          </div>
        )}

        {activeFlyout === 'mirror' && (
          <div className="absolute left-16 top-[450px] w-56 bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-1.5 mb-1.5">
              Flip & Symmetry
            </div>
            
            <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider">Flip Selected</div>
            <button
              onClick={() => {
                if (selectedElementIds.length > 0) {
                  handleMirrorAction('flip-horizontal');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length === 0}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length > 0 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-blue-600 font-bold text-sm">↔</span>
              <span>Flip Horizontal</span>
            </button>
            <button
              onClick={() => {
                if (selectedElementIds.length > 0) {
                  handleMirrorAction('flip-vertical');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length === 0}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length > 0 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-blue-600 font-bold text-sm">↕</span>
              <span>Flip Vertical</span>
            </button>

            <div className="h-[1px] bg-slate-100 my-1.5"></div>
            
            <div className="px-3 py-1 text-[9px] font-bold text-blue-500 uppercase tracking-wider">Clone & Symmetrical Mirror</div>
            <button
              onClick={() => {
                if (selectedElementIds.length > 0) {
                  handleMirrorAction('mirror-horizontal');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length === 0}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length > 0 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-emerald-500 text-sm">👥</span>
              <span>Mirror Left ↔ Right</span>
            </button>
            <button
              onClick={() => {
                if (selectedElementIds.length > 0) {
                  handleMirrorAction('mirror-vertical');
                  setActiveFlyout(null);
                }
              }}
              disabled={selectedElementIds.length === 0}
              className={`w-full text-left px-4 py-2 text-xs flex items-center gap-2.5 transition ${
                selectedElementIds.length > 0 ? 'hover:bg-slate-50 text-slate-700 cursor-pointer' : 'text-slate-300 cursor-not-allowed opacity-50'
              }`}
            >
              <span className="text-emerald-500 text-sm">👥</span>
              <span>Mirror Top ↕ Bottom</span>
            </button>
          </div>
        )}

        {activeFlyout === 'strokeToPath' && (
          <div className="absolute left-16 top-[470px] w-64 bg-white border border-slate-200 rounded-lg shadow-xl py-2.5 px-3 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Spline size={13} className="text-purple-600" />
                Stroke to Path
              </span>
              {selectedElementIds.length > 0 ? (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">
                  {selectedElementIds.length} Selected
                </span>
              ) : (
                <span className="text-[9px] text-amber-500 font-medium">Select a path</span>
              )}
            </div>

            {/* Output Mode Selection */}
            <div className="mb-2.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">Trace Output Mode</div>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setStrokeToPathMode('outline')}
                  className={`py-1.5 px-2 rounded border text-center font-medium transition ${
                    strokeToPathMode === 'outline'
                      ? 'bg-purple-600 border-purple-700 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Trace both sides + caps into a single closed filled outline path"
                >
                  Outline Shape
                </button>
                <button
                  type="button"
                  onClick={() => setStrokeToPathMode('dual-lines')}
                  className={`py-1.5 px-2 rounded border text-center font-medium transition ${
                    strokeToPathMode === 'dual-lines'
                      ? 'bg-purple-600 border-purple-700 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                  title="Trace both sides into 2 separate editable open path lines"
                >
                  Dual Path Lines
                </button>
              </div>
            </div>

            {/* Cap Style (for open paths) */}
            {strokeToPathMode === 'outline' && (
              <div className="mb-2.5">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">End Cap Style</div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  {(['round', 'butt', 'square'] as const).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setStrokeToPathCap(c)}
                      className={`py-1 rounded border capitalize text-center font-medium transition ${
                        strokeToPathCap === c
                          ? 'bg-purple-50 border-purple-300 text-purple-700 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Keep Original Option */}
            <div className="flex items-center justify-between mb-3 text-[11px] text-slate-600">
              <span>Keep original stroke</span>
              <input
                type="checkbox"
                checked={strokeToPathKeepOriginal}
                onChange={e => setStrokeToPathKeepOriginal(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-purple-600 focus:ring-purple-500"
              />
            </div>

            {/* Action Execution Button */}
            <button
              onClick={() => {
                handleStrokeToPath();
                setActiveFlyout(null);
              }}
              disabled={selectedElementIds.length === 0}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition shadow-sm ${
                selectedElementIds.length > 0
                  ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer active:scale-98'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
            >
              <Spline size={13} />
              <span>Trace to Path Lines</span>
            </button>
          </div>
        )}

        {activeFlyout === 'brushes' && (
          <div className="absolute left-16 top-[490px] w-72 bg-white border border-slate-200 rounded-lg shadow-xl py-3 px-3 z-50 animate-in fade-in slide-in-from-left-2 duration-150">
            <BrushesPanel
              brushes={brushes}
              activeBrushId={activeBrushId}
              selectedElement={activeSelectedElement}
              selectedElementsCount={selectedElementIds.length}
              onSelectBrush={(bId) => {
                handleSelectBrush(bId);
              }}
              onOpenNewBrushModal={() => {
                setActiveFlyout(null);
                setIsBrushModalOpen(true);
              }}
              onDeleteBrush={handleDeleteBrush}
              onExpandAppearance={() => {
                handleExpandAppearance();
                setActiveFlyout(null);
              }}
              strokeColor={strokeColor}
            />
          </div>
        )}

        {/* --- Main Art Canvas Stage --- */}
        <div
          ref={canvasContainerRef}
          className="flex-1 relative overflow-hidden select-none transition-colors duration-200"
          style={{ backgroundColor: canvasBg }}
          onMouseMove={(e) => {
            const rect = canvasContainerRef.current?.getBoundingClientRect();
            if (rect) {
              const mouseX = e.clientX - rect.left;
              const mouseY = e.clientY - rect.top;
              lastMousePosRef.current = { x: mouseX, y: mouseY };
              setContainerMousePos({ x: mouseX, y: mouseY });
            }
          }}
          onMouseLeave={() => setContainerMousePos(null)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onContextMenu={handleCanvasContextMenu}
        >
          {/* Precision Interactive Rulers in mm */}
          <CanvasRulers
            width={containerSize.width}
            height={containerSize.height}
            zoom={zoom}
            panOffset={panOffset}
            unit={unit}
            onUnitChange={setUnit}
            mousePos={containerMousePos}
            selectedBox={selectedElementIds.length > 0 ? getCombinedBoundingBox(getAllElements().filter(el => selectedElementIds.includes(el.id))) : null}
            visible={showRulers}
          />

          {/* Outer Canvas Overlay Drag-over */}
          {isDragOverCanvas && (
            <div className="absolute inset-0 bg-blue-900/40 border-4 border-dashed border-blue-400 flex flex-col items-center justify-center z-50 text-white">
              <FileImage size={48} className="animate-bounce text-blue-100 mb-2" />
              <p className="font-bold text-lg">Drop your image here to load reference tracing layer</p>
              <p className="text-xs text-blue-100 mt-1">Accepts PNG, JPG, or SVG drawings</p>
            </div>
          )}

          {/* Expand into Shapes Toast Notification */}
          {expandToast && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2.5 z-50 animate-in fade-in slide-in-from-top-3 duration-200 border border-slate-700/80">
              <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
                <Shapes size={15} />
              </div>
              <span className="text-slate-100">{expandToast}</span>
            </div>
          )}

          {/* Raw SVG Canvas Element */}
          <svg
            id="vector-canvas"
            width="100%"
            height="100%"
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onDrop={handleDrop}
            onContextMenu={handleCanvasContextMenu}
            className="absolute inset-0"
            style={{
              cursor: getCurrentCanvasCursor()
            }}
          >
            <defs>
              {/* Pattern definition for grid lines */}
              <pattern
                id="grid-pattern"
                width={grid.size}
                height={grid.size}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${grid.size} 0 L 0 0 0 ${grid.size}`}
                  fill="none"
                  stroke={canvasBg === '#1e293b' ? '#334155' : '#e2e8f0'}
                  strokeWidth="1"
                />
              </pattern>
            </defs>

            {/* Stage Transform Wrapper */}
            <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
              
              {/* 1. Grid Rendering */}
              {grid.visible && (
                <rect
                  x="-2000"
                  y="-2000"
                  width="5000"
                  height="5000"
                  fill="url(#grid-pattern)"
                  className="pointer-events-none"
                />
              )}

              {/* Physical Artboard Sheet (measured in mm, e.g. A4 210 x 297 mm) */}
              <g id="artboard-sheet">
                {/* Soft drop shadow */}
                <rect
                  x={3 / zoom}
                  y={4 / zoom}
                  width={artboardWidth}
                  height={artboardHeight}
                  fill="#000000"
                  fillOpacity={0.06}
                  rx={2 / zoom}
                  className="pointer-events-none"
                />
                {/* Artboard page background */}
                <rect
                  x={0}
                  y={0}
                  width={artboardWidth}
                  height={artboardHeight}
                  fill={canvasBg === '#1e293b' ? '#0f172a' : '#ffffff'}
                  stroke={canvasBg === '#1e293b' ? '#334155' : '#cbd5e1'}
                  strokeWidth={1 / zoom}
                  className="pointer-events-none"
                />
                {/* Artboard Dimension Label in mm at top-left of sheet */}
                <text
                  x={4 / zoom}
                  y={-6 / zoom}
                  fill={canvasBg === '#1e293b' ? '#94a3b8' : '#64748b'}
                  fontSize={`${9 / zoom}px`}
                  fontFamily="monospace"
                  fontWeight="600"
                  className="pointer-events-none select-none"
                >
                  {`Artboard: ${pxToUnit(artboardWidth, unit).toFixed(0)} × ${pxToUnit(artboardHeight, unit).toFixed(0)} ${unit}`}
                </text>
              </g>

              {/* Center Axis Reference */}
              <line x1="-1000" y1="300" x2="2000" y2="300" stroke={canvasBg === '#1e293b' ? '#475569' : '#cbd5e1'} strokeWidth={0.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} className="pointer-events-none" />
              <line x1="400" y1="-1000" x2="400" y2="2000" stroke={canvasBg === '#1e293b' ? '#475569' : '#cbd5e1'} strokeWidth={0.5 / zoom} strokeDasharray={`${4 / zoom} ${4 / zoom}`} className="pointer-events-none" />

              {/* 2. Tracing Image layer */}
              {tracingImage && tracingImage.visible && (
                <g
                  transform={`translate(${tracingImage.x}, ${tracingImage.y}) rotate(${tracingImage.rotate})`}
                  className={`${tracingImage.locked ? 'pointer-events-none' : ''}`}
                >
                  <image
                    href={tracingImage.url}
                    width={500 * tracingImage.scale}
                    opacity={tracingImage.opacity}
                    onMouseDown={(e) => {
                      if (tracingImage.locked) return;
                      if (e.button === 1) return; // Allow middle-click to bubble to canvas for panning
                      if (e.button !== 0) return; // Only left-click starts dragging
                      e.stopPropagation();
                      setIsDragging(true);
                      const rawCoords = getCanvasCoords(e);
                      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
                      setDragImageStartPos({ x: tracingImage.x, y: tracingImage.y });
                    }}
                    style={{ cursor: tracingImage.locked ? 'default' : 'move' }}
                  />
                  {/* Tracing image surrounding outline when active */}
                  {!tracingImage.locked && (
                    <rect
                      x="0"
                      y="0"
                      width={500 * tracingImage.scale}
                      height={350 * tracingImage.scale}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                      className="pointer-events-none"
                    />
                  )}
                </g>
              )}

              {/* 3. Base Vector Elements Layer rendering */}
              {layers.map(layer => {
                if (!layer.visible) return null;
                return (
                  <g key={layer.id} id={layer.id}>
                    {layer.elements.map(el => {
                      if (!el.visible) return null;

                      const d = getPathData(el.nodes, el.closed);
                      const isSelected = selectedElementIds.includes(el.id);

                      // --- 1. LIVE TEXT ELEMENT RENDERING ---
                      if (el.type === 'text') {
                        const minX = Math.min(...el.nodes.map(n => n.anchor.x));
                        const minY = Math.min(...el.nodes.map(n => n.anchor.y));
                        const maxX = Math.max(...el.nodes.map(n => n.anchor.x));
                        const maxY = Math.max(...el.nodes.map(n => n.anchor.y));
                        const w = Math.max(10, maxX - minX);
                        const h = Math.max(10, maxY - minY);
                        const fontSize = el.fontSize || 48;
                        const fontFamily = el.fontFamily || 'Inter';
                        const baselineY = minY + fontSize * 0.82;

                        return (
                          <g key={el.id} id={el.id}>
                            {/* Visual SVG text */}
                            <text
                              x={minX}
                              y={baselineY}
                              fill={el.fill === 'none' ? 'none' : el.fill}
                              fillOpacity={el.fillOpacity ?? 1}
                              stroke={el.strokeWidth === 0 || el.stroke === 'none' ? 'none' : (isSelected ? '#2563eb' : el.stroke)}
                              strokeWidth={el.strokeWidth === 0 || el.stroke === 'none' ? 0 : el.strokeWidth}
                              style={{
                                fontFamily: `"${fontFamily}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
                                fontSize: `${fontSize}px`,
                                fontWeight: el.fontWeight || 600,
                                fontStyle: el.fontStyle || 'normal',
                                letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
                                userSelect: 'none',
                                cursor: el.locked ? 'default' : 'pointer',
                              }}
                              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                              onContextMenu={(e) => handleElementContextMenu(e, el.id)}
                            >
                              {el.text || 'Text'}
                            </text>

                            {/* Transparent click & select target hitbox */}
                            <rect
                              x={minX - 4}
                              y={minY - 4}
                              width={w + 8}
                              height={h + 8}
                              fill="transparent"
                              stroke={isSelected ? '#2563eb' : 'transparent'}
                              strokeWidth={isSelected ? 1 / zoom : 0}
                              strokeDasharray={isSelected ? `${4 / zoom} ${4 / zoom}` : undefined}
                              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                              onContextMenu={(e) => handleElementContextMenu(e, el.id)}
                              style={{ cursor: el.locked ? 'default' : 'pointer' }}
                            />
                          </g>
                        );
                      }

                      const appliedBrush = el.brushId ? brushes.find(b => b.id === el.brushId) : null;
                      const deformedBrushEls = appliedBrush ? applyBrushToStroke(el, appliedBrush) : null;

                      return (
                        <g key={el.id} id={el.id}>
                          {deformedBrushEls && deformedBrushEls.length > 0 ? (
                            /* Render Brush graphics along stroke */
                            <g
                              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                              onContextMenu={(e) => handleElementContextMenu(e, el.id)}
                              style={{ cursor: el.locked ? 'default' : 'pointer' }}
                            >
                              {/* Optional underlying path fill if set */}
                              {el.fill !== 'none' && (
                                <path
                                  d={d}
                                  fill={el.fill}
                                  fillOpacity={el.fillOpacity}
                                  fillRule="evenodd"
                                  stroke="none"
                                />
                              )}
                              {deformedBrushEls.map(bEl => {
                                const bD = getPathData(bEl.nodes, bEl.closed);
                                return (
                                  <path
                                    key={bEl.id}
                                    d={bD}
                                    fill={bEl.fill}
                                    fillOpacity={bEl.fill === 'none' ? 0 : bEl.fillOpacity}
                                    fillRule="evenodd"
                                    stroke={bEl.strokeWidth === 0 || bEl.stroke === 'none' ? 'none' : (isSelected ? '#2563eb' : bEl.stroke)}
                                    strokeWidth={bEl.strokeWidth === 0 || bEl.stroke === 'none' ? 0 : (isSelected ? bEl.strokeWidth + 1 : bEl.strokeWidth)}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className="transition-colors duration-150"
                                  />
                                );
                              })}
                            </g>
                          ) : (
                            /* Inner / Fill Area path (Standard Vector Stroke) */
                            <path
                              d={d}
                              fill={el.fill}
                              fillOpacity={el.fill === 'none' ? 0 : el.fillOpacity}
                              fillRule="evenodd"
                              stroke={el.strokeWidth === 0 || el.stroke === 'none' ? 'none' : (isSelected ? '#2563eb' : el.stroke)}
                              strokeWidth={el.strokeWidth === 0 || el.stroke === 'none' ? 0 : (isSelected ? el.strokeWidth + 1.5 : el.strokeWidth)}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                              onContextMenu={(e) => handleElementContextMenu(e, el.id)}
                              className="transition-colors duration-150"
                              style={{ cursor: el.locked ? 'default' : 'pointer' }}
                            />
                          )}

                          {/* Hit area so path can be clicked/selected even with 0 stroke width or transparent fill */}
                          <path
                            d={d}
                            fill={el.fill === 'none' ? 'none' : 'transparent'}
                            fillRule="evenodd"
                            stroke="transparent"
                            strokeWidth={Math.max(el.strokeWidth, 12 / zoom)}
                            onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                            onContextMenu={(e) => handleElementContextMenu(e, el.id)}
                            className="pointer-events-auto"
                            style={{ cursor: el.locked ? 'default' : 'pointer' }}
                          />

                          {/* Selected Element boundary highlights */}
                          {isSelected && (
                            <path
                              d={d}
                              fill="none"
                              fillRule="evenodd"
                              stroke="#2563eb"
                              strokeWidth={1 / zoom}
                              strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                              className="pointer-events-none"
                            />
                          )}

                          {/* Render interactive path segments in direct-select, pen, or add-anchor mode */}
                          {(tool === 'direct-select' || tool === 'pen' || tool === 'add-anchor') && (isSelected || tool === 'add-anchor') && !el.locked && (
                            <g>
                              {el.nodes.map((node, idx) => {
                                if (!node || !node.anchor) return null;
                                if (idx === el.nodes.length - 1 && !el.closed) return null;
                                const nextIdx = idx === el.nodes.length - 1 ? 0 : idx + 1;
                                const nextNode = el.nodes[nextIdx];
                                if (!nextNode || !nextNode.anchor) return null;

                                const segmentD = `M ${node.anchor.x} ${node.anchor.y}` + getSegmentCommand(node, nextNode);
                                const isAddMode = tool === 'pen' || tool === 'add-anchor';
                                const isSegSelected = selectedSegment && selectedSegment.elementId === el.id && selectedSegment.fromIdx === idx;

                                return (
                                  <g key={`segment-group-${idx}`}>
                                    {isSegSelected && (
                                      <path
                                        d={segmentD}
                                        fill="none"
                                        stroke="#3b82f6"
                                        strokeWidth={Math.max(3, 4 / zoom)}
                                        strokeLinecap="round"
                                        className="pointer-events-none"
                                      />
                                    )}
                                    <path
                                      key={`segment-${idx}`}
                                      d={segmentD}
                                      fill="none"
                                      stroke="transparent"
                                      strokeWidth={Math.max(6, 14 / zoom)}
                                      className={`transition-colors duration-75 ${
                                        isAddMode
                                          ? 'hover:stroke-blue-500/50 cursor-copy'
                                          : isSegSelected
                                          ? 'stroke-blue-500/30 cursor-grab active:cursor-grabbing'
                                          : 'hover:stroke-indigo-400/50 cursor-grab active:cursor-grabbing'
                                      }`}
                                      onMouseDown={(e) => handleSegmentMouseDown(e, el.id, idx, nextIdx, node, nextNode)}
                                      onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setSelectedSegment({ elementId: el.id, fromIdx: idx, toIdx: nextIdx });
                                        setSelectedNodes([
                                          { elementId: el.id, nodeId: node.id },
                                          { elementId: el.id, nodeId: nextNode.id }
                                        ]);
                                        setSelectedNodeInfo({ elementId: el.id, nodeId: nextNode.id });
                                        if (!selectedElementIds.includes(el.id)) {
                                          setSelectedElementIds([el.id]);
                                        }
                                        const canvasPt = getCanvasCoords(e);
                                        setContextMenu({
                                          x: e.clientX,
                                          y: e.clientY,
                                          canvasCoords: canvasPt,
                                          targetElementId: el.id,
                                        });
                                      }}
                                      title={
                                        isAddMode
                                          ? 'Click on segment to add anchor point (+)'
                                          : 'Click to select section, drag to bend curve, press Delete / ⌫ to delete section'
                                      }
                                    />
                                  </g>
                                );
                              })}
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

              {/* Alignment Guides (Smart Guides) */}
              {activeGuides.map((guide, idx) => {
                if (guide.type === 'vertical') {
                  return (
                    <line
                      key={`guide-v-${idx}`}
                      x1={guide.coord}
                      y1={guide.minVal - 100}
                      x2={guide.coord}
                      y2={guide.maxVal + 100}
                      stroke="#ff00ff"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray="4 4"
                      className="pointer-events-none"
                    />
                  );
                } else {
                  return (
                    <line
                      key={`guide-h-${idx}`}
                      x1={guide.minVal - 100}
                      y1={guide.coord}
                      x2={guide.maxVal + 100}
                      y2={guide.coord}
                      stroke="#ff00ff"
                      strokeWidth={1.5 / zoom}
                      strokeDasharray="4 4"
                      className="pointer-events-none"
                    />
                  );
                }
              })}

              {/* Active Snap Indicator Badge */}
              {snapBadge && (
                <g className="pointer-events-none select-none">
                  <rect
                    x={snapBadge.x + 14 / zoom}
                    y={snapBadge.y - 24 / zoom}
                    width={Math.max(110, snapBadge.text.length * 7.5) / zoom}
                    height={20 / zoom}
                    rx={4 / zoom}
                    fill="#0f172a"
                    fillOpacity={0.92}
                    stroke="#818cf8"
                    strokeWidth={1 / zoom}
                  />
                  <text
                    x={snapBadge.x + 20 / zoom}
                    y={snapBadge.y - 13 / zoom}
                    fill="#ffffff"
                    fontSize={10.5 / zoom}
                    fontWeight="600"
                    fontFamily="sans-serif"
                    dominantBaseline="middle"
                  >
                    📐 {snapBadge.text}
                  </text>
                </g>
              )}

              {/* Combined Selection Bounding Box and Resize Handles */}
              {(() => {
                if (tool !== 'select' || selectedElementIds.length === 0) return null;
                const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
                if (selectedEls.length === 0) return null;

                const box = getCombinedBoundingBox(selectedEls);
                const strokeW = 1.5 / zoom;
                const handleSize = 8 / zoom;
                const halfSize = handleSize / 2;

                const handles = [
                  { id: 'nw', x: box.minX, y: box.minY, cursor: 'nwse-resize' },
                  { id: 'n', x: box.centerX, y: box.minY, cursor: 'ns-resize' },
                  { id: 'ne', x: box.maxX, y: box.minY, cursor: 'nesw-resize' },
                  { id: 'e', x: box.maxX, y: box.centerY, cursor: 'ew-resize' },
                  { id: 'se', x: box.maxX, y: box.maxY, cursor: 'nwse-resize' },
                  { id: 's', x: box.centerX, y: box.maxY, cursor: 'ns-resize' },
                  { id: 'sw', x: box.minX, y: box.maxY, cursor: 'nesw-resize' },
                  { id: 'w', x: box.minX, y: box.centerY, cursor: 'ew-resize' },
                ];

                return (
                  <g>
                    {/* Bounding box rect */}
                    <rect
                      x={box.minX}
                      y={box.minY}
                      width={box.width}
                      height={box.height}
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth={strokeW}
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                      className="pointer-events-none"
                    />

                    {/* Floating Dimensions Label in active unit (e.g. mm) */}
                    <g
                      transform={`translate(${box.centerX}, ${box.maxY + 18 / zoom})`}
                      className="pointer-events-none select-none"
                    >
                      <rect
                        x={-55 / zoom}
                        y={-10 / zoom}
                        width={110 / zoom}
                        height={20 / zoom}
                        rx={5 / zoom}
                        fill="#0f172a"
                        fillOpacity={0.92}
                        stroke="#334155"
                        strokeWidth={0.75 / zoom}
                      />
                      <text
                        x={0}
                        y={3.5 / zoom}
                        fill="#f8fafc"
                        fontSize={`${9.5 / zoom}px`}
                        fontFamily="monospace"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {`W: ${pxToUnit(box.width, unit).toFixed(1)} × H: ${pxToUnit(box.height, unit).toFixed(1)} ${unit}`}
                      </text>
                    </g>

                    {/* 8 resize handles */}
                    {handles.map(h => (
                      <rect
                        key={h.id}
                        x={h.x - halfSize}
                        y={h.y - halfSize}
                        width={handleSize}
                        height={handleSize}
                        fill="#ffffff"
                        stroke="#4f46e5"
                        strokeWidth={1.5 / zoom}
                        style={{ cursor: h.cursor }}
                        onMouseDown={(e) => {
                          if (e.button === 1) return; // Allow middle-click to bubble to canvas for panning
                          if (e.button !== 0) return; // Only left-click starts dragging

                          // Save starting state for undo/redo
                          layersBeforeInteractionRef.current = JSON.parse(JSON.stringify(layers));

                          e.stopPropagation();
                          e.preventDefault();
                          setIsResizing(true);
                          setResizingHandle(h.id);
                          setResizeStartBox({ ...box });
                          setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
                          setDragStartElementsBackup(JSON.parse(JSON.stringify(getAllElements())));
                        }}
                      />
                    ))}
                  </g>
                );
              })()}

              {/* 4. ACTIVE DRAWING PEN LIVE PREVIEW GUIDE */}
              {tool === 'pen' && activePathId && penPreviewPos && (
                (() => {
                  const activePath = getAllElements().find(v => v.id === activePathId);
                  if (activePath && activePath.nodes.length > 0) {
                    const lastNode = activePath.nodes[activePath.nodes.length - 1];
                    const anchorStart = lastNode.anchor;
                    const previewCmd = lastNode.handleOut 
                      ? `M ${anchorStart.x} ${anchorStart.y} C ${lastNode.handleOut.x} ${lastNode.handleOut.y}, ${penPreviewPos.x} ${penPreviewPos.y}, ${penPreviewPos.x} ${penPreviewPos.y}`
                      : `M ${anchorStart.x} ${anchorStart.y} L ${penPreviewPos.x} ${penPreviewPos.y}`;

                    return (
                      <g className="pointer-events-none">
                        <path
                          d={previewCmd}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth={1.5 / zoom}
                          strokeDasharray={`${3 / zoom} ${3 / zoom}`}
                        />
                        <circle
                          cx={penPreviewPos.x}
                          cy={penPreviewPos.y}
                          r={3 / zoom}
                          fill="#6366f1"
                        />
                      </g>
                    );
                  }
                  return null;
                })()
              )}

              {/* 5. Direct Select / Pen Mode: Node handles / anchor point markers */}
              {(tool === 'direct-select' || tool === 'pen' || tool === 'add-anchor' || tool === 'delete-anchor' || tool === 'anchor-convert') && (
                (() => {
                  const nodeScale = 1 / zoom;
                  // Crisp screen-constant anchor node dimensions (~8px on screen)
                  const anchorSize = 8 * nodeScale;
                  const anchorHalf = anchorSize / 2;
                  const anchorRadius = 1.2 * nodeScale;
                  const anchorStroke = 1.5 * nodeScale;

                  // Generous invisible hit-box so selecting/dragging anchors is effortless at any zoom
                  const anchorHitSize = Math.max(anchorSize, 18 * nodeScale);
                  const anchorHitHalf = anchorHitSize / 2;

                  // Tangent handles:
                  const handleLineWidth = 1.2 * nodeScale;
                  const handleRadius = 3.5 * nodeScale;
                  const handleStroke = 1.5 * nodeScale;
                  const handleHitRadius = Math.max(handleRadius, 9 * nodeScale);

                  return layers.map(layer => {
                    if (!layer.visible) return null;
                    return layer.elements.map(el => {
                      if (!el.visible || !selectedElementIds.includes(el.id)) return null;

                      return el.nodes.map((node, nodeIdx) => {
                        if (!node || !node.anchor) return null;
                        const isThisNodeSelected = isNodeSelected(el.id, node.id);

                        return (
                          <g key={node.id} id={`nodes-overlay-${node.id}`}>
                            {/* Left Handle In (Inbound tangent) */}
                            {node.handleIn && (
                              <g>
                                <line
                                  x1={node.anchor.x}
                                  y1={node.anchor.y}
                                  x2={node.handleIn.x}
                                  y2={node.handleIn.y}
                                  stroke="#dc2626"
                                  strokeWidth={handleLineWidth}
                                  className="pointer-events-none"
                                />
                                {/* Large invisible hit area for easy mouse grabbing */}
                                <circle
                                  cx={node.handleIn.x}
                                  cy={node.handleIn.y}
                                  r={handleHitRadius}
                                  fill="transparent"
                                  style={{ cursor: getCustomCursor('pointer') }}
                                  onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'handleIn')}
                                />
                                {/* Visual crisp handle point that stays small when zoomed in */}
                                <circle
                                  cx={node.handleIn.x}
                                  cy={node.handleIn.y}
                                  r={handleRadius}
                                  fill="#fff"
                                  stroke="#dc2626"
                                  strokeWidth={handleStroke}
                                  className="pointer-events-none"
                                />
                              </g>
                            )}

                            {/* Right Handle Out (Outbound tangent) */}
                            {node.handleOut && (
                              <g>
                                <line
                                  x1={node.anchor.x}
                                  y1={node.anchor.y}
                                  x2={node.handleOut.x}
                                  y2={node.handleOut.y}
                                  stroke="#2563eb"
                                  strokeWidth={handleLineWidth}
                                  className="pointer-events-none"
                                />
                                {/* Large invisible hit area for easy mouse grabbing */}
                                <circle
                                  cx={node.handleOut.x}
                                  cy={node.handleOut.y}
                                  r={handleHitRadius}
                                  fill="transparent"
                                  style={{ cursor: getCustomCursor('pointer') }}
                                  onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'handleOut')}
                                />
                                {/* Visual crisp handle point that stays small when zoomed in */}
                                <circle
                                  cx={node.handleOut.x}
                                  cy={node.handleOut.y}
                                  r={handleRadius}
                                  fill="#fff"
                                  stroke="#2563eb"
                                  strokeWidth={handleStroke}
                                  className="pointer-events-none"
                                />
                              </g>
                            )}

                            {/* Path-closing indicator ring when hovering near start node in pen mode */}
                            {tool === 'pen' && activePathId === el.id && nodeIdx === 0 && !el.closed && el.nodes.length > 2 && penPreviewPos && distance(penPreviewPos, node.anchor) < 16 * nodeScale && (
                              <circle
                                cx={node.anchor.x}
                                cy={node.anchor.y}
                                r={7 * nodeScale}
                                fill="none"
                                stroke="#2563eb"
                                strokeWidth={1.5 * nodeScale}
                                strokeDasharray={`${2 * nodeScale} ${2 * nodeScale}`}
                                className="pointer-events-none animate-pulse"
                              />
                            )}

                            {/* Core Anchor Node Body */}
                            <g>
                              {/* Invisible hit box */}
                              <rect
                                x={node.anchor.x - anchorHitHalf}
                                y={node.anchor.y - anchorHitHalf}
                                width={anchorHitSize}
                                height={anchorHitSize}
                                fill="transparent"
                                style={{
                                  cursor:
                                    tool === 'delete-anchor'
                                      ? getCustomCursor('pointer')
                                      : tool === 'anchor-convert'
                                      ? getCustomCursor('crosshair')
                                      : getCustomCursor('pointer'),
                                }}
                                onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'anchor')}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (!isThisNodeSelected) {
                                    setSelectedNodes([{ elementId: el.id, nodeId: node.id }]);
                                    setSelectedNodeInfo({ elementId: el.id, nodeId: node.id });
                                    if (!selectedElementIds.includes(el.id)) {
                                      setSelectedElementIds([el.id]);
                                    }
                                  }
                                  const canvasPt = getCanvasCoords(e);
                                  setContextMenu({
                                    x: e.clientX,
                                    y: e.clientY,
                                    canvasCoords: canvasPt,
                                    targetElementId: el.id,
                                  });
                                }}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  handleSharpenNode(el.id, node.id);
                                }}
                                title={
                                  tool === 'delete-anchor'
                                    ? `Click to delete anchor ${nodeIdx + 1} (-)`
                                    : tool === 'anchor-convert'
                                    ? `Click: sharp corner, Drag: pull smooth handles (Shift+C)`
                                    : `Anchor ${nodeIdx + 1} (${node.type}) - Double-click to toggle smooth/corner, Right-click for options`
                                }
                              />
                              {/* Visual anchor square (scales inversely with zoom so it never grows too big) */}
                              <rect
                                x={node.anchor.x - anchorHalf}
                                y={node.anchor.y - anchorHalf}
                                width={anchorSize}
                                height={anchorSize}
                                rx={anchorRadius}
                                fill={isThisNodeSelected ? '#2563eb' : '#fff'}
                                stroke={isThisNodeSelected ? '#1d4ed8' : '#2563eb'}
                                strokeWidth={anchorStroke}
                                className="pointer-events-none"
                              />
                              {isThisNodeSelected && (
                                <rect
                                  x={node.anchor.x - anchorHalf * 0.45}
                                  y={node.anchor.y - anchorHalf * 0.45}
                                  width={anchorSize * 0.45}
                                  height={anchorSize * 0.45}
                                  fill="#ffffff"
                                  className="pointer-events-none"
                                />
                              )}
                            </g>
                          </g>
                        );
                      });
                    });
                  });
                })()
              )}

              {/* Segment Hover Indicator in Pen / Add Anchor Mode */}
              {segmentHoverPreview && segmentHoverPreview.point && (
                <g className="pointer-events-none">
                  <circle
                    cx={segmentHoverPreview.point.x}
                    cy={segmentHoverPreview.point.y}
                    r={5 / zoom}
                    fill="#2563eb"
                    stroke="#ffffff"
                    strokeWidth={1.5 / zoom}
                  />
                  <rect
                    x={segmentHoverPreview.point.x + 4 / zoom}
                    y={segmentHoverPreview.point.y - 14 / zoom}
                    width={12 / zoom}
                    height={12 / zoom}
                    rx={2 / zoom}
                    fill="#2563eb"
                  />
                  <text
                    x={segmentHoverPreview.point.x + 10 / zoom}
                    y={segmentHoverPreview.point.y - 5 / zoom}
                    fontSize={11 / zoom}
                    fontWeight="bold"
                    fill="#ffffff"
                    textAnchor="middle"
                    className="select-none"
                  >
                    +
                  </text>
                </g>
              )}

              {/* Selection Marquee Box */}
              {selectionBox && (
                <g className="pointer-events-none">
                  <rect
                    x={Math.min(selectionBox.start.x, selectionBox.current.x)}
                    y={Math.min(selectionBox.start.y, selectionBox.current.y)}
                    width={Math.abs(selectionBox.start.x - selectionBox.current.x)}
                    height={Math.abs(selectionBox.start.y - selectionBox.current.y)}
                    fill={tool === 'direct-select' ? 'rgba(99, 102, 241, 0.12)' : 'rgba(37, 99, 235, 0.08)'}
                    stroke={tool === 'direct-select' ? '#6366f1' : '#2563eb'}
                    strokeWidth={1.5 / zoom}
                    strokeDasharray={tool === 'direct-select' ? `${3 / zoom} ${3 / zoom}` : `${4 / zoom} ${4 / zoom}`}
                  />
                  {tool === 'direct-select' && selectedNodes.length > 0 && (
                    <g
                      transform={`translate(${Math.max(selectionBox.start.x, selectionBox.current.x) + 6 / zoom}, ${Math.min(selectionBox.start.y, selectionBox.current.y)})`}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={Math.max(68, 70 / zoom)}
                        height={18 / zoom}
                        rx={3 / zoom}
                        fill="#312e81"
                        opacity={0.92}
                      />
                      <text
                        x={Math.max(34, 35 / zoom)}
                        y={12.5 / zoom}
                        fill="#ffffff"
                        fontSize={10 / zoom}
                        fontFamily="sans-serif"
                        fontWeight="bold"
                        textAnchor="middle"
                      >
                        {selectedNodes.length} node{selectedNodes.length > 1 ? 's' : ''}
                      </text>
                    </g>
                  )}
                </g>
              )}
            </g>
          </svg>

          {/* Quick Zoom / Pan HUD controller overlay */}
          <div className="absolute bottom-4 left-4 bg-white/95 border border-slate-200/80 rounded-lg p-2 flex items-center gap-3 z-30 shadow-lg text-xs">
            <div className="font-mono text-slate-700 font-semibold flex items-center gap-1.5">
              <span>Zoom:</span>
              <span className="text-indigo-600 font-bold">{Math.round(zoom * 100)}%</span>
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => zoomToPoint(zoomRef.current / 1.25)}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded transition font-semibold active:scale-95 shadow-2xs hover:border-slate-300"
                title="Zoom Out (Ctrl - or Wheel Down)"
              >
                -
              </button>
              <button
                onClick={() => zoomToPoint(1)}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded transition font-semibold active:scale-95 shadow-2xs hover:border-slate-300"
                title="Reset Zoom to 100% (Ctrl 0)"
              >
                100%
              </button>
              <button
                onClick={() => zoomToPoint(zoomRef.current * 1.25)}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded transition font-semibold active:scale-95 shadow-2xs hover:border-slate-300"
                title="Zoom In (Ctrl + or Wheel Up)"
              >
                +
              </button>
            </div>
            <div className="w-[1px] h-4 bg-slate-200"></div>
            <button
              onClick={() => {
                const targetPan = { x: 100, y: 50 };
                panOffsetRef.current = targetPan;
                zoomRef.current = 1;
                setPanOffset(targetPan);
                setZoom(1);
              }}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded flex items-center gap-1 text-[11px] transition font-semibold active:scale-95 shadow-2xs hover:border-slate-300"
              title="Reset view camera position to center"
            >
              <RotateCcw size={12} /> Re-center
            </button>
            <div className="text-[10px] text-slate-400 hidden md:inline ml-1 font-medium">
              Zooms directly to mouse cursor (Wheel / Ctrl +/-)
            </div>
          </div>
        </div>
 
        {/* --- Right Inspector Panel (Properties, Pathfinder & Layers) --- */}
        <aside className="w-80 bg-white border-l border-slate-200/80 flex flex-col z-30 select-none overflow-y-auto max-h-[100%]">
          
          {/* Section: Object Transform, Width, Height & Positioning in active unit (mm) */}
          <TransformPanel
            selectedElements={getAllElements().filter(el => selectedElementIds.includes(el.id))}
            unit={unit}
            onUnitChange={setUnit}
            onUpdateDimensions={handleUpdateDimensions}
            onFlipHorizontal={() => handleMirrorAction('flip-horizontal')}
            onFlipVertical={() => handleMirrorAction('flip-vertical')}
            artboardWidth={artboardWidth}
            artboardHeight={artboardHeight}
            showRulers={showRulers}
            onToggleRulers={() => setShowRulers(r => !r)}
          />

          {/* Section: Typography / Character Panel */}
          {activeSelectedElement?.type === 'text' && (
            <TextPropertiesPanel
              selectedElement={activeSelectedElement}
              onUpdateElement={updateSelectedTextElement}
              fonts={fonts}
              onOpenComputerFontsModal={() => setIsComputerFontsModalOpen(true)}
              onUploadFontFile={() => fontFileInputRef.current?.click()}
              onCreateOutlines={handleCreateOutlines}
              isOutlining={isOutlining}
            />
          )}

          {tool === 'text' && activeSelectedElement?.type !== 'text' && (
            <div className="p-4 border-b border-blue-100 bg-blue-50/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Type size={14} className="text-blue-600" />
                  Type Tool Active
                </span>
                <button
                  type="button"
                  onClick={() => setIsComputerFontsModalOpen(true)}
                  className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 bg-white border border-blue-200 px-2 py-0.5 rounded shadow-xs"
                >
                  Computer Fonts
                </button>
              </div>
              <p className="text-[11px] text-blue-700 leading-relaxed">
                Click anywhere on the artboard canvas to place vector text and choose from your computer fonts.
              </p>
            </div>
          )}

          {/* Section: Properties fill and stroke */}
          <div className="p-4 border-b border-slate-200/80">
            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-3">Properties</h3>
            
            <div className="space-y-4">
              
              {/* Designer Fill Swatch Selectors */}
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5 font-semibold">Fill Color</label>
                <div className="grid grid-cols-4 gap-1.5 font-sans">
                  {ART_PALETTE.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => {
                        setFillColor(color.value);
                        updateSelectedElementsProperty('fill', color.value, true);
                      }}
                      className={`h-7 rounded border relative transition flex items-center justify-center ${
                        fillColor === color.value ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-400'
                      }`}
                      style={{
                        backgroundColor: color.value === 'none' ? 'transparent' : color.value,
                        backgroundImage: color.value === 'none' ? 'linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%), linear-gradient(45deg, #eee 25%, transparent 25%, transparent 75%, #eee 75%)' : 'none',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0, 5px 5px'
                      }}
                      title={color.name}
                    >
                      {fillColor === color.value && (
                        <Check size={14} className={color.value === '#ffffff' ? 'text-black' : 'text-white'} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Opacity slider */}
              {fillColor !== 'none' && (
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-semibold mb-1">
                    <span>Opacity</span>
                    <span>{Math.round(fillOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={fillOpacity}
                    onMouseDown={() => pushHistory(layers)}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFillOpacity(val);
                      updateSelectedElementsProperty('fillOpacity', val, false);
                    }}
                    className="w-full accent-blue-600 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              {/* Stroke controls with option to remove stroke (0 width) */}
              <div className="pt-2 border-t border-slate-100/90 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] text-slate-600 font-bold uppercase tracking-wider">Stroke</label>
                    {strokeWidth === 0 && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-50 text-rose-600 border border-rose-200">
                        None (0px)
                      </span>
                    )}
                  </div>

                  {/* Dedicated Toggle/Button to Remove Stroke (0 width) */}
                  <button
                    type="button"
                    onClick={() => {
                      pushHistory(layers);
                      if (strokeWidth === 0) {
                        const restored = lastNonZeroStrokeWidthRef.current > 0 ? lastNonZeroStrokeWidthRef.current : 2;
                        setStrokeWidth(restored);
                        updateSelectedElementsProperty('strokeWidth', restored, false);
                      } else {
                        lastNonZeroStrokeWidthRef.current = strokeWidth;
                        setStrokeWidth(0);
                        updateSelectedElementsProperty('strokeWidth', 0, false);
                      }
                    }}
                    className={`px-2 py-1 rounded text-[11px] flex items-center gap-1.5 transition border cursor-pointer ${
                      strokeWidth === 0
                        ? 'bg-rose-50 text-rose-700 border-rose-200 font-semibold shadow-2xs hover:bg-rose-100'
                        : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200 hover:text-slate-900 active:scale-95'
                    }`}
                    title={strokeWidth === 0 ? "Restore stroke to previous width" : "Remove stroke (set width to 0)"}
                  >
                    <Slash size={11} className={strokeWidth === 0 ? "text-rose-600 font-bold" : "text-slate-400"} />
                    <span>{strokeWidth === 0 ? 'No Stroke (0px)' : 'Remove Stroke'}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1 font-medium">Color</label>
                    <div className="flex gap-1.5 items-center">
                      <input
                        type="color"
                        value={strokeColor.startsWith('#') ? strokeColor : '#111827'}
                        disabled={strokeWidth === 0}
                        onMouseDown={() => pushHistory(layers)}
                        onChange={(e) => {
                          setStrokeColor(e.target.value);
                          updateSelectedElementsProperty('stroke', e.target.value, false);
                        }}
                        className={`w-8 h-8 rounded border border-slate-200 bg-transparent cursor-pointer ${
                          strokeWidth === 0 ? 'opacity-30 cursor-not-allowed' : ''
                        }`}
                        title={strokeWidth === 0 ? "Stroke is removed (0 width)" : "Choose stroke color"}
                      />
                      <div className={`text-[10px] font-mono ${strokeWidth === 0 ? 'text-slate-300 line-through' : 'text-slate-500'}`}>
                        {strokeWidth === 0 ? 'None' : strokeColor}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] text-slate-400 mb-1 font-medium flex justify-between">
                      <span>Width</span>
                      <span className="font-mono text-slate-500 font-semibold">
                        {strokeWidth === 0 ? '0px' : `${strokeWidth}px`}
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="48"
                      value={strokeWidth}
                      onFocus={() => pushHistory(layers)}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        const val = isNaN(raw) ? 0 : Math.max(0, Math.min(48, raw));
                        if (val > 0) {
                          lastNonZeroStrokeWidthRef.current = val;
                        }
                        setStrokeWidth(val);
                        updateSelectedElementsProperty('strokeWidth', val, false);
                      }}
                      className={`w-full bg-white border rounded px-2 py-1 text-xs font-mono focus:border-blue-500 focus:outline-none ${
                        strokeWidth === 0 ? 'border-rose-200 text-rose-600 font-bold bg-rose-50/30' : 'border-slate-200 text-slate-800'
                      }`}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Quick Stroke Width Preset Chips including 0 (None) */}
                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  <span className="text-[10px] text-slate-400 mr-0.5">Presets:</span>
                  {[
                    { label: '0 (None)', val: 0 },
                    { label: '1px', val: 1 },
                    { label: '2px', val: 2 },
                    { label: '3px', val: 3 },
                    { label: '5px', val: 5 },
                    { label: '8px', val: 8 },
                  ].map(preset => (
                    <button
                      key={preset.val}
                      type="button"
                      onClick={() => {
                        pushHistory(layers);
                        if (preset.val > 0) {
                          lastNonZeroStrokeWidthRef.current = preset.val;
                        }
                        setStrokeWidth(preset.val);
                        updateSelectedElementsProperty('strokeWidth', preset.val, false);
                      }}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition border cursor-pointer ${
                        strokeWidth === preset.val
                          ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold shadow-2xs'
                          : 'bg-white hover:bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-800'
                      }`}
                      title={preset.val === 0 ? "Remove stroke completely (width of 0)" : `Set stroke width to ${preset.val}px`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stroke to Path (Outline Stroke) Quick Inspector Action */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => handleStrokeToPath()}
                  disabled={selectedElementIds.length === 0}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition shadow-xs border ${
                    selectedElementIds.length > 0
                      ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-700 cursor-pointer active:scale-98'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                  title="Trace both sides of the stroke into editable path lines (Ctrl+Shift+O)"
                >
                  <Spline size={14} />
                  <span>Stroke to Path (Outline)</span>
                </button>
                <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 px-0.5">
                  <span>Traces both sides into paths</span>
                  <span className="font-mono text-purple-600 font-semibold">Ctrl+Shift+O</span>
                </div>
              </div>

              {/* Expand into Shapes (Object > Expand) Quick Inspector Action */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleExpandToShapes()}
                  disabled={selectedElementIds.length === 0}
                  className={`w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition shadow-xs border ${
                    selectedElementIds.length > 0
                      ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 cursor-pointer active:scale-98'
                      : 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  }`}
                  title="Turn brush strokes & paths into independent, editable closed vector shapes (Ctrl+E)"
                >
                  <Shapes size={14} />
                  <span>Expand into Shapes</span>
                </button>
                <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 px-0.5">
                  <span>Turns paths & brushes into shapes</span>
                  <span className="font-mono text-amber-600 font-semibold">Ctrl+E</span>
                </div>
              </div>

              {/* Active element closure toggle */}
              {activeSelectedElement && (
                <div className="flex items-center justify-between bg-slate-50/60 p-2.5 rounded-lg border border-slate-200/80 text-[11px]">
                  <span className="text-slate-700 font-semibold">Close Vector Path Loop</span>
                  <input
                    type="checkbox"
                    checked={activeSelectedElement.closed}
                    onChange={(e) => {
                      updateSelectedElementsProperty('closed', e.target.checked, true);
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-white border-slate-200"
                  />
                </div>
              )}

              {/* Illustrator Pen & Anchor Tools Inspector Widget */}
              {selectedElementIds.length > 0 && (
                <div className="bg-slate-50/70 p-3 rounded-lg border border-slate-200/90 space-y-2.5">
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Anchor & Pen Tools</span>
                    <span className="font-mono text-[9px] text-blue-600 font-semibold">P / + / -</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setTool('add-anchor')}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                        tool === 'add-anchor'
                          ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                      }`}
                      title="Add Anchor Point Tool: click any path segment to insert a node (+)"
                    >
                      <Plus size={13} className={tool === 'add-anchor' ? 'text-white' : 'text-blue-600'} />
                      <span>Add Node (+)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (selectedNodes.length > 0 || selectedNodeInfo || selectedSegment) {
                          handleDeleteSelected();
                        } else {
                          setTool('delete-anchor');
                        }
                      }}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                        selectedNodes.length > 0
                          ? 'bg-red-50 text-red-700 hover:bg-red-100 border-red-200 shadow-xs'
                          : tool === 'delete-anchor'
                          ? 'bg-red-600 text-white border-red-700 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                      }`}
                      title={
                        selectedNodes.length > 0
                          ? `Delete selected ${selectedNodes.length} node${selectedNodes.length > 1 ? 's' : ''} and break section (Delete / Backspace)`
                          : 'Delete Anchor Point Tool: click an anchor to remove it (-)'
                      }
                    >
                      <Minus size={13} className={selectedNodes.length > 0 ? 'text-red-700' : tool === 'delete-anchor' ? 'text-white' : 'text-red-600'} />
                      <span>
                        {selectedNodes.length > 1
                          ? `Delete Section (${selectedNodes.length})`
                          : selectedNodes.length === 1 || selectedNodeInfo
                          ? 'Delete Node / Section'
                          : 'Delete Node (-)'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setTool('anchor-convert');
                      }}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 transition border cursor-pointer ${
                        tool === 'anchor-convert'
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                          : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200'
                      }`}
                      title="Anchor Point Tool: click to sharpen corner, drag to pull smooth handles (Shift+C)"
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 19 L12 5 L19 19" />
                      </svg>
                      <span>Convert (Shift+C)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddAnchorPointsToPath()}
                      className="py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition cursor-pointer"
                      title="Illustrator Object > Path > Add Anchor Points: subdivides all segments with midpoint nodes"
                    >
                      <Sparkles size={12} className="text-amber-500" />
                      <span>Subdivide Path</span>
                    </button>

                    {selectedNodeInfo && (
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedNodeInfo) {
                            pushHistory(layers);
                            setLayers(prev =>
                              prev.map(layer => ({
                                ...layer,
                                elements: layer.elements.map(el =>
                                  el.id === selectedNodeInfo.elementId
                                    ? snapNodeToRightAngleWithAdjacent(el, selectedNodeInfo.nodeId)
                                    : el
                                ),
                              }))
                            );
                            setExpandToast("Snapped node to 90° right angle to page");
                          }
                        }}
                        className="py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer col-span-2"
                        title="Snap this node to form a perfect 90° right angle (horizontal or vertical) with the adjacent node"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 20 L20 20" />
                          <path d="M4 20 L4 4" />
                          <rect x="4" y="14" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        </svg>
                        <span>Snap to 90° Right Angle</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        if (selectedElementIds.length > 0) {
                          pushHistory(layers);
                          setLayers(prev =>
                            prev.map(layer => ({
                              ...layer,
                              elements: layer.elements.map(el =>
                                selectedElementIds.includes(el.id)
                                  ? snapPathNodesToRightAngles(el, 15)
                                  : el
                              ),
                            }))
                          );
                          setExpandToast("Squared near-right angles to 90°");
                        }
                      }}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-semibold flex items-center justify-center gap-1.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 transition cursor-pointer ${
                        selectedNodeInfo ? 'col-span-2' : ''
                      }`}
                      title="Squares near-horizontal and near-vertical segments in the path to exact 90° right angles to the page"
                    >
                      <svg className="w-3.5 h-3.5 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 21h18M3 21V3" />
                        <rect x="3" y="15" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                      <span>Square Path to 90° Angles</span>
                    </button>
                  </div>

                  {/* Selected Node Anchor Type Toggle if an anchor is selected */}
                  {selectedNodeInfo && getSelectedNode() && (
                    <div className="pt-1.5 border-t border-slate-200/80">
                      <div className="text-[10px] text-slate-400 font-semibold mb-1">Selected Anchor Type:</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(['corner', 'smooth', 'symmetric'] as NodeType[]).map((t) => {
                          const currNode = getSelectedNode();
                          const isActive = currNode?.type === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => {
                                if (t === 'corner') {
                                  handleConvertNode(selectedNodeInfo.elementId, selectedNodeInfo.nodeId, 'corner');
                                } else {
                                  handleConvertNode(selectedNodeInfo.elementId, selectedNodeInfo.nodeId, 'smooth');
                                }
                              }}
                              className={`py-1 rounded text-[10px] font-semibold capitalize transition ${
                                isActive ? 'bg-blue-600 text-white shadow-xs' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                              }`}
                            >
                              {t}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Section: Illustrator Brushes Library */}
          <div className="p-4 border-b border-slate-200/80">
            <BrushesPanel
              brushes={brushes}
              activeBrushId={activeBrushId}
              selectedElement={activeSelectedElement}
              selectedElementsCount={selectedElementIds.length}
              onSelectBrush={(bId) => {
                handleSelectBrush(bId);
              }}
              onOpenNewBrushModal={() => {
                setIsBrushModalOpen(true);
              }}
              onDeleteBrush={handleDeleteBrush}
              onExpandAppearance={() => {
                handleExpandAppearance();
              }}
              strokeColor={strokeColor}
            />
          </div>

          {/* Section: Tracing Image Parameters and Opacity */}
          {tracingImage && (
            <div className="p-4 border-b border-slate-200/80 bg-slate-50/20">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold uppercase text-blue-600 tracking-wider">Tracing Image Reference</h3>
                <button
                  onClick={() => setTracingImage(null)}
                  className="text-slate-400 hover:text-red-600 text-[10px] font-semibold"
                >
                  Clear Image
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Switch tools */}
                <div className="flex justify-between items-center text-[11px] text-slate-700">
                  <span className="font-semibold truncate max-w-[150px]">{tracingImage.name}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setTracingImage(t => t ? { ...t, visible: !t.visible } : null)}
                      className={`p-1 rounded transition ${tracingImage.visible ? 'text-blue-600 bg-blue-50 border border-blue-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                      title="Toggle Visibility"
                    >
                      {tracingImage.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      onClick={() => setTracingImage(t => t ? { ...t, locked: !t.locked } : null)}
                      className={`p-1 rounded transition ${tracingImage.locked ? 'text-amber-600 bg-amber-50 border border-amber-100 shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                      title="Lock Placement"
                    >
                      {tracingImage.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                  </div>
                </div>

                {/* Opacity slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-semibold mb-1">
                    <span>Translucency opacity</span>
                    <span>{Math.round(tracingImage.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={tracingImage.opacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTracingImage(prev => prev ? { ...prev, opacity: val } : null);
                    }}
                    className="w-full h-1 bg-slate-100 rounded appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Scale slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-semibold mb-1">
                    <span>Scale image reference</span>
                    <span>{Math.round(tracingImage.scale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="3"
                    step="0.05"
                    value={tracingImage.scale}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setTracingImage(prev => prev ? { ...prev, scale: val } : null);
                    }}
                    className="w-full h-1 bg-slate-100 rounded appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Rotation control slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-500 font-semibold mb-1">
                    <span>Rotate reference</span>
                    <span>{tracingImage.rotate}°</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={tracingImage.rotate}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setTracingImage(prev => prev ? { ...prev, rotate: val } : null);
                    }}
                    className="w-full h-1 bg-slate-100 rounded appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Vectorize Action Button */}
                <button
                  type="button"
                  onClick={() => setIsImageTraceModalOpen(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
                >
                  <Wand2 size={13} />
                  Vectorize with Image Trace
                </button>

                <p className="text-[10px] text-slate-400 text-center leading-tight">
                  💡 Drag image on canvas anytime when safety lock is unlocked in select pointing mode.
                </p>

              </div>
            </div>
          )}

          {/* Section: Layers Panel */}
          <div className="p-4 flex-1">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Layers Panel</h3>
              <button
                onClick={handleAddLayer}
                className="flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-700 font-semibold"
                title="Add blank vector layer"
              >
                <Plus size={12} /> Add Layer
              </button>
            </div>

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {layers.map((l, index) => {
                const isActive = l.id === activeLayerId;
                return (
                  <div
                    key={l.id}
                    className={`p-2 rounded-lg border transition ${
                      isActive 
                        ? 'bg-blue-50/50 border-blue-200/80 shadow-sm' 
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                    onClick={() => setActiveLayerId(l.id)}
                  >
                    <div className="flex items-center justify-between gap-1.5 text-xs">
                      {/* Name & Selector */}
                      <span className={`font-medium cursor-pointer truncate max-w-[124px] ${isActive ? 'text-slate-900 font-semibold' : 'text-slate-600'}`}>
                        {l.name}
                      </span>

                      {/* Controls layer icons */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleLayerVisible(l.id)}
                          className={`p-1 rounded ${l.visible ? 'text-slate-500 hover:text-slate-800' : 'text-slate-300'}`}
                          title="Visibility"
                        >
                          {l.visible ? <Eye size={12} /> : <EyeOff size={11} />}
                        </button>
                        <button
                          onClick={() => toggleLayerLocked(l.id)}
                          className={`p-1 rounded ${l.locked ? 'text-amber-600' : 'text-slate-300 hover:text-slate-500'}`}
                          title="Lock layers"
                        >
                          {l.locked ? <Lock size={12} /> : <Unlock size={11} />}
                        </button>

                        {/* Order changers */}
                        <button
                          onClick={() => handleReorderLayer(index, 'up')}
                          disabled={index === 0}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => handleReorderLayer(index, 'down')}
                          disabled={index === layers.length - 1}
                          className="text-slate-400 hover:text-slate-700 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown size={12} />
                        </button>

                        <button
                          onClick={() => handleDeleteLayer(l.id)}
                          className="text-slate-400 hover:text-red-600 pl-1"
                          title="Delete paint Layer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Miniature element list inside current layer for detailed view */}
                    {l.elements.length > 0 && (
                      <div className="mt-2 pl-2 space-y-1 border-l border-slate-200 text-[10px]">
                        {l.elements.map(el => (
                          <div
                            key={el.id}
                            className={`flex justify-between items-center px-1.5 py-0.5 rounded ${
                              selectedElementIds.includes(el.id)
                                ? 'bg-blue-50 text-blue-750 border border-blue-100 font-semibold' 
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElementIds([el.id]);
                            }}
                          >
                            <span className="truncate max-w-[120px]">{el.name}</span>
                            <span className="font-mono text-[9px] text-slate-400">{el.nodes.length} nodes</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </aside>
      </div>

      {/* --- Status & Illustrator Shortcut Hint Rail --- */}
      <footer className="h-9 bg-white border-t border-slate-200/80 px-4 sm:px-6 flex items-center justify-between text-[11px] text-slate-500 font-mono z-25 select-none gap-2">
        <div className="flex items-center gap-2 overflow-hidden">
          <div>
            Tool: <span className="text-slate-800 capitalize font-bold">{tool}</span>
          </div>
          {activePathId && (
            <span className="text-blue-600 font-semibold flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping"></span>
              Drawing path
            </span>
          )}

          {/* Active Modifier Indicators */}
          <div className="flex items-center gap-1 ml-2 text-[10px]">
            <span
              className={`px-1.5 py-0.5 rounded border ${
                isShiftKeyHeld
                  ? 'bg-blue-600 border-blue-700 text-white font-bold shadow-xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              Shift
            </span>
            <span
              className={`px-1.5 py-0.5 rounded border ${
                isCtrlKeyHeld
                  ? 'bg-blue-600 border-blue-700 text-white font-bold shadow-xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              Ctrl
            </span>
            <span
              className={`px-1.5 py-0.5 rounded border ${
                isAltKeyHeld
                  ? 'bg-blue-600 border-blue-700 text-white font-bold shadow-xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500'
              }`}
            >
              Alt
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-right">
          {tool === 'pen' || tool === 'add-anchor' || tool === 'delete-anchor' || tool === 'anchor-convert' ? (
            <span className="hidden md:inline text-[10px] text-slate-600">
              P: Pen | +: Add node on path | -: Delete node | Shift+C: Convert anchor | Alt: break handles | Shift: 45°
            </span>
          ) : tool === 'rect' || tool === 'ellipse' || tool === 'triangle' ? (
            <span className="hidden md:inline text-[10px] text-slate-600">
              Click & Drag to size | Shift: 1:1 ratio | Alt: center anchor
            </span>
          ) : (
            <span className="hidden md:inline text-[10px] text-slate-400">
              Wheel / Ctrl +/-: Zoom to cursor | Middle-click: pan | Ctrl+E: expand | Ctrl+Shift+O: stroke to path | Ctrl+Z/Y: undo/redo
            </span>
          )}
          <span className="text-[10px] text-slate-400">
            {getActiveLayer().elements.reduce((acc, el) => acc + el.nodes.length, 0)} nodes
          </span>
        </div>
      </footer>

      {/* --- Illustrator New Brush Setup Modal --- */}
      <BrushModal
        isOpen={isBrushModalOpen}
        onClose={() => setIsBrushModalOpen(false)}
        selectedElements={selectedElements}
        onSaveBrush={handleSaveNewBrush}
        activeStrokeColor={strokeColor}
      />

      {/* Hidden file input for uploading custom computer font files (.ttf, .otf, .woff) */}
      <input
        ref={fontFileInputRef}
        type="file"
        accept=".ttf,.otf,.woff,.woff2"
        className="hidden"
        onChange={handleFontFileUpload}
      />

      {/* Computer Fonts Modal */}
      <ComputerFontModal
        isOpen={isComputerFontsModalOpen}
        onClose={() => setIsComputerFontsModalOpen(false)}
        onScanSystemFonts={handleScanComputerFonts}
        onUploadFontFile={() => {
          setIsComputerFontsModalOpen(false);
          fontFileInputRef.current?.click();
        }}
        isScanning={isScanningFonts}
        localFontCount={fonts.filter(f => f.category === 'local-api' || f.category === 'file-upload').length}
      />

      {/* Image Trace (Bitmap to Vector) Modal */}
      <ImageTraceModal
        isOpen={isImageTraceModalOpen}
        onClose={() => setIsImageTraceModalOpen(false)}
        activeTracingImage={tracingImage}
        referenceImage={tracingImage}
        onApplyVectorTrace={handleApplyVectorTrace}
        onApplyTrace={handleApplyVectorTrace}
        artboardWidth={artboardWidth}
        artboardHeight={artboardHeight}
        currentStrokeColor={strokeColor}
        currentFillColor={fillColor}
      />

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          canvasCoords={contextMenu.canvasCoords}
          targetElement={contextMenu.targetElementId ? getAllElements().find(el => el.id === contextMenu.targetElementId) || null : null}
          selectedElements={getAllElements().filter(el => selectedElementIds.includes(el.id))}
          hasClipboardContent={copiedElements.length > 0}
          onClose={() => setContextMenu(null)}
          onCopy={handleCopy}
          onCut={handleCut}
          onPaste={handlePaste}
          onPasteAtPos={handlePasteAtPos}
          onDuplicate={handleDuplicate}
          onDelete={handleDeleteSelected}
          onBringToFront={handleBringToFront}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
          onSendToBack={handleSendToBack}
          onFlipHorizontal={() => handleMirrorAction('flip-horizontal')}
          onFlipVertical={() => handleMirrorAction('flip-vertical')}
          onToggleLock={handleToggleLock}
          onCreateOutlines={handleCreateOutlines}
          onExpandAppearance={handleExpandToShapes}
          onPathfinder={handlePathfinder}
          onSelectAll={handleSelectAll}
          onDeselectAll={handleDeselectAll}
          onToggleRulers={() => setShowRulers(prev => !prev)}
          onToggleGrid={() => setGrid(prev => ({ ...prev, visible: !prev.visible }))}
          onResetZoom={handleResetZoom}
          onCopySvgCode={handleCopySvgCode}
          showRulers={showRulers}
          showGrid={grid.visible}
          isDirectSelectMode={tool === 'direct-select'}
          selectedNodesCount={selectedNodes.length || (selectedNodeInfo ? 1 : 0)}
          selectedSegment={!!selectedSegment}
          onOpenImageTrace={() => setIsImageTraceModalOpen(true)}
        />
      )}
    </div>
  );
}
