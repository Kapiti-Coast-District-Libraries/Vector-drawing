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

export type ToolType = 'select' | 'direct-select' | 'pen' | 'rect' | 'ellipse' | 'spiral' | 'eraser';

export interface GridConfig {
  size: number;
  visible: boolean;
  snap: boolean;
}

export interface SnapConfig {
  points: boolean;
  grid: boolean;
}
