import { Point, VectorNode, PathElement } from '../types';
import clipper from 'polygon-clipping';
import { distance } from './vector-math';

export interface StrokeToPathOptions {
  mode?: 'outline' | 'dual-lines'; // 'outline' = closed filled path traced on both sides; 'dual-lines' = 2 separate open paths
  cap?: 'round' | 'butt' | 'square';
  join?: 'round' | 'miter' | 'bevel';
  customWidth?: number;
  keepOriginal?: boolean;
}

interface SampledPoint {
  pt: Point;
  tangent: Point;
  normal: Point;
}

/**
 * Evaluates cubic Bezier position and first derivative (tangent)
 */
function evalCubicBezier(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point
): { pt: Point; tangent: Point } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;

  const pt: Point = {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };

  // Derivative: 3*(1-t)^2*(p1-p0) + 6*(1-t)*t*(p2-p1) + 3*t^2*(p3-p2)
  const d0x = p1.x - p0.x;
  const d0y = p1.y - p0.y;
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p3.x - p2.x;
  const d2y = p3.y - p2.y;

  const tangent: Point = {
    x: 3 * mt2 * d0x + 6 * mt * t * d1x + 3 * t2 * d2x,
    y: 3 * mt2 * d0y + 6 * mt * t * d1y + 3 * t2 * d2y,
  };

  return { pt, tangent };
}

/**
 * Samples a path element finely into a chain of center points and tangent/normal vectors
 */
function samplePathWithNormals(element: PathElement): SampledPoint[] {
  const { nodes, closed } = element;
  if (nodes.length < 2) return [];

  const rawSamples: SampledPoint[] = [];
  const segmentCount = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < segmentCount; i++) {
    const current = nodes[i];
    const next = nodes[(i + 1) % nodes.length];

    const h1 = current.handleOut;
    const h2 = next.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || current.anchor;
      const cp2 = h2 || next.anchor;
      const approxLen =
        distance(current.anchor, cp1) +
        distance(cp1, cp2) +
        distance(cp2, next.anchor);
      const steps = Math.max(14, Math.min(48, Math.ceil(approxLen / 6)));

      const startStep = rawSamples.length === 0 ? 0 : 1;
      for (let s = startStep; s <= steps; s++) {
        const t = s / steps;
        const { pt, tangent } = evalCubicBezier(
          t,
          current.anchor,
          cp1,
          cp2,
          next.anchor
        );

        let tanLen = Math.hypot(tangent.x, tangent.y);
        let normTan = { x: 1, y: 0 };
        if (tanLen > 1e-4) {
          normTan = { x: tangent.x / tanLen, y: tangent.y / tanLen };
        } else {
          // Fallback to straight chord if derivative collapses
          const chordX = next.anchor.x - current.anchor.x;
          const chordY = next.anchor.y - current.anchor.y;
          const chordLen = Math.hypot(chordX, chordY) || 1;
          normTan = { x: chordX / chordLen, y: chordY / chordLen };
        }

        // Left normal: (-ny, nx)
        const normal = { x: -normTan.y, y: normTan.x };

        rawSamples.push({ pt, tangent: normTan, normal });
      }
    } else {
      // Linear segment
      const dx = next.anchor.x - current.anchor.x;
      const dy = next.anchor.y - current.anchor.y;
      const len = Math.hypot(dx, dy) || 1;
      const normTan = { x: dx / len, y: dy / len };
      const normal = { x: -normTan.y, y: normTan.x };

      if (rawSamples.length === 0) {
        rawSamples.push({ pt: current.anchor, tangent: normTan, normal });
      }
      rawSamples.push({ pt: next.anchor, tangent: normTan, normal });
    }
  }

  // Smooth intermediate normal transitions using bisectors to avoid harsh spikes
  const smoothed: SampledPoint[] = [];
  for (let i = 0; i < rawSamples.length; i++) {
    const curr = rawSamples[i];
    if (i === 0 || i === rawSamples.length - 1) {
      if (closed && rawSamples.length > 2) {
        const prev = rawSamples[rawSamples.length - 2];
        const next = rawSamples[1];
        const avgNormX = (prev.normal.x + next.normal.x) / 2;
        const avgNormY = (prev.normal.y + next.normal.y) / 2;
        const nLen = Math.hypot(avgNormX, avgNormY) || 1;
        smoothed.push({
          pt: curr.pt,
          tangent: curr.tangent,
          normal: { x: avgNormX / nLen, y: avgNormY / nLen },
        });
      } else {
        smoothed.push(curr);
      }
      continue;
    }

    const prev = rawSamples[i - 1];
    const next = rawSamples[i + 1];

    // Compute average normal
    const avgNormX = (prev.normal.x + curr.normal.x + next.normal.x) / 3;
    const avgNormY = (prev.normal.y + curr.normal.y + next.normal.y) / 3;
    const nLen = Math.hypot(avgNormX, avgNormY);

    if (nLen > 1e-4) {
      smoothed.push({
        pt: curr.pt,
        tangent: curr.tangent,
        normal: { x: avgNormX / nLen, y: avgNormY / nLen },
      });
    } else {
      smoothed.push(curr);
    }
  }

  return smoothed;
}

/**
 * Standard Ramer-Douglas-Peucker polygon reduction algorithm
 */
function simplifyPoints(points: Point[], epsilon = 0.8): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;

  const p1 = points[0];
  const p2 = points[points.length - 1];

  const lineDx = p2.x - p1.x;
  const lineDy = p2.y - p1.y;
  const lineLenSq = lineDx * lineDx + lineDy * lineDy;

  for (let i = 1; i < points.length - 1; i++) {
    let d = 0;
    if (lineLenSq === 0) {
      d = distance(points[i], p1);
    } else {
      const t = Math.max(
        0,
        Math.min(
          1,
          ((points[i].x - p1.x) * lineDx + (points[i].y - p1.y) * lineDy) /
            lineLenSq
        )
      );
      const projX = p1.x + t * lineDx;
      const projY = p1.y + t * lineDy;
      d = Math.hypot(points[i].x - projX, points[i].y - projY);
    }

    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPoints(points.slice(0, index + 1), epsilon);
    const right = simplifyPoints(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  } else {
    return [p1, p2];
  }
}

/**
 * Generates smooth Bezier handles for simplified polygon vertices
 */
function pointsToVectorNodes(points: Point[], closed = true): VectorNode[] {
  if (points.length === 0) return [];
  if (points.length <= 2) {
    return points.map(pt => ({
      id: `node-${Math.random().toString(36).substr(2, 9)}`,
      anchor: pt,
      type: 'corner',
    }));
  }

  const nodes: VectorNode[] = [];
  const count = points.length;

  for (let i = 0; i < count; i++) {
    const curr = points[i];
    const prev = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];

    if (!closed && (i === 0 || i === count - 1)) {
      nodes.push({
        id: `node-${Math.random().toString(36).substr(2, 9)}`,
        anchor: curr,
        type: 'corner',
      });
      continue;
    }

    // Tangent vector from prev to next
    const tanX = next.x - prev.x;
    const tanY = next.y - prev.y;
    const tanLen = Math.hypot(tanX, tanY) || 1;
    const ux = tanX / tanLen;
    const uy = tanY / tanLen;

    // Corner angle check: if turn is sharper than 60 degrees, keep as sharp corner
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const l2 = Math.hypot(d2x, d2y) || 1;
    const dot = (d1x * d2x + d1y * d2y) / (l1 * l2);

    if (dot < 0.5) {
      // Sharp corner
      nodes.push({
        id: `node-${Math.random().toString(36).substr(2, 9)}`,
        anchor: curr,
        type: 'corner',
      });
    } else {
      // Smooth corner
      const hLen1 = Math.min(l1 * 0.35, 30);
      const hLen2 = Math.min(l2 * 0.35, 30);

      nodes.push({
        id: `node-${Math.random().toString(36).substr(2, 9)}`,
        anchor: curr,
        handleIn: { x: curr.x - ux * hLen1, y: curr.y - uy * hLen1 },
        handleOut: { x: curr.x + ux * hLen2, y: curr.y + uy * hLen2 },
        type: 'smooth',
      });
    }
  }

  return nodes;
}

/**
 * Traces either side of a stroke into path lines.
 * Supports:
 * - 'outline': Creates closed filled vector path(s) encompassing the full stroke volume (Outline Stroke)
 * - 'dual-lines': Creates two separate open path elements tracing the left and right edges
 */
export function convertStrokeToPath(
  element: PathElement,
  options: StrokeToPathOptions = {}
): PathElement[] {
  const {
    mode = 'outline',
    cap = 'round',
    customWidth,
  } = options;

  const width = customWidth || element.strokeWidth || 3;
  const halfWidth = width / 2;

  if (element.nodes.length < 2) return [];

  const samples = samplePathWithNormals(element);
  if (samples.length < 2) return [];

  // 1. Calculate Left and Right offset lines along the path
  const leftPoints: Point[] = [];
  const rightPoints: Point[] = [];

  for (let i = 0; i < samples.length; i++) {
    const { pt, normal } = samples[i];
    leftPoints.push({
      x: pt.x + normal.x * halfWidth,
      y: pt.y + normal.y * halfWidth,
    });
    rightPoints.push({
      x: pt.x - normal.x * halfWidth,
      y: pt.y - normal.y * halfWidth,
    });
  }

  // --- DUAL-LINES MODE: Return 2 separate open path elements (Left and Right borders) ---
  if (mode === 'dual-lines') {
    const simplifiedLeft = simplifyPoints(leftPoints, 0.7);
    const simplifiedRight = simplifyPoints(rightPoints, 0.7);

    const leftNodes = pointsToVectorNodes(simplifiedLeft, element.closed);
    const rightNodes = pointsToVectorNodes(simplifiedRight, element.closed);

    const leftPath: PathElement = {
      id: `stroke-line-left-${Math.random().toString(36).substr(2, 9)}`,
      name: `${element.name} (Left Border)`,
      type: 'path',
      nodes: leftNodes,
      closed: element.closed,
      fill: 'none',
      fillOpacity: 1,
      stroke: element.stroke !== 'none' ? element.stroke : '#2563eb',
      strokeWidth: 1.5,
      visible: true,
      locked: false,
    };

    const rightPath: PathElement = {
      id: `stroke-line-right-${Math.random().toString(36).substr(2, 9)}`,
      name: `${element.name} (Right Border)`,
      type: 'path',
      nodes: rightNodes,
      closed: element.closed,
      fill: 'none',
      fillOpacity: 1,
      stroke: element.stroke !== 'none' ? element.stroke : '#2563eb',
      strokeWidth: 1.5,
      visible: true,
      locked: false,
    };

    return [leftPath, rightPath];
  }

  // --- OUTLINE MODE: Create closed filled outline path representing the solid stroke ---

  if (element.closed) {
    // For a closed path, the stroke forms an outer boundary loop and an inner boundary loop (ring/donut).
    // In polygon clipping coordinates: [ [outerRing], [innerRing] ]
    const outerCoords: [number, number][] = leftPoints.map(p => [p.x, p.y]);
    const innerCoords: [number, number][] = rightPoints.map(p => [p.x, p.y]);

    // Ensure explicit ring closure
    if (outerCoords.length > 2) {
      outerCoords.push([outerCoords[0][0], outerCoords[0][1]]);
    }
    if (innerCoords.length > 2) {
      innerCoords.push([innerCoords[0][0], innerCoords[0][1]]);
    }

    let diffResult: any = null;
    try {
      // Outer polygon minus inner polygon
      diffResult = clipper.difference([outerCoords], [innerCoords]);
    } catch (e) {
      console.warn("Polygon clipping difference failed, using seam cut fallback", e);
    }

    if (diffResult && diffResult.length > 0) {
      const outputElements: PathElement[] = [];

      for (const poly of diffResult) {
        if (!poly || poly.length === 0) continue;
        const outer = poly[0];
        const innerHole = poly[1] || null;

        // If it's a ring with an inner hole, create a seamless bridge cut so it's a single editable VectorNode loop
        let ringPoints: Point[] = [];
        if (innerHole && innerHole.length > 3) {
          const outerRingPts = outer.slice(0, -1).map((c: any) => ({ x: c[0], y: c[1] }));
          const innerRingPts = innerHole.slice(0, -1).map((c: any) => ({ x: c[0], y: c[1] }));
          // Connect outer to inner with keyhole seam
          ringPoints = [
            ...outerRingPts,
            outerRingPts[0],
            innerRingPts[0],
            ...innerRingPts.reverse(),
            innerRingPts[0],
          ];
        } else {
          ringPoints = outer.slice(0, -1).map((c: any) => ({ x: c[0], y: c[1] }));
        }

        const simplified = simplifyPoints(ringPoints, 0.8);
        const nodes = pointsToVectorNodes(simplified, true);

        outputElements.push({
          id: `outline-${Math.random().toString(36).substr(2, 9)}`,
          name: `${element.name} (Outline Stroke)`,
          type: 'path',
          nodes,
          closed: true,
          fill: element.stroke !== 'none' ? element.stroke : '#2563eb',
          fillOpacity: 1,
          stroke: 'none',
          strokeWidth: 1,
          visible: true,
          locked: false,
        });
      }

      if (outputElements.length > 0) return outputElements;
    }

    // Fallback if difference was empty: connect outer and inner directly
    const seamPoints: Point[] = [...leftPoints, ...rightPoints.reverse()];
    const simplified = simplifyPoints(seamPoints, 0.8);
    const nodes = pointsToVectorNodes(simplified, true);

    return [{
      id: `outline-${Math.random().toString(36).substr(2, 9)}`,
      name: `${element.name} (Outline Stroke)`,
      type: 'path',
      nodes,
      closed: true,
      fill: element.stroke !== 'none' ? element.stroke : '#2563eb',
      fillOpacity: 1,
      stroke: 'none',
      strokeWidth: 1,
      visible: true,
      locked: false,
    }];
  }

  // Open Path: construct full outline boundary ring
  // 1. Left points (from start to end)
  // 2. End cap (from left end to right end)
  // 3. Right points (from end to start, reversed)
  // 4. Start cap (from right start to left start)

  const endCapPoints: Point[] = [];
  const lastSample = samples[samples.length - 1];
  const lastTan = lastSample.tangent;
  const lastPt = lastSample.pt;

  if (cap === 'round') {
    // Semicircle around last point
    const startAngle = Math.atan2(lastSample.normal.y, lastSample.normal.x);
    const arcSteps = 9;
    for (let i = 1; i < arcSteps; i++) {
      const angle = startAngle - (Math.PI * i) / arcSteps;
      endCapPoints.push({
        x: lastPt.x + Math.cos(angle) * halfWidth,
        y: lastPt.y + Math.sin(angle) * halfWidth,
      });
    }
  } else if (cap === 'square') {
    // Square cap extended forward by halfWidth
    endCapPoints.push({
      x: lastPt.x + lastSample.normal.x * halfWidth + lastTan.x * halfWidth,
      y: lastPt.y + lastSample.normal.y * halfWidth + lastTan.y * halfWidth,
    });
    endCapPoints.push({
      x: lastPt.x - lastSample.normal.x * halfWidth + lastTan.x * halfWidth,
      y: lastPt.y - lastSample.normal.y * halfWidth + lastTan.y * halfWidth,
    });
  }
  // Butt cap needs no extra vertices; straight segment connects left end to right end

  const startCapPoints: Point[] = [];
  const firstSample = samples[0];
  const firstTan = firstSample.tangent;
  const firstPt = firstSample.pt;

  if (cap === 'round') {
    // Semicircle around first point
    const startAngle = Math.atan2(-firstSample.normal.y, -firstSample.normal.x);
    const arcSteps = 9;
    for (let i = 1; i < arcSteps; i++) {
      const angle = startAngle - (Math.PI * i) / arcSteps;
      startCapPoints.push({
        x: firstPt.x + Math.cos(angle) * halfWidth,
        y: firstPt.y + Math.sin(angle) * halfWidth,
      });
    }
  } else if (cap === 'square') {
    startCapPoints.push({
      x: firstPt.x - firstSample.normal.x * halfWidth - firstTan.x * halfWidth,
      y: firstPt.y - firstSample.normal.y * halfWidth - firstTan.y * halfWidth,
    });
    startCapPoints.push({
      x: firstPt.x + firstSample.normal.x * halfWidth - firstTan.x * halfWidth,
      y: firstPt.y + firstSample.normal.y * halfWidth - firstTan.y * halfWidth,
    });
  }

  // Combine full perimeter loop
  const reversedRight = [...rightPoints].reverse();
  const rawBoundary: Point[] = [
    ...leftPoints,
    ...endCapPoints,
    ...reversedRight,
    ...startCapPoints,
  ];

  // Clean boundary with polygon-clipping union to eliminate any self-intersections
  let cleanPolys: any = null;
  try {
    const coords: [number, number][] = rawBoundary.map(p => [p.x, p.y]);
    if (coords.length > 2) {
      coords.push([coords[0][0], coords[0][1]]);
      cleanPolys = clipper.union([coords]);
    }
  } catch (e) {
    console.warn("Polygon clipping union failed, using raw simplified outline", e);
  }

  if (cleanPolys && cleanPolys.length > 0) {
    const results: PathElement[] = [];

    for (const poly of cleanPolys) {
      const ring = poly[0];
      if (!ring || ring.length < 4) continue;
      const pts: Point[] = ring.slice(0, -1).map((c: any) => ({ x: c[0], y: c[1] }));
      const simplified = simplifyPoints(pts, 0.8);
      const nodes = pointsToVectorNodes(simplified, true);

      results.push({
        id: `outline-${Math.random().toString(36).substr(2, 9)}`,
        name: `${element.name} (Outline)`,
        type: 'path',
        nodes,
        closed: true,
        fill: element.stroke !== 'none' ? element.stroke : '#2563eb',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      });
    }

    if (results.length > 0) return results;
  }

  // Fallback if clipper union produced nothing
  const simplified = simplifyPoints(rawBoundary, 0.8);
  const nodes = pointsToVectorNodes(simplified, true);

  return [{
    id: `outline-${Math.random().toString(36).substr(2, 9)}`,
    name: `${element.name} (Outline)`,
    type: 'path',
    nodes,
    closed: true,
    fill: element.stroke !== 'none' ? element.stroke : '#2563eb',
    fillOpacity: 1,
    stroke: 'none',
    strokeWidth: 1,
    visible: true,
    locked: false,
  }];
}
