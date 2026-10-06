export interface Point {
  x: number;
  y: number;
}

export type NodeType = 'corner' | 'smooth' | 'symmetric';

export interface VectorNode {
  id: string;
  anchor: Point;
  handleIn?: Point;  // Absolute coordinates. If undefined, no handle on left.
  handleOut?: Point; // Absolute coordinates. If undefined, no handle on right.
  type: NodeType;
}

export interface PathElement {
  id: string;
  name: string;
  type: 'path' | 'rect' | 'ellipse' | 'polygon';
  nodes: VectorNode[];
  closed: boolean;
  fill: string;        // hex or "none"
  fillOpacity: number; // 0 to 1
  stroke: string;      // hex
  strokeWidth: number;
  strokeDashArray?: string;
  visible: boolean;
  locked: boolean;
  brushId?: string; // id of applied brush, if any
}

export type BrushType = 'art' | 'pattern';

export interface BrushOptions {
  direction: 'left-to-right' | 'right-to-left';
  stretchMode?: 'stretch-to-fit' | 'proportional';
  spacing?: number; // Spacing factor for pattern brush (e.g. 1.0 = adjacent, 1.5 = spaced)
  flipAcross?: boolean; // Flip across the stroke axis (vertical)
  flipAlong?: boolean;  // Flip along stroke direction (horizontal)
  colorMode: 'tints' | 'original'; // 'tints' = recolor with stroke color; 'original' = maintain original colors
  scale: number; // thickness / scale multiplier, default 1.0
}

export interface BrushDefinition {
  id: string;
  name: string;
  type: BrushType;
  elements: PathElement[];
  options: BrushOptions;
  thumbnailSvg?: string;
  isDefault?: boolean;
  createdAt?: number;
}

export interface Layer {
  id: string;
  name: string;
  elements: PathElement[];
  visible: boolean;
  locked: boolean;
}

export interface TracingImage {
  id: string;
  url: string;
  name: string;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}

export type ToolType =
  | 'select'
  | 'direct-select'
  | 'pen'
  | 'add-anchor'
  | 'delete-anchor'
  | 'anchor-convert'
  | 'rect'
  | 'ellipse'
  | 'triangle'
  | 'spiral'
  | 'eraser';

export interface GridConfig {
  size: number;
  visible: boolean;
  snap: boolean;
}

export interface SnapConfig {
  points: boolean;
  grid: boolean;
}

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  coord: number;
  minVal: number;
  maxVal: number;
}
