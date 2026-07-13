import React, { useState, useRef, useEffect } from 'react';
import {
  Pointer,
  PenTool,
  Square,
  Circle,
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
  Undo
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
  NodeType
} from './types';
import {
  getPathData,
  performPathfinder,
  snapPoint,
  distance
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
      elements: [getSpiralTemplate()], // Preload a beautiful spiral swirl so the canvas is inviting on turn 1
      visible: true,
      locked: false,
    }
  ]);
  const [activeLayerId, setActiveLayerId] = useState<string>('layer-1');

  // --- Drawing Tool State ---
  const [tool, setTool] = useState<ToolType>('select');

  // --- Selection States ---
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>(['starter-spiral']);
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

  // --- Current Properties For New Drawing Elements ---
  const [fillColor, setFillColor] = useState<string>('none');
  const [fillOpacity, setFillOpacity] = useState<number>(1);
  const [strokeColor, setStrokeColor] = useState<string>('#ff007f');
  const [strokeWidth, setStrokeWidth] = useState<number>(3);

  // --- Editor Drag States ---
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStartCanvasPos, setDragStartCanvasPos] = useState<Point>({ x: 0, y: 0 });
  const [dragStartElementsBackup, setDragStartElementsBackup] = useState<PathElement[]>([]);
  const [dragImageStartPos, setDragImageStartPos] = useState<{ x: number; y: number } | null>(null);

  // --- Drag-over Overlay for file tracing loading ---
  const [isDragOverCanvas, setIsDragOverCanvas] = useState<boolean>(false);
  
  // --- Info Modal / Help Drawer State ---
  const [showHelp, setShowHelp] = useState<boolean>(true);

  // Reference for file picker triggers
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const updateSelectedElementsProperty = (key: keyof PathElement, value: any) => {
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
  const updateSelectedNodeProperty = (key: keyof VectorNode, value: any) => {
    if (!selectedNodeInfo) return;
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

  // --- MIRROR & SYMMETRY ACTIONS ---
  const handleMirrorAction = (type: 'flip-horizontal' | 'flip-vertical' | 'mirror-horizontal' | 'mirror-vertical') => {
    if (selectedElementIds.length === 0) return;

    // Get the selected elements
    const selectedEls = getAllElements().filter(el => selectedElementIds.includes(el.id));
    if (selectedEls.length === 0) return;

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
    // Only pay attention to primary clicks
    if (e.button !== 0) return;

    const snappedPt = getSnappedCanvasCoords(e, activePathId || undefined);

    // --- TOOL: PEN ---
    if (tool === 'pen') {
      if (!activePathId) {
        // Star a new path!
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

        // Check if cursor clicked the first node to close the path
        if (currentActivePath.nodes.length > 2) {
          const firstNode = currentActivePath.nodes[0];
          const distToFirst = distance(snappedPt, firstNode.anchor);
          if (distToFirst < 12 / zoom) {
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
          anchor: snappedPt,
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

    // --- TOOL: RECTANGLE / ELLIPSE / SPIRAL FAST-GENS ---
    if (tool === 'rect' || tool === 'ellipse' || tool === 'spiral') {
      const elId = `shape-${Math.random().toString(36).substr(2, 9)}`;
      let newElement: PathElement;

      if (tool === 'rect') {
        const side = 60;
        newElement = {
          id: elId,
          name: 'Rectangle',
          type: 'rect',
          nodes: [
            { id: 'rn1', anchor: { x: snappedPt.x - side, y: snappedPt.y - side }, type: 'corner' },
            { id: 'rn2', anchor: { x: snappedPt.x + side, y: snappedPt.y - side }, type: 'corner' },
            { id: 'rn3', anchor: { x: snappedPt.x + side, y: snappedPt.y + side }, type: 'corner' },
            { id: 'rn4', anchor: { x: snappedPt.x - side, y: snappedPt.y + side }, type: 'corner' },
          ],
          closed: true,
          fill: fillColor,
          fillOpacity: fillOpacity,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          visible: true,
          locked: false,
        };
      } else if (tool === 'ellipse') {
        // Perfect 4-node bezier circle
        const r = 50;
        const kappa = r * 0.5522847498; // bezier circle magic multiplier
        const center = snappedPt;
        newElement = {
          id: elId,
          name: 'Ellipse',
          type: 'ellipse',
          nodes: [
            {
              id: 'en1',
              anchor: { x: center.x, y: center.y - r },
              handleIn: { x: center.x - kappa, y: center.y - r },
              handleOut: { x: center.x + kappa, y: center.y - r },
              type: 'symmetric',
            },
            {
              id: 'en2',
              anchor: { x: center.x + r, y: center.y },
              handleIn: { x: center.x + r, y: center.y - kappa },
              handleOut: { x: center.x + r, y: center.y + kappa },
              type: 'symmetric',
            },
            {
              id: 'en3',
              anchor: { x: center.x, y: center.y + r },
              handleIn: { x: center.x + kappa, y: center.y + r },
              handleOut: { x: center.x - kappa, y: center.y + r },
              type: 'symmetric',
            },
            {
              id: 'en4',
              anchor: { x: center.x - r, y: center.y },
              handleIn: { x: center.x - r, y: center.y + kappa },
              handleOut: { x: center.x - r, y: center.y - kappa },
              type: 'symmetric',
            },
          ],
          closed: true,
          fill: fillColor,
          fillOpacity: fillOpacity,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          visible: true,
          locked: false,
        };
      } else {
        // Fast Spiral stamp node offset
        const baseSpiral = getSpiralTemplate();
        const shiftedNodes = baseSpiral.nodes.map(n => ({
          ...n,
          anchor: { x: n.anchor.x + (snappedPt.x - 200), y: n.anchor.y + (snappedPt.y - 250) },
          handleIn: n.handleIn ? { x: n.handleIn.x + (snappedPt.x - 200), y: n.handleIn.y + (snappedPt.y - 250) } : undefined,
          handleOut: n.handleOut ? { x: n.handleOut.x + (snappedPt.x - 200), y: n.handleOut.y + (snappedPt.y - 250) } : undefined,
        }));

        newElement = {
          ...baseSpiral,
          id: elId,
          nodes: shiftedNodes,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        };
      }

      setLayers(prev =>
        prev.map(layer =>
          layer.id === activeLayerId
            ? { ...layer, elements: [...layer.elements, newElement] }
            : layer
        )
      );

      setSelectedElementIds([elId]);
      setTool('select');
      return;
    }

    // --- TOOL: SELECT (Standard clicking empty starts canvas background PANNING) ---
    if (tool === 'select') {
      // If clicked empty workspace, clear element selection, start window panning
      setSelectedElementIds([]);
      setSelectedNodeInfo(null);
      setIsDragging(true);
      setDragStartCanvasPos({ x: e.clientX, y: e.clientY });
      setDragStartElementsBackup([]);
      setDragImageStartPos({ x: panOffset.x, y: panOffset.y });
    }
  };

  // Drag over Canvas move trackers
  const handleCanvasMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rawPos = getCanvasCoords(e);
    const snappedPos = getSnappedCanvasCoords(e, activePathId || undefined);

    // Update coordinates showing in pen mode visual guide
    if (activePathId) {
      setPenPreviewPos(snappedPos);
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
                    const dx = rawPos.x - node.anchor.x;
                    const dy = rawPos.y - node.anchor.y;

                    // handleOut follows mouse
                    const handleOut = { x: rawPos.x, y: rawPos.y };
                    // handleIn goes symmetric opposite way
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

    // --- CASE 2: Dragging selected anchor point or bezier handle (Node Editor) ---
    if (tool === 'direct-select' && isDragging && selectedNodeInfo && selectedHandle) {
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
                      const prevAnchor = node.anchor;
                      const dx = snappedPos.x - prevAnchor.x;
                      const dy = snappedPos.y - prevAnchor.y;

                      // Move handles in unison with anchor
                      const updatedHandleIn = node.handleIn
                        ? { x: node.handleIn.x + dx, y: node.handleIn.y + dy }
                        : undefined;
                      const updatedHandleOut = node.handleOut
                        ? { x: node.handleOut.x + dx, y: node.handleOut.y + dy }
                        : undefined;

                      return {
                        ...node,
                        anchor: snappedPos,
                        handleIn: updatedHandleIn,
                        handleOut: updatedHandleOut,
                      };
                    } else if (selectedHandle === 'handleOut') {
                      // Adjust Handle OUT
                      const handleOut = rawPos; // handles ignore node snapping for micro curvature control
                      const dx = handleOut.x - node.anchor.x;
                      const dy = handleOut.y - node.anchor.y;

                      let updateIn = node.handleIn;
                      if (node.type === 'symmetric') {
                        // Symmetric: mirror direction and distance
                        updateIn = { x: node.anchor.x - dx, y: node.anchor.y - dy };
                      } else if (node.type === 'smooth' && node.handleIn) {
                        // Smooth: mirror direction but keep own original scale
                        const distIn = distance(node.anchor, node.handleIn);
                        const angle = Math.atan2(dy, dx) + Math.PI;
                        updateIn = {
                          x: node.anchor.x + Math.cos(angle) * distIn,
                          y: node.anchor.y + Math.sin(angle) * distIn,
                        };
                      }

                      return { ...node, handleOut, handleIn: updateIn };
                    } else if (selectedHandle === 'handleIn') {
                      // Adjust Handle IN
                      const handleIn = rawPos;
                      const dx = handleIn.x - node.anchor.x;
                      const dy = handleIn.y - node.anchor.y;

                      let updateOut = node.handleOut;
                      if (node.type === 'symmetric') {
                        updateOut = { x: node.anchor.x - dx, y: node.anchor.y - dy };
                      } else if (node.type === 'smooth' && node.handleOut) {
                        const distOut = distance(node.anchor, node.handleOut);
                        const angle = Math.atan2(dy, dx) + Math.PI;
                        updateOut = {
                          x: node.anchor.x + Math.cos(angle) * distOut,
                          y: node.anchor.y + Math.sin(angle) * distOut,
                        };
                      }

                      return { ...node, handleIn, handleOut: updateOut };
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
    if (tool === 'select' && isDragging && selectedElementIds.length > 0) {
      const currentMouseScreen = { x: e.clientX, y: e.clientY };
      const rawDelta = {
        x: (currentMouseScreen.x - dragStartCanvasPos.x) / zoom,
        y: (currentMouseScreen.y - dragStartCanvasPos.y) / zoom,
      };

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
                  anchor: { x: node.anchor.x + rawDelta.x, y: node.anchor.y + rawDelta.y },
                  handleIn: node.handleIn
                    ? { x: node.handleIn.x + rawDelta.x, y: node.handleIn.y + rawDelta.y }
                    : undefined,
                  handleOut: node.handleOut
                    ? { x: node.handleOut.x + rawDelta.x, y: node.handleOut.y + rawDelta.y }
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

    // --- CASE 5: Canvas Background Panning (when no element is selected or space bar used) ---
    if (tool === 'select' && isDragging && selectedElementIds.length === 0 && dragImageStartPos) {
      const dx = e.clientX - dragStartCanvasPos.x;
      const dy = e.clientY - dragStartCanvasPos.y;

      setPanOffset({
        x: dragImageStartPos.x + dx,
        y: dragImageStartPos.y + dy,
      });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    setIsDrawingDrag(false);
    setSelectedHandle(null);
    setDragImageStartPos(null);
  };

  // --- DOUBLE CLICK TO SHARPEN / SMOOTH NODE CONVERSION ---
  const handleSharpenNode = (elementId: string, nodeId: string) => {
    setLayers(prev =>
      prev.map(layer => ({
        ...layer,
        elements: layer.elements.map(el => {
          if (el.id === elementId) {
            return {
              ...el,
              nodes: el.nodes.map(n => {
                if (n.id === nodeId) {
                  return {
                    ...n,
                    handleIn: undefined,
                    handleOut: undefined,
                    type: 'corner'
                  };
                }
                return n;
              })
            };
          }
          return el;
        })
      }))
    );
  };

  // --- NODE ELEMENT CLICKS (Anchor selection & Handle Grab starting) ---
  const handleNodeMouseDown = (
    e: React.MouseEvent,
    elementId: string,
    nodeId: string,
    handleType: 'anchor' | 'handleIn' | 'handleOut'
  ) => {
    e.stopPropagation(); // prevent background canvas drags

    if (tool === 'pen' && activePathId === elementId) {
      // Click start node to close pen path
      const activeEl = getAllElements().find(el => el.id === activePathId);
      if (activeEl && activeEl.nodes[0].id === nodeId && activeEl.nodes.length > 2) {
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
    e.stopPropagation();

    const el = getAllElements().find(v => v.id === elementId);
    if (el?.locked) return; // locked elements cannot be interacted with

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

      // Save initial positions coordinates to cleanly support drag relative delta
      const currentEls = getAllElements();
      setDragStartElementsBackup(JSON.parse(JSON.stringify(currentEls)));

      if (e.shiftKey) {
        // Multi select
        setSelectedElementIds(prev =>
          prev.includes(elementId) ? prev.filter(id => id !== elementId) : [...prev, elementId]
        );
      } else {
        // Single select
        setSelectedElementIds([elementId]);
      }
      setSelectedNodeInfo(null);
    }
  };

  // --- Layer operations ---
  const handleAddLayer = () => {
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

    const updated = [...layers];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIdx, 0, moved);
    setLayers(updated);
  };

  // Delete key stroke to instantly delete selected nodes or elements
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeInfo && tool === 'direct-select') {
          // Delete selected node
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds, selectedNodeInfo, activePathId, tool]);

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

  // Convert currently selected element to use template parameters instantly for speed
  const selectedElements = getAllElements().filter(e => selectedElementIds.includes(e.id));
  const activeSelectedElement = selectedElements[0] || null;

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-900 font-sans text-neutral-100 overflow-hidden">
      {/* --- Top Navbar --- */}
      <header className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-tr from-rose-600 to-amber-500 rounded-lg text-white font-bold leading-none">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              Vector Craft Studio
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-indigo-400">
                Precision Design
              </span>
            </h1>
            <p className="text-xs text-slate-400">Illustrator-style Pen Tool, Bezier Node Editor & Tracing studio.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Preset Templates Fast Dropdown */}
          <div className="relative group">
            <button className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-emerald-400 font-medium text-xs rounded-lg border border-slate-700 transition">
              <Plus size={14} />
              Insert Vector Presets
            </button>
            <div className="absolute right-0 top-full mt-1.5 w-60 bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-2 hidden group-hover:block hover:block z-50">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-slate-700 uppercase tracking-wider">
                Vector Presets & Curves
              </div>
              <button
                onClick={() => handleLoadTemplate('spiral')}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-700 text-white flex items-center justify-between"
              >
                <span>🌀 Spiral Flourish Shape</span>
                <span className="text-[10px] text-rose-400 bg-rose-950/40 px-1.5 py-0.5 rounded border border-rose-900">Complex</span>
              </button>
              <button
                onClick={() => handleLoadTemplate('teardrop')}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-700 text-white flex items-center justify-between"
              >
                <span>💧 Fluid Teardrop</span>
                <span className="text-[10px] text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900">Smooth</span>
              </button>
              <button
                onClick={() => handleLoadTemplate('leaf')}
                className="w-full text-left px-4 py-2.5 text-xs hover:bg-slate-700 text-white flex items-center justify-between"
              >
                <span>🌿 Mirrored Leaf Duo</span>
                <span className="text-[10px] text-teal-400 bg-teal-950/40 px-1.5 py-0.5 rounded border border-teal-900">Symmetric</span>
              </button>
            </div>
          </div>

          <button
            onClick={() => {
              if (fileInputRef.current) fileInputRef.current.click();
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium text-xs transition"
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
            onClick={handleExportSVG}
            className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-white font-medium text-xs transition shadow-md"
            title="Download vector as pristine .svg"
          >
            <Download size={14} />
            Export SVG
          </button>

          <button
            onClick={handleExportDXF}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white font-medium text-xs transition shadow-md"
            title="Download vector as CAD-compatible .dxf"
          >
            <Download size={14} />
            Export DXF
          </button>

          <button
            onClick={() => setShowHelp(prev => !prev)}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition"
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
          <div className="absolute top-4 left-4 right-4 md:left-20 md:right-auto md:w-96 bg-slate-950/95 border-l-4 border-rose-500 border border-slate-800 p-4 rounded-r-xl shadow-2xl z-40 transition-all text-xs">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-white uppercase tracking-wider flex items-center gap-1">
                <Sparkles size={14} className="text-rose-500 animate-pulse" />
                Vector Tracing & Drawing Guide
              </h4>
              <button
                onClick={() => setShowHelp(false)}
                className="text-slate-400 hover:text-white font-bold px-1.5 py-0.5 rounded bg-slate-800 text-[10px]"
              >
                ✕ Hide
              </button>
            </div>
            <p className="text-slate-300 mb-2 leading-relaxed">
              Design elegant curves, trace reference shapes, and combine overlapping layouts using our professional vector utilities:
            </p>
            <ul className="space-y-1 text-slate-400 list-disc list-inside">
              <li><strong className="text-slate-200">Pen Tool</strong>: Click to place nodes, <strong className="text-rose-400">click & drag</strong> to stretch smooth handles. Click the first node to close the path!</li>
              <li><strong className="text-slate-200">Direct Select</strong>: Double-click nodes to <strong className="text-emerald-400">sharpen corner</strong> joints immediately! Drag anchors or handles to warp curves.</li>
              <li><strong className="text-slate-200">Pathfinder Operations</strong>: Overlap shapes, select both, and click Union or Subtract to carve unique vectors.</li>
              <li><span className="text-slate-200 font-semibold">Tracing Background</span>: Drop any PNG, JPG, or SVG reference onto the canvas to draw over with precision.</li>
            </ul>
          </div>
        )}

        {/* --- Left Tool Rail (Drawing Tools) --- */}
        <div className="w-16 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-4 gap-2 z-30 select-none">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Tools</div>

          <button
            onClick={() => {
              setTool('select');
              setSelectedNodeInfo(null);
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Transform/Move Tool (Pointer)"
          >
            <Pointer size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Mānuka Select (pointer)
            </span>
          </button>

          <button
            onClick={() => {
              setTool('direct-select');
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'direct-select' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Direct Node Select Tool (S)"
          >
            <MousePointerSquareDashed size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Node Editor (handles)
            </span>
          </button>

          <button
            onClick={() => {
              setTool('pen');
              // Clear previous pen if toggling away
              setActivePathId(null);
              setPenPreviewPos(null);
            }}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Pen Curve Tool (P)"
          >
            <PenTool size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              bezier Pen Tool
            </span>
          </button>

          <div className="w-8 h-[1px] bg-slate-800 my-2"></div>

          <button
            onClick={() => setTool('rect')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'rect' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Rectangle Tool"
          >
            <Square size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Rectangle (R)
            </span>
          </button>

          <button
            onClick={() => setTool('ellipse')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'ellipse' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Ellipse Tool"
          >
            <Circle size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Ellipse (E)
            </span>
          </button>

          <button
            onClick={() => setTool('spiral')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'spiral' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Spiral Stamp Tool"
          >
            <Compass size={18} className="text-rose-400 rotate-45" />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Spiral Stamp Tool (S)
            </span>
          </button>

          <button
            onClick={() => setTool('eraser')}
            className={`p-3 rounded-lg transition relative group ${
              tool === 'eraser' ? 'bg-rose-600 text-white font-bold' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
            title="Eraser / Delete Asset"
          >
            <Trash2 size={18} />
            <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-[10px] text-white rounded opacity-0 pointer-events-none group-hover:opacity-100 transition whitespace-nowrap z-50 shadow-md">
              Eraser / Delete (E)
            </span>
          </button>

          <div className="flex-1"></div>

          {/* Canvas Controls */}
          <div className="w-8 h-[1px] bg-slate-800 my-2"></div>

          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => setGrid(g => ({ ...g, visible: !g.visible }))}
              className={`p-2 rounded transition ${grid.visible ? 'text-indigo-400' : 'text-slate-600'}`}
              title="Toggle Grid Lines"
            >
              <Grid size={16} />
            </button>
            <button
              onClick={() => setGrid(g => ({ ...g, snap: !g.snap }))}
              className={`p-2 rounded transition ${grid.snap ? 'text-indigo-400 bg-slate-900 border border-slate-700' : 'text-slate-600'}`}
              title="Toggle Grid Snapping"
            >
              <Maximize2 size={14} className={grid.snap ? 'animate-pulse' : ''} />
            </button>
            <button
              onClick={() => setSnapToPoints(s => !s)}
              className={`p-2 rounded transition ${snapToPoints ? 'text-rose-400 bg-slate-900 border border-slate-700' : 'text-slate-600'}`}
              title="Snap to Node Anchors"
            >
              <Compass size={14} />
            </button>
          </div>
        </div>

        {/* --- Main Art Canvas Stage --- */}
        <div
          ref={canvasContainerRef}
          className="flex-1 bg-slate-900 relative overflow-hidden select-none"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Centered ruler markings (Left / Top edges) */}
          <div className="absolute top-0 left-0 right-0 h-4 bg-slate-950/80 border-b border-slate-800 text-[9px] text-slate-500 px-8 flex justify-between select-none z-10 font-mono">
            <span>0px</span>
            <span>200px</span>
            <span>400px</span>
            <span>600px</span>
            <span>800px</span>
          </div>
          <div className="absolute top-4 left-0 bottom-0 w-4 bg-slate-950/80 border-r border-slate-800 text-[9px] text-slate-500 py-8 flex flex-col justify-between items-center select-none z-10 font-mono">
            <span>0px</span>
            <span>200px</span>
            <span>400px</span>
            <span>600px</span>
          </div>

          {/* Outer Canvas Overlay Drag-over */}
          {isDragOverCanvas && (
            <div className="absolute inset-0 bg-indigo-900/60 border-4 border-dashed border-indigo-400 flex flex-col items-center justify-center z-50 text-white">
              <FileImage size={48} className="animate-bounce text-indigo-200 mb-2" />
              <p className="font-bold text-lg">Drop your image here to load reference tracing layer</p>
              <p className="text-xs text-indigo-200 mt-1">Accepts PNG, JPG, or SVG drawings</p>
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
            className="absolute inset-0 cursor-crosshair"
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
                  stroke="#1e293b"
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
              <line x1="-1000" y1="300" x2="2000" y2="300" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" className="pointer-events-none" />
              <line x1="400" y1="-1000" x2="400" y2="2000" stroke="#334155" strokeWidth="0.5" strokeDasharray="4 4" className="pointer-events-none" />

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
                      stroke="#4f46e5"
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
                            stroke={isSelected ? '#4f46e5' : el.stroke}
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
                              stroke="#6366f1"
                              strokeWidth="1"
                              strokeDasharray="4 4"
                              className="pointer-events-none"
                            />
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              })}

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

              {/* 5. Direct Select Mode: Node handles / anchor point markers */}
              {tool === 'direct-select' && (
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
                                stroke="#f43f5e"
                                strokeWidth="1.5"
                              />
                              <circle
                                cx={node.handleIn.x}
                                cy={node.handleIn.y}
                                r="4"
                                fill="#fff"
                                stroke="#f43f5e"
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
                                stroke="#3b82f6"
                                strokeWidth="1.5"
                              />
                              <circle
                                cx={node.handleOut.x}
                                cy={node.handleOut.y}
                                r="4"
                                fill="#fff"
                                stroke="#3b82f6"
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
                            fill={isNodeSelected ? '#e11d48' : '#fff'}
                            stroke={isNodeSelected ? '#f43f5e' : '#4f46e5'}
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
            </g>
          </svg>

          {/* Quick Zoom / Pan HUD controller overlay */}
          <div className="absolute bottom-4 left-4 bg-slate-950/95 border border-slate-800 rounded-lg p-2 flex items-center gap-3 z-30 shadow-lg text-xs">
            <div className="font-mono text-slate-400">Zoom: {Math.round(zoom * 100)}%</div>
            <div className="flex gap-1">
              <button
                onClick={() => setZoom(z => Math.max(0.2, z - 0.15))}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-white"
              >
                -
              </button>
              <button
                onClick={() => setZoom(1)}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300"
              >
                Reset
              </button>
              <button
                onClick={() => setZoom(z => Math.min(4, z + 0.15))}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-white"
              >
                +
              </button>
            </div>
            <div className="w-[1px] h-4 bg-slate-800"></div>
            <button
              onClick={() => {
                setPanOffset({ x: 100, y: 50 });
                setZoom(1);
              }}
              className="px-2 py-1 bg-slate-850 hover:bg-slate-750 text-slate-400 hover:text-white rounded flex items-center gap-1 text-[11px]"
              title="Reset view camera position to center"
            >
              <RotateCcw size={12} /> Re-center
            </button>
            <div className="text-[10px] text-slate-500 hidden md:inline ml-2">Drag workspace: Hold left-click on blank background</div>
          </div>
        </div>

        {/* --- Right Inspector Panel (Properties, Pathfinder & Layers) --- */}
        <aside className="w-80 bg-slate-950 border-l border-slate-800 flex flex-col z-30 select-none overflow-y-auto max-h-[100%]">
          
          {/* Section: Properties fill and stroke */}
          <div className="p-4 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-3">Properties</h3>
            
            <div className="space-y-4">
              
              {/* Designer Fill Swatch Selectors */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5 font-medium">Fill Color</label>
                <div className="grid grid-cols-4 gap-1.5 font-sans">
                  {ART_PALETTE.map((color) => (
                    <button
                      key={color.name}
                      onClick={() => {
                        setFillColor(color.value);
                        updateSelectedElementsProperty('fill', color.value);
                      }}
                      className={`h-7 rounded border relative transition flex items-center justify-center ${
                        fillColor === color.value ? 'border-indigo-500 ring-2 ring-indigo-900/60' : 'border-slate-800 hover:border-slate-600'
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
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>Opacity</span>
                    <span>{Math.round(fillOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={fillOpacity}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setFillOpacity(val);
                      updateSelectedElementsProperty('fillOpacity', val);
                    }}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              {/* Stroke controls */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Stroke Color</label>
                  <div className="flex gap-1.5">
                    <input
                      type="color"
                      value={strokeColor.startsWith('#') ? strokeColor : '#111827'}
                      onChange={(e) => {
                        setStrokeColor(e.target.value);
                        updateSelectedElementsProperty('stroke', e.target.value);
                      }}
                      className="w-8 h-8 rounded border border-slate-700 bg-transparent cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 self-center font-mono">{strokeColor}</div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1 font-medium">Stroke Width</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={strokeWidth}
                    onChange={(e) => {
                      const val = Math.max(1, parseInt(e.target.value) || 1);
                      setStrokeWidth(val);
                      updateSelectedElementsProperty('strokeWidth', val);
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Active element closure toggle */}
              {activeSelectedElement && (
                <div className="flex items-center justify-between bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 text-[11px]">
                  <span className="text-slate-300 font-medium">Close Vector Path Loop</span>
                  <input
                    type="checkbox"
                    checked={activeSelectedElement.closed}
                    onChange={(e) => {
                      updateSelectedElementsProperty('closed', e.target.checked);
                    }}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-700"
                  />
                </div>
              )}

              {/* Anchor Type Editor (Corner, Symmetric, Smooth) */}
              {tool === 'direct-select' && selectedNodeInfo && getSelectedNode() && (
                <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-850 space-y-2">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">Selected Node Anchor Type</div>
                  <div className="grid grid-cols-3 gap-1">
                    {(['corner', 'smooth', 'symmetric'] as NodeType[]).map((t) => {
                      const currNode = getSelectedNode();
                      const isActive = currNode?.type === t;
                      return (
                        <button
                          key={t}
                          onClick={() => updateSelectedNodeProperty('type', t)}
                          className={`py-1 rounded text-[10px] font-medium capitalize transition ${
                            isActive ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-750'
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 leading-tight">
                    * Smooth / Symmetric automatically balance control points symmetrically over the anchor node.
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* Section: Pathfinder Tools */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-2.5">Pathfinder (Boolean Clipping)</h3>
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Select multiple overlapping elements on a layer to merge or carve complex vectors cleanly:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePathfinder('union')}
                className="py-2 px-3 bg-slate-850 hover:bg-indigo-900/40 hover:border-indigo-500 rounded border border-slate-800 text-xs text-slate-200 transition text-center font-semibold"
                title="Join selected overlap paths"
              >
                Union (Combine)
              </button>
              <button
                onClick={() => handlePathfinder('subtract')}
                className="py-2 px-3 bg-slate-850 hover:bg-red-900/40 hover:border-red-500 rounded border border-slate-800 text-xs text-slate-200 transition text-center font-semibold"
                title="Subtract back shape from front"
              >
                Subtract (Carve)
              </button>
              <button
                onClick={() => handlePathfinder('intersect')}
                className="py-2 px-3 bg-slate-850 hover:bg-slate-850 rounded border border-slate-800 text-xs text-slate-200 transition text-center font-semibold"
                title="Keep intersecting space"
              >
                Intersect
              </button>
              <button
                onClick={() => handlePathfinder('exclude')}
                className="py-2 px-3 bg-slate-850 hover:bg-slate-850 rounded border border-slate-800 text-xs text-slate-200 transition text-center font-semibold"
                title="Cut overlaps"
              >
                Exclude (XOR)
              </button>
            </div>
          </div>

          {/* Section: Mirror & Symmetry Tools */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/40">
            <h3 className="text-xs font-bold uppercase text-indigo-400 tracking-wider mb-2.5 flex items-center gap-1.5">
              <Compass size={14} className="text-indigo-400" />
              Mirror & Symmetry
            </h3>
            <p className="text-[10px] text-slate-400 mb-3 leading-relaxed">
              Flip your selected vectors, or clone them symmetrically to create stunning repeating patterns:
            </p>
            
            {selectedElementIds.length > 0 ? (
              <div className="space-y-3">
                {/* Sub-label: Flip Operations */}
                <div>
                  <div className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Flip Selected</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleMirrorAction('flip-horizontal')}
                      className="py-2 px-2 bg-slate-800 hover:bg-slate-750 hover:border-slate-600 rounded border border-slate-700 text-[11px] text-slate-200 transition text-center font-medium shadow-sm cursor-pointer"
                      title="Flip selected elements horizontally"
                    >
                      ↔ Flip Horiz
                    </button>
                    <button
                      onClick={() => handleMirrorAction('flip-vertical')}
                      className="py-2 px-2 bg-slate-800 hover:bg-slate-750 hover:border-slate-600 rounded border border-slate-700 text-[11px] text-slate-200 transition text-center font-medium shadow-sm cursor-pointer"
                      title="Flip selected elements vertically"
                    >
                      ↕ Flip Vert
                    </button>
                  </div>
                </div>

                {/* Sub-label: Mirror Duplicate Operations */}
                <div>
                  <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1">Clone & Symmetrical Mirror</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleMirrorAction('mirror-horizontal')}
                      className="py-2 px-2 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-900 hover:border-indigo-500 rounded text-[11px] text-indigo-200 transition text-center font-semibold flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                      title="Duplicate and mirror across the horizontal center axis"
                    >
                      <span>👥 Mirror Left ↔ Right</span>
                    </button>
                    <button
                      onClick={() => handleMirrorAction('mirror-vertical')}
                      className="py-2 px-2 bg-indigo-950/40 hover:bg-indigo-900/60 border border-indigo-900 hover:border-indigo-500 rounded text-[11px] text-indigo-200 transition text-center font-semibold flex items-center justify-center gap-1 shadow-sm cursor-pointer"
                      title="Duplicate and mirror across the vertical center axis"
                    >
                      <span>👥 Mirror Top ↕ Bottom</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-slate-900/40 rounded border border-dashed border-slate-800 text-center text-slate-500 text-[11px]">
                Select one or more items on the canvas to use the mirroring or flip tools.
              </div>
            )}
          </div>

          {/* Section: Tracing Image Parameters and Opacity */}
          {tracingImage && (
            <div className="p-4 border-b border-slate-800 bg-slate-900/20">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-bold uppercase text-indigo-400 tracking-wider">Tracing Image Reference</h3>
                <button
                  onClick={() => setTracingImage(null)}
                  className="text-slate-500 hover:text-rose-400 text-[10px]"
                >
                  Clear Image
                </button>
              </div>

              <div className="space-y-3 text-xs">
                {/* Switch tools */}
                <div className="flex justify-between items-center text-[11px] text-slate-300">
                  <span className="font-medium truncate max-w-[150px]">{tracingImage.name}</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setTracingImage(t => t ? { ...t, visible: !t.visible } : null)}
                      className={`p-1 rounded ${tracingImage.visible ? 'text-indigo-400 bg-slate-800' : 'text-slate-600'}`}
                      title="Toggle Visibility"
                    >
                      {tracingImage.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                    <button
                      onClick={() => setTracingImage(t => t ? { ...t, locked: !t.locked } : null)}
                      className={`p-1 rounded ${tracingImage.locked ? 'text-amber-500 bg-slate-800' : 'text-slate-600'}`}
                      title="Lock Placement"
                    >
                      {tracingImage.locked ? <Lock size={13} /> : <Unlock size={13} />}
                    </button>
                  </div>
                </div>

                {/* Opacity slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
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
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Scale slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
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
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                {/* Rotation control slider */}
                <div>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
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
                    className="w-full h-1 bg-slate-800 rounded appearance-none cursor-pointer accent-indigo-500"
                  />
                </div>

                <p className="text-[10px] text-slate-500 text-center leading-tight">
                  💡 Drag image on canvas anytime when safety lock is unlocked in select pointing mode.
                </p>

              </div>
            </div>
          )}

          {/* Section: Layers Panel */}
          <div className="p-4 flex-1">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider">Layers Panel</h3>
              <button
                onClick={handleAddLayer}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
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
                        ? 'bg-slate-900 border-indigo-500/70 shadow-sm' 
                        : 'bg-slate-950/60 border-slate-900 hover:bg-slate-900/40'
                    }`}
                    onClick={() => setActiveLayerId(l.id)}
                  >
                    <div className="flex items-center justify-between gap-1.5 text-xs">
                      {/* Name & Selector */}
                      <span className={`font-medium cursor-pointer truncate max-w-[124px] ${isActive ? 'text-white' : 'text-slate-300'}`}>
                        {l.name}
                      </span>

                      {/* Controls layer icons */}
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => toggleLayerVisible(l.id)}
                          className={`p-1 rounded ${l.visible ? 'text-slate-300 hover:text-white' : 'text-slate-600'}`}
                          title="Visibility"
                        >
                          {l.visible ? <Eye size={12} /> : <EyeOff size={11} />}
                        </button>
                        <button
                          onClick={() => toggleLayerLocked(l.id)}
                          className={`p-1 rounded ${l.locked ? 'text-amber-500' : 'text-slate-600 hover:text-white'}`}
                          title="Lock layers"
                        >
                          {l.locked ? <Lock size={12} /> : <Unlock size={11} />}
                        </button>

                        {/* Order changers */}
                        <button
                          onClick={() => handleReorderLayer(index, 'up')}
                          disabled={index === 0}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronUp size={12} />
                        </button>
                        <button
                          onClick={() => handleReorderLayer(index, 'down')}
                          disabled={index === layers.length - 1}
                          className="text-slate-600 hover:text-slate-300 disabled:opacity-30 disabled:pointer-events-none"
                        >
                          <ChevronDown size={12} />
                        </button>

                        <button
                          onClick={() => handleDeleteLayer(l.id)}
                          className="text-slate-600 hover:text-rose-400 pl-1"
                          title="Delete paint Layer"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>

                    {/* Miniature element list inside current layer for detailed view */}
                    {l.elements.length > 0 && (
                      <div className="mt-2 pl-2 space-y-1 border-l border-slate-800 text-[10px]">
                        {l.elements.map(el => (
                          <div
                            key={el.id}
                            className={`flex justify-between items-center px-1.5 py-0.5 rounded ${
                              selectedElementIds.includes(el.id)
                                ? 'bg-indigo-950/50 text-indigo-300 border border-indigo-900/60' 
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedElementIds([el.id]);
                            }}
                          >
                            <span className="truncate max-w-[120px]">{el.name}</span>
                            <span className="font-mono text-[9px] text-slate-600">{el.nodes.length} nodes</span>
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

      {/* --- Simple Status bottom-rail --- */}
      <footer className="h-8 bg-slate-950 border-t border-slate-850 px-6 flex items-center justify-between text-[11px] text-slate-500 font-mono z-25 select-none">
        <div>
          Tool: <span className="text-slate-300 capitalize font-bold">{tool}</span>
          {activePathId && <span className="text-indigo-400 ml-2 animate-pulse">• Active pen line drawing...</span>}
        </div>
        <div className="flex gap-4">
          <span>Active layer nodes: {getActiveLayer().elements.reduce((acc, el) => acc + el.nodes.length, 0)}</span>
          <span className="hidden sm:inline">Press Esc/Enter to complete pen stroke. Delete keys clear points.</span>
        </div>
      </footer>
    </div>
  );
}
