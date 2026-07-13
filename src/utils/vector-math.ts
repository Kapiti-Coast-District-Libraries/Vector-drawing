import { Point, VectorNode, PathElement } from '../types';
import clipper from 'polygon-clipping';

export function getCubicBezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

export function sampleCurve(p0: Point, p1: Point, p2: Point, p3: Point, samples = 14): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= samples; i++) {
    points.push(getCubicBezierPoint(i / samples, p0, p1, p2, p3));
  }
  return points;
}

export function getPathData(nodes: VectorNode[], closed: boolean): string {
  if (nodes.length === 0) return '';
  let d = `M ${nodes[0].anchor.x} ${nodes[0].anchor.y}`;

  for (let i = 0; i < nodes.length - 1; i++) {
    const current = nodes[i];
    const next = nodes[i + 1];
    d += getSegmentCommand(current, next);
  }

  if (closed && nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    d += getSegmentCommand(last, first);
    d += ' Z';
  }

  return d;
}

export function getSegmentCommand(fromNode: VectorNode, toNode: VectorNode): string {
  const h1 = fromNode.handleOut;
  const h2 = toNode.handleIn;

  if (h1 || h2) {
    const cp1 = h1 || fromNode.anchor;
    const cp2 = h2 || toNode.anchor;
    return ` C ${cp1.x.toFixed(2)} ${cp1.y.toFixed(2)}, ${cp2.x.toFixed(2)} ${cp2.y.toFixed(2)}, ${toNode.anchor.x.toFixed(2)} ${toNode.anchor.y.toFixed(2)}`;
  } else {
    return ` L ${toNode.anchor.x.toFixed(2)} ${toNode.anchor.y.toFixed(2)}`;
  }
}

// Convert path elements into polygon rings compatible with polygon-clipping.
// Each polygon is Array<Array<[number, number]>> (ring list).
export function pathElementToPolygonCoords(element: PathElement): [number, number][][] {
  if (element.nodes.length < 2) return [];
  const coords: [number, number][] = [];
  const nodes = element.nodes;

  for (let i = 0; i < nodes.length - 1; i++) {
    const current = nodes[i];
    const next = nodes[i + 1];
    const h1 = current.handleOut;
    const h2 = next.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || current.anchor;
      const cp2 = h2 || next.anchor;
      const sampled = sampleCurve(current.anchor, cp1, cp2, next.anchor, 14);
      const startIdx = coords.length === 0 ? 0 : 1;
      for (let j = startIdx; j < sampled.length; j++) {
        coords.push([sampled[j].x, sampled[j].y]);
      }
    } else {
      if (coords.length === 0) {
        coords.push([current.anchor.x, current.anchor.y]);
      }
      coords.push([next.anchor.x, next.anchor.y]);
    }
  }

  // Handle closure segment back to start
  if (nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    const h1 = last.handleOut;
    const h2 = first.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || last.anchor;
      const cp2 = h2 || first.anchor;
      const sampled = sampleCurve(last.anchor, cp1, cp2, first.anchor, 14);
      for (let j = 1; j < sampled.length; j++) {
        coords.push([sampled[j].x, sampled[j].y]);
      }
    } else {
      coords.push([first.anchor.x, first.anchor.y]);
    }
  }

  // Clean successive degenerate vertices
  const cleaned: [number, number][] = [];
  for (const c of coords) {
    if (cleaned.length === 0) {
      cleaned.push(c);
    } else {
      const last = cleaned[cleaned.length - 1];
      const dist = Math.hypot(last[0] - c[0], last[1] - c[1]);
      if (dist > 0.1) {
        cleaned.push(c);
      }
    }
  }

  // Remove duplicate close endpoint
  if (cleaned.length > 2) {
    const first = cleaned[0];
    const last = cleaned[cleaned.length - 1];
    const dist = Math.hypot(first[0] - last[0], first[1] - last[1]);
    if (dist < 0.2) {
      cleaned.pop();
    }
  }

  // polygon-clipping expects ring to start and end at the same point (explicit closing)
  if (cleaned.length > 2) {
    cleaned.push([cleaned[0][0], cleaned[0][1]]);
    return [cleaned];
  }
  return [];
}

// Perform Pathfinder Operations
export function performPathfinder(
  operation: 'union' | 'subtract' | 'intersect' | 'exclude',
  elements: PathElement[]
): PathElement | null {
  if (elements.length < 2) return null;

  // Convert elements to multipolygon formats
  const shapes = elements.map(el => pathElementToPolygonCoords(el)).filter(s => s.length > 0);
  if (shapes.length < 2) return null;

  let result: any = null;

  try {
    if (operation === 'union') {
      result = clipper.union(shapes[0] as any, ...shapes.slice(1) as any);
    } else if (operation === 'subtract') {
      let current = shapes[0] as any;
      for (let i = 1; i < shapes.length; i++) {
        current = clipper.difference(current, shapes[i] as any);
      }
      result = current;
    } else if (operation === 'intersect') {
      let current = shapes[0] as any;
      for (let i = 1; i < shapes.length; i++) {
        current = clipper.intersection(current, shapes[i] as any);
      }
      result = current;
    } else if (operation === 'exclude') {
      let current = shapes[0] as any;
      for (let i = 1; i < shapes.length; i++) {
        current = clipper.xor(current, shapes[i] as any);
      }
      result = current;
    }
  } catch (err) {
    console.error("Pathfinder boolean operation error:", err);
    return null;
  }

  if (!result || result.length === 0) return null;

  // Convert Multipolygon coordinates back to a custom closed PathElement.
  // Each Multipolygon is: Array<Array<Array<[number, number]>>> (poly -> rings -> coords).
  // We can merge the paths into a single path element if multiple rings exist, OR create a single merged list of nodes.
  // For a clean implementation, let's take the first main outer ring and convert it back to a series of nodes.
  // This guarantees simple editing for kids!
  const poly = result[0]; // first polygon
  if (!poly || poly.length === 0) return null;

  const outerRing = poly[0]; // first ring is the outer boundary
  if (!outerRing || outerRing.length < 3) return null;

  // Convert ring back to VectorNode list.
  // We can simplify or keep it as-is. In a simple setup, each point can be a node (no handles initially, corner nodes).
  // This lets kids immediately edit or smooth them themselves!
  const strokeColor = elements[0].stroke;
  const fillColor = elements[0].fill !== 'none' ? elements[0].fill : '#3b82f6';

  // Map outerRing back to nodes. Note: outerRing's last coordinate matches his first. We exclude it to avoid redundant point.
  const nodes: VectorNode[] = [];
  const limit = outerRing.length - 1; // skip final closing duplicate point

  for (let i = 0; i < limit; i++) {
    const pt = outerRing[i];
    nodes.push({
      id: `node-${Math.random().toString(36).substr(2, 9)}`,
      anchor: { x: pt[0], y: pt[1] },
      type: 'corner'
    });
  }

  return {
    id: `path-${Math.random().toString(36).substr(2, 9)}`,
    name: `${operation.toUpperCase()} Result`,
    type: 'path',
    nodes,
    closed: true,
    fill: fillColor,
    fillOpacity: elements[0].fillOpacity,
    stroke: strokeColor,
    strokeWidth: elements[0].strokeWidth,
    visible: true,
    locked: false,
  };
}

// Distance Helper
export function distance(p1: Point, p2: Point): number {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

// Snapping algorithm: grid or existing anchor points
export function snapPoint(
  p: Point,
  grid: { size: number; snap: boolean },
  allElements: PathElement[],
  snapRadius = 10
): { point: Point; snappedTo: 'grid' | 'point' | 'none' } {
  // 1. Point snapping takes precedence
  if (allElements.length > 0) {
    let bestDist = snapRadius;
    let bestPt: Point | null = null;

    for (const el of allElements) {
      if (!el.visible || el.locked) continue;
      for (const node of el.nodes) {
        // Test anchor
        const dAnchor = distance(p, node.anchor);
        if (dAnchor < bestDist) {
          bestDist = dAnchor;
          bestPt = node.anchor;
        }

        // Test handles optionally
        if (node.handleIn) {
          const dIn = distance(p, node.handleIn);
          if (dIn < bestDist) {
            bestDist = dIn;
            bestPt = node.handleIn;
          }
        }
        if (node.handleOut) {
          const dOut = distance(p, node.handleOut);
          if (dOut < bestDist) {
            bestDist = dOut;
            bestPt = node.handleOut;
          }
        }
      }
    }

    if (bestPt) {
      return { point: { ...bestPt }, snappedTo: 'point' };
    }
  }

  // 2. Grid snapping
  if (grid.snap && grid.size > 0) {
    const snapX = Math.round(p.x / grid.size) * grid.size;
    const snapY = Math.round(p.y / grid.size) * grid.size;
    if (Math.hypot(p.x - snapX, p.y - snapY) < snapRadius * 1.5) {
      return { point: { x: snapX, y: snapY }, snappedTo: 'grid' };
    }
  }

  return { point: p, snappedTo: 'none' };
}
