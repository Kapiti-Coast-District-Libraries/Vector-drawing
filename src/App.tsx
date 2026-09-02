import React, { useState, useRef, useEffect } from 'react';
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
  Compass,
  Grid,
  Maximize2,
  MousePointerSquareDashed,
  Sliders,
  Image as ImageIcon,
  Check,
  RotateCcw,
  Sparkles,
  HelpCircle,
  FileImage,
  Undo,
  Redo,
  Save,
  FolderOpen
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
  AlignmentGuide
} from './types';
import {
  getPathData,
  performPathfinder,
  snapPoint,
  distance,
  getSegmentCommand,
  snapAngle45
} from './utils/vector-math';
import {
  getSpiralTemplate,
  getTeardropTemplate,
  getTwinLeafTemplate
} from './utils/starter-templates';
import { exportToDXF } from './utils/dxf-exporter';
import { mirrorElement, getCombinedBoundingBox, getElementBoundingBox } from './utils/mirror-utils';

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
  const [selectedHandle, setSelectedHandle] = useState<'anchor' | 'handleIn' | 'handleOut' | null>(null);

  // --- Active Path Drawing State (Pen tool) ---
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [penPreviewPos, setPenPreviewPos] = useState<Point | null>(null);
  const [isDrawingDrag, setIsDrawingDrag] = useState<boolean>(false);

  // --- Canvas Settings State ---
  const [zoom, setZoom] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<Point>({ x: 50, y: 10 });
  const [grid, setGrid] = useState<GridConfig>({ size: 24, visible: true, snap: false });
  const [snapToPoints, setSnapToPoints] = useState<boolean>(true);

  // --- Background Reference Image State ---
  const [tracingImage, setTracingImage] = useState<TracingImage | null>(null);

  // --- Copy/Paste buffer ---
  const [copiedElements, setCopiedElements] = useState<PathElement[]>([]);

  // --- Current Properties For New Drawing Elements ---
  const [fillColor, setFillColor] = useState<string>('none');
  const [fillOpacity, setFillOpacity] = useState<number>(1);
  const [strokeColor, setStrokeColor] = useState<string>('#ff007f');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);

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
  const [activeFlyout, setActiveFlyout] = useState<'pathfinder' | 'mirror' | null>(null);

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
  
  // --- Info Modal / Help Drawer State ---
  const [showHelp, setShowHelp] = useState<boolean>(true);

  // Reference for file picker triggers
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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

  // --- COPY & PASTE ACTION ENGINES ---
  const handleCopy = () => {
    if (selectedElementIds.length === 0) return;
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    setCopiedElements(JSON.parse(JSON.stringify(selectedEls)));
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
    // Offset subsequent pastes sequentially by saving the newly offset elements as the copy source
    setCopiedElements(newPastedElements);
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
        if (currentActivePath.nodes.length > 0 && e.shiftKey) {
          const lastNode = currentActivePath.nodes[currentActivePath.nodes.length - 1];
          targetPt = snapAngle45(lastNode.anchor, snappedPt);
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

    // --- TOOL: SELECT (Standard clicking empty starts Illustrator marquee selection) ---
    if (tool === 'select') {
      const rawPos = getCanvasCoords(e);
      setSelectedNodeInfo(null);

      // Store whether Shift was held at the start
      selectionStartWithShiftRef.current = e.shiftKey;
      initialSelectedIdsRef.current = e.shiftKey ? [...selectedElementIds] : [];

      if (!e.shiftKey) {
        setSelectedElementIds([]);
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
    // If middle-click panning is active, handle it immediately!
    if (isMiddleClickPanning && dragImageStartPos) {
      e.preventDefault();
      const dx = e.clientX - dragStartCanvasPos.x;
      const dy = e.clientY - dragStartCanvasPos.y;

      setPanOffset({
        x: dragImageStartPos.x + dx,
        y: dragImageStartPos.y + dy,
      });
      return;
    }

    const rawPos = getCanvasCoords(e);
    const snappedPos = getSnappedCanvasCoords(e, activePathId || undefined);

    // Update coordinates showing in pen mode visual guide
    if (activePathId) {
      let preview = snappedPos;
      if (e.shiftKey) {
        const currentActivePath = getAllElements().find(el => el.id === activePathId);
        if (currentActivePath && currentActivePath.nodes.length > 0) {
          const lastNode = currentActivePath.nodes[currentActivePath.nodes.length - 1];
          preview = snapAngle45(lastNode.anchor, snappedPos);
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
    if (tool === 'pen' && isDrawingDrag && selectedNodeInfo) {
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

      setLayers(prev =>
        prev.map(layer => ({
          ...layer,
          elements: layer.elements.map(el => {
            if (el.id === elementId) {
              return {
                ...el,
                nodes: el.nodes.map(node => {
                  if (node.id === nodeId) {
                    if (selectedHandle === 'anchor') {
                      // Move Anchor: compute delta movement
                      let targetAnchor = snappedPos;
                      if (e.shiftKey) {
                        targetAnchor = snapAngle45(dragStartCanvasPos, snappedPos);
                      }
                      const prevAnchor = node.anchor;
                      const dx = targetAnchor.x - prevAnchor.x;
                      const dy = targetAnchor.y - prevAnchor.y;

                      // Move handles in unison with anchor
                      const updatedHandleIn = node.handleIn
                        ? { x: node.handleIn.x + dx, y: node.handleIn.y + dy }
                        : undefined;
                      const updatedHandleOut = node.handleOut
                        ? { x: node.handleOut.x + dx, y: node.handleOut.y + dy }
                        : undefined;

                      return {
                        ...node,
                        anchor: targetAnchor,
                        handleIn: updatedHandleIn,
                        handleOut: updatedHandleOut,
                      };
                    } else if (selectedHandle === 'handleOut') {
                      // Adjust Handle OUT
                      let handleOut = rawPos;
                      if (e.shiftKey) {
                        handleOut = snapAngle45(node.anchor, rawPos);
                      }
                      const dx = handleOut.x - node.anchor.x;
                      const dy = handleOut.y - node.anchor.y;

                      let updateIn = node.handleIn;
                      if (!e.altKey && node.type === 'symmetric') {
                        // Symmetric: mirror direction and distance
                        updateIn = { x: node.anchor.x - dx, y: node.anchor.y - dy };
                      } else if (!e.altKey && node.type === 'smooth' && node.handleIn) {
                        // Smooth: mirror direction but keep own original scale
                        const distIn = distance(node.anchor, node.handleIn);
                        const angle = Math.atan2(dy, dx) + Math.PI;
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
                      // Adjust Handle IN
                      let handleIn = rawPos;
                      if (e.shiftKey) {
                        handleIn = snapAngle45(node.anchor, rawPos);
                      }
                      const dx = handleIn.x - node.anchor.x;
                      const dy = handleIn.y - node.anchor.y;

                      let updateOut = node.handleOut;
                      if (!e.altKey && node.type === 'symmetric') {
                        updateOut = { x: node.anchor.x - dx, y: node.anchor.y - dy };
                      } else if (!e.altKey && node.type === 'smooth' && node.handleOut) {
                        const distOut = distance(node.anchor, node.handleOut);
                        const angle = Math.atan2(dy, dx) + Math.PI;
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
            }
            return el;
          }),
        }))
      );
      return;
    }

    // --- CASE 3: Dragging entire selected element to move / scale (Transform editor) ---
    if (tool === 'select' && isDragging && selectedElementIds.length > 0 && !selectionBox) {
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
    if (tool === 'select' && isDragging && selectionBox) {
      const currentRaw = getCanvasCoords(e);
      const updatedBox = { ...selectionBox, current: currentRaw };
      setSelectionBox(updatedBox);

      // Calculate bounds of selection box
      const xMin = Math.min(updatedBox.start.x, updatedBox.current.x);
      const xMax = Math.max(updatedBox.start.x, updatedBox.current.x);
      const yMin = Math.min(updatedBox.start.y, updatedBox.current.y);
      const yMax = Math.max(updatedBox.start.y, updatedBox.current.y);

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

    // Ensure we are in direct-select tool to bend curves
    if (tool !== 'direct-select') {
      setTool('direct-select');
    }

    // Select the element if not already selected
    if (!selectedElementIds.includes(elId)) {
      setSelectedElementIds([elId]);
    }

    // Clear any previous node specific selections to avoid conflicting handle overlays
    setSelectedNodeInfo(null);
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

    if (tool !== 'direct-select') {
      // Toggle back to direct select tool if they clicked individual nodes
      setTool('direct-select');
    }

    setSelectedElementIds([elementId]);
    setSelectedNodeInfo({ elementId, nodeId });
    setSelectedHandle(handleType);
    setIsDragging(true);

    const raw = getCanvasCoords(e as any);
    setDragStartCanvasPos({ x: raw.x, y: raw.y });
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

    if (tool === 'pen') {
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
      setSelectedElementIds([elementId]);
      // Highlight the first node by default for user convenience
      if (el && el.nodes.length > 0) {
        setSelectedNodeInfo({ elementId, nodeId: el.nodes[0].id });
      }
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

      if (document.activeElement?.tagName === 'INPUT') return;

      const isModKey = e.ctrlKey || e.metaKey;

      if (isModKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        handleCopy();
      } else if (isModKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        handlePaste();
      } else if (isModKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        handleRepeatTransform();
      } else if (isModKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleUndo();
      } else if (isModKey && (e.key === 'y' || e.key === 'Y' || (e.shiftKey && (e.key === 'z' || e.key === 'Z')))) {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeInfo && tool === 'direct-select') {
          // Delete selected node
          pushHistory(layers);
          const { elementId, nodeId } = selectedNodeInfo;
          setLayers(prev =>
            prev.map(layer => ({
              ...layer,
              elements: layer.elements
                .map(el => {
                  if (el.id === elementId) {
                    const filteredNodes = el.nodes.filter(n => n.id !== nodeId);
                    return { ...el, nodes: filteredNodes };
                  }
                  return el;
                })
                .filter(el => el.nodes.length > 0), // remove empty elements
            }))
          );
          setSelectedNodeInfo(null);
        } else if (selectedElementIds.length > 0) {
          // Delete selected key elements
          pushHistory(layers);
          setLayers(prev =>
            prev.map(layer => ({
              ...layer,
              elements: layer.elements.filter(el => !selectedElementIds.includes(el.id)),
            }))
          );
          setSelectedElementIds([]);
        }
      } else if (e.key === 'Escape' || e.key === 'Enter') {
        if (activePathId) {
          // Finish drawing current path
          setActivePathId(null);
          setPenPreviewPos(null);
        }
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        activatePenTool();
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setTool('direct-select');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setTool('spiral');
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTool('triangle');
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setTool('rect');
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setTool('ellipse');
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setTool('select');
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
  }, [selectedElementIds, selectedNodeInfo, activePathId, tool, copiedElements, layers, activeLayerId, lastTransform]);

  // --- MOUSE WHEEL ZOOM ON CANVAS ---
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      // Calculate zoom factor based on scroll velocity/direction
      const zoomIntensity = 0.08;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1 + zoomIntensity : 1 - zoomIntensity;

      setZoom(prevZoom => {
        const nextZoom = Math.max(0.15, Math.min(8, prevZoom * factor));
        
        // Pivot the offset so the zoom centers around the cursor position
        setPanOffset(prevPan => ({
          x: mouseX - (mouseX - prevPan.x) * (nextZoom / prevZoom),
          y: mouseY - (mouseY - prevPan.y) * (nextZoom / prevZoom),
        }));

        return nextZoom;
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

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
        const d = getPathData(el.nodes, el.closed);
        const fillAttr = el.fill === 'none' ? 'none' : el.fill;
        const opacityAttr = el.fill === 'none' ? '' : ` fill-opacity="${el.fillOpacity}"`;
        svgContent += `  <path d="${d}" fill="${fillAttr}"${opacityAttr} stroke="${el.stroke}" stroke-width="${el.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />\n`;
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
    const dxfContent = exportToDXF(allVisibleElements);

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
      version: "1.0",
      layers,
      activeLayerId,
      tracingImage,
      grid,
      snapToPoints
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

  // Convert currently selected element to use template parameters instantly for speed
  const selectedElements = getAllElements().filter(e => selectedElementIds.includes(e.id));
  const activeSelectedElement = selectedElements[0] || null;

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

          <button
            onClick={() => setShowHelp(prev => !prev)}
            className="p-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 transition shadow-sm"
            title="Ngā Tohutohu - Help Dialog"
          >
            <HelpCircle size={18} />
          </button>
        </div>
      </header>

      {/* --- Main workspace grid --- */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* --- Quick Floating Welcome Banner / Guide --- */}
        {showHelp && (
          <div className="absolute top-4 left-4 right-4 md:left-20 md:right-auto md:w-96 bg-white/95 border-l-4 border-red-600 border border-slate-200 p-4 rounded-r-xl shadow-2xl z-40 transition-all text-xs text-slate-700">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={14} className="text-red-600 animate-pulse" />
                Vector Tracing & Drawing Guide
              </h4>
              <button
                onClick={() => setShowHelp(false)}
                className="text-slate-500 hover:text-slate-800 font-bold px-1.5 py-0.5 rounded bg-slate-100 text-[10px]"
              >
                ✕ Hide
              </button>
            </div>
            <p className="text-slate-600 mb-2 leading-relaxed">
              Design elegant curves, trace reference shapes, and combine overlapping layouts using our professional vector utilities:
            </p>
            <ul className="space-y-1 text-slate-500 list-disc list-inside">
              <li><strong className="text-slate-800">Pen Tool</strong>: Click to place nodes, <strong className="text-red-600">click & drag</strong> to stretch smooth handles. Click the first node to close the path!</li>
              <li><strong className="text-slate-800">Direct Select</strong>: Double-click nodes to <strong className="text-emerald-600">sharpen corner</strong> joints immediately! Drag anchors or handles to warp curves.</li>
              <li><strong className="text-slate-800">Pathfinder Operations</strong>: Overlap shapes, select both, and click Union or Subtract to carve unique vectors.</li>
              <li><span className="text-slate-800 font-semibold">Tracing Background</span>: Drop any PNG, JPG, or SVG reference onto the canvas to draw over with precision.</li>
            </ul>
          </div>
        )}

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

          <button
            onClick={() => {
              activatePenTool();
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'pen' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Pen Curve Tool (P)"
          >
            <PenTool size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              bezier Pen Tool (P)
            </span>
          </button>

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
            onClick={() => setTool('triangle')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'triangle' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Triangle Tool (T)"
          >
            <Triangle size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Triangle (T)
            </span>
          </button>

          <button
            onClick={() => setTool('spiral')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'spiral' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            }`}
            title="Spiral Stamp Tool (S)"
          >
            <Compass size={18} className="text-red-500 rotate-45" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Spiral Stamp Tool (S)
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

          <div className="flex-1 min-h-[20px]"></div>

          {/* Canvas Controls */}
          <div className="w-8 h-[1px] bg-slate-200 my-2"></div>

          <div className="flex flex-col items-center gap-1">
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
          </div>
        </div>

        {/* --- Floating Submenus / Flyouts (placed as sibling outside the scrollable parent to prevent overflow clipping) --- */}
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

        {/* --- Main Art Canvas Stage --- */}
        <div
          ref={canvasContainerRef}
          className="flex-1 bg-slate-50/60 relative overflow-hidden select-none"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Centered ruler markings (Left / Top edges) */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-white border-b border-slate-200/80 text-[9px] text-slate-400 px-8 flex justify-between select-none z-10 font-mono">
            <span>0px</span>
            <span>200px</span>
            <span>400px</span>
            <span>600px</span>
            <span>800px</span>
          </div>
          <div className="absolute top-4 left-0 bottom-0 w-4 bg-white border-r border-slate-200/80 text-[9px] text-slate-400 py-8 flex flex-col justify-between items-center select-none z-10 font-mono">
            <span>0px</span>
            <span>200px</span>
            <span>400px</span>
            <span>600px</span>
          </div>

          {/* Outer Canvas Overlay Drag-over */}
          {isDragOverCanvas && (
            <div className="absolute inset-0 bg-blue-900/40 border-4 border-dashed border-blue-400 flex flex-col items-center justify-center z-50 text-white">
              <FileImage size={48} className="animate-bounce text-blue-100 mb-2" />
              <p className="font-bold text-lg">Drop your image here to load reference tracing layer</p>
              <p className="text-xs text-blue-100 mt-1">Accepts PNG, JPG, or SVG drawings</p>
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
            className={`absolute inset-0 ${
              isMiddleClickPanning
                ? 'cursor-grabbing'
                : (tool === 'pen' && isCtrlKeyHeld)
                ? 'cursor-default'
                : (tool === 'pen' && isAltKeyHeld)
                ? 'cursor-crosshair'
                : tool === 'select'
                ? 'cursor-default'
                : 'cursor-crosshair'
            }`}
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
                  stroke="#e2e8f0"
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

              {/* Center Axis Reference */}
              <line x1="-1000" y1="300" x2="2000" y2="300" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4 4" className="pointer-events-none" />
              <line x1="400" y1="-1000" x2="400" y2="2000" stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4 4" className="pointer-events-none" />

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
                      strokeWidth="2"
                      strokeDasharray="4"
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

                      return (
                        <g key={el.id} id={el.id}>
                          {/* Inner / Fill Area path */}
                          <path
                            d={d}
                            fill={el.fill}
                            fillOpacity={el.fill === 'none' ? 0 : el.fillOpacity}
                            stroke={isSelected ? '#2563eb' : el.stroke}
                            strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                            className="transition-colors duration-150"
                            style={{ cursor: el.locked ? 'default' : 'pointer' }}
                          />

                          {/* Selected Element boundary highlights */}
                          {isSelected && tool === 'select' && (
                            <path
                              d={d}
                              fill="none"
                              stroke="#2563eb"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                              className="pointer-events-none"
                            />
                          )}

                          {/* Render interactive path segments in direct-select mode */}
                          {tool === 'direct-select' && isSelected && !el.locked && (
                            <g>
                              {el.nodes.map((node, idx) => {
                                if (idx === el.nodes.length - 1 && !el.closed) return null;
                                const nextIdx = idx === el.nodes.length - 1 ? 0 : idx + 1;
                                const nextNode = el.nodes[nextIdx];

                                const segmentD = `M ${node.anchor.x} ${node.anchor.y}` + getSegmentCommand(node, nextNode);

                                return (
                                  <path
                                    key={`segment-${idx}`}
                                    d={segmentD}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={10}
                                    className="hover:stroke-indigo-400/50 cursor-grab active:cursor-grabbing transition-colors duration-75"
                                    onMouseDown={(e) => handleSegmentMouseDown(e, el.id, idx, nextIdx, node, nextNode)}
                                  />
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
                      <path
                        d={previewCmd}
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="2"
                        strokeDasharray="3 3"
                        className="pointer-events-none"
                      />
                    );
                  }
                  return null;
                })()
              )}

              {/* 5. Direct Select / Pen Mode: Node handles / anchor point markers */}
              {(tool === 'direct-select' || tool === 'pen') && (
                layers.map(layer => {
                  if (!layer.visible) return null;
                  return layer.elements.map(el => {
                    if (!el.visible || !selectedElementIds.includes(el.id)) return null;

                    return el.nodes.map((node, nodeIdx) => {
                      const isNodeSelected = selectedNodeInfo?.nodeId === node.id;

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
                                strokeWidth="1.5"
                              />
                              <circle
                                cx={node.handleIn.x}
                                cy={node.handleIn.y}
                                r="4"
                                fill="#fff"
                                stroke="#dc2626"
                                strokeWidth="2"
                                style={{ cursor: 'pointer' }}
                                onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'handleIn')}
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
                                 strokeWidth="1.5"
                              />
                              <circle
                                 cx={node.handleOut.x}
                                 cy={node.handleOut.y}
                                 r="4"
                                 fill="#fff"
                                 stroke="#2563eb"
                                 strokeWidth="2"
                                 style={{ cursor: 'pointer' }}
                                 onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'handleOut')}
                              />
                            </g>
                          )}

                          {/* Core Anchor Node Body (Squares for vector accuracy style) */}
                          <rect
                            x={node.anchor.x - 5}
                            y={node.anchor.y - 5}
                            width="10"
                            height="10"
                            rx="1.5"
                            fill={isNodeSelected ? '#dc2626' : '#fff'}
                            stroke={isNodeSelected ? '#dc2626' : '#2563eb'}
                            strokeWidth="2.5"
                            style={{ cursor: 'pointer' }}
                            onMouseDown={(e) => handleNodeMouseDown(e, el.id, node.id, 'anchor')}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleSharpenNode(el.id, node.id);
                            }}
                            title={`Anchor ${nodeIdx + 1} (${node.type}) - Double-click to sharpen`}
                          />
                        </g>
                      );
                    });
                  });
                })
              )}

              {/* Selection Marquee Box */}
              {selectionBox && (
                <rect
                  x={Math.min(selectionBox.start.x, selectionBox.current.x)}
                  y={Math.min(selectionBox.start.y, selectionBox.current.y)}
                  width={Math.abs(selectionBox.start.x - selectionBox.current.x)}
                  height={Math.abs(selectionBox.start.y - selectionBox.current.y)}
                  fill="rgba(37, 99, 235, 0.08)"
                  stroke="#2563eb"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray="4 4"
                  className="pointer-events-none"
                />
              )}
            </g>
          </svg>

          {/* Quick Zoom / Pan HUD controller overlay */}
          <div className="absolute bottom-4 left-4 bg-white/95 border border-slate-200/80 rounded-lg p-2 flex items-center gap-3 z-30 shadow-lg text-xs">
            <div className="font-mono text-slate-500">Zoom: {Math.round(zoom * 100)}%</div>
            <div className="flex gap-1">
              <button
                onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded transition font-semibold"
              >
                -
              </button>
              <button
                onClick={() => setZoom(1)}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 rounded transition font-semibold"
              >
                Reset
              </button>
              <button
                onClick={() => setZoom(z => Math.min(4, z + 0.15))}
                className="px-2 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded transition font-semibold"
              >
                +
              </button>
            </div>
            <div className="w-[1px] h-4 bg-slate-200"></div>
            <button
              onClick={() => {
                setPanOffset({ x: 100, y: 50 });
                setZoom(1);
              }}
              className="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 hover:text-slate-900 rounded flex items-center gap-1 text-[11px] transition font-semibold"
              title="Reset view camera position to center"
            >
              <RotateCcw size={12} /> Re-center
            </button>
            <div className="text-[10px] text-slate-400 hidden md:inline ml-2">Drag workspace: Hold left-click on blank background</div>
          </div>
        </div>
 
        {/* --- Right Inspector Panel (Properties, Pathfinder & Layers) --- */}
        <aside className="w-80 bg-white border-l border-slate-200/80 flex flex-col z-30 select-none overflow-y-auto max-h-[100%]">
          
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

              {/* Stroke controls */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-semibold">Stroke Color</label>
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={strokeColor.startsWith('#') ? strokeColor : '#111827'}
                      onMouseDown={() => pushHistory(layers)}
                      onChange={(e) => {
                        setStrokeColor(e.target.value);
                        updateSelectedElementsProperty('stroke', e.target.value, false);
                      }}
                      className="w-8 h-8 rounded border border-slate-200 bg-transparent cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-500 self-center font-mono">{strokeColor}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1 font-semibold">Stroke Width</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={strokeWidth}
                    onFocus={() => pushHistory(layers)}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      setStrokeWidth(val);
                      updateSelectedElementsProperty('strokeWidth', val, false);
                    }}
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-800 font-mono focus:border-blue-500 focus:outline-none"
                  />
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

              {/* Anchor Type Editor (Corner, Symmetric, Smooth) */}
              {tool === 'direct-select' && selectedNodeInfo && getSelectedNode() && (
                <div className="bg-slate-50/60 p-3 rounded-lg border border-slate-200/80 space-y-2">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">Selected Node Anchor Type</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['corner', 'smooth', 'symmetric'] as NodeType[]).map((t) => {
                      const currNode = getSelectedNode();
                      const isActive = currNode?.type === t;
                      return (
                        <button
                          key={t}
                          onClick={() => updateSelectedNodeProperty('type', t, true)}
                          className={`py-1 rounded text-[10px] font-semibold capitalize transition ${
                            isActive ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-tight">
                    * Smooth / Symmetric automatically balance control points symmetrically over the anchor node.
                  </p>
                </div>
              )}

            </div>
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
          {tool === 'pen' ? (
            <span className="hidden md:inline text-[10px] text-slate-600">
              Shift: 45° snap | Ctrl+Click: deselect/direct-select | Alt: convert anchor / break handles | 2x-click: smooth/corner
            </span>
          ) : tool === 'rect' || tool === 'ellipse' || tool === 'triangle' || tool === 'spiral' ? (
            <span className="hidden md:inline text-[10px] text-slate-600">
              Click & Drag to size | Shift: 1:1 ratio | Alt: center anchor
            </span>
          ) : (
            <span className="hidden md:inline text-[10px] text-slate-400">
              Middle-click/Wheel: pan canvas | Mouse wheel: zoom | Ctrl+Z / Ctrl+Y: undo/redo
            </span>
          )}
          <span className="text-[10px] text-slate-400">
            {getActiveLayer().elements.reduce((acc, el) => acc + el.nodes.length, 0)} nodes
          </span>
        </div>
      </footer>
    </div>
  );
}
