import { Point, VectorNode, PathElement, BrushDefinition, BrushOptions, BrushType } from '../types';
import { distance } from './vector-math';

interface SampledStrokePoint {
  pt: Point;
  tangent: Point;
  normal: Point;
  s: number; // cumulative arc length
  curvature: number; // local signed curvature dTheta / ds
}

export interface BrushBoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * Evaluates cubic Bezier position and first derivative (tangent) at parameter t [0, 1]
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

  let tanX = 3 * mt2 * d0x + 6 * mt * t * d1x + 3 * t2 * d2x;
  let tanY = 3 * mt2 * d0y + 6 * mt * t * d1y + 3 * t2 * d2y;
  const tanLen = Math.hypot(tanX, tanY);

  if (tanLen < 1e-5) {
    // Fallback if derivative vanishes
    const chordX = p3.x - p0.x;
    const chordY = p3.y - p0.y;
    const chordLen = Math.hypot(chordX, chordY) || 1;
    return { pt, tangent: { x: chordX / chordLen, y: chordY / chordLen } };
  }

  return { pt, tangent: { x: tanX / tanLen, y: tanY / tanLen } };
}

/**
 * Computes bounding box across one or more vector elements
 */
export function computeBrushBoundingBox(elements: PathElement[]): BrushBoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  elements.forEach((el) => {
    el.nodes.forEach((n) => {
      minX = Math.min(minX, n.anchor.x);
      minY = Math.min(minY, n.anchor.y);
      maxX = Math.max(maxX, n.anchor.x);
      maxY = Math.max(maxY, n.anchor.y);

      if (n.handleIn) {
        minX = Math.min(minX, n.handleIn.x);
        minY = Math.min(minY, n.handleIn.y);
        maxX = Math.max(maxX, n.handleIn.x);
        maxY = Math.max(maxY, n.handleIn.y);
      }
      if (n.handleOut) {
        minX = Math.min(minX, n.handleOut.x);
        minY = Math.min(minY, n.handleOut.y);
        maxX = Math.max(maxX, n.handleOut.x);
        maxY = Math.max(maxY, n.handleOut.y);
      }
    });
  });

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 100, maxY: 30, width: 100, height: 30, centerX: 50, centerY: 15 };
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return {
    minX,
    minY,
    maxX,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Samples a target stroke with ultra-high resolution and smooth normal vector filtering.
 * Eliminates angular faceting, derivative noise, and junction kinks for silky smooth bends.
 */
export function sampleTargetStroke(
  targetElement: PathElement
): { samples: SampledStrokePoint[]; totalLength: number } {
  const { nodes, closed } = targetElement;
  if (nodes.length < 2) {
    return { samples: [], totalLength: 0 };
  }

  const rawPoints: { pt: Point; tangent: Point }[] = [];
  const segCount = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < segCount; i++) {
    const cur = nodes[i];
    const nxt = nodes[(i + 1) % nodes.length];
    const h1 = cur.handleOut;
    const h2 = nxt.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || cur.anchor;
      const cp2 = h2 || nxt.anchor;
      const approxDist =
        distance(cur.anchor, cp1) +
        distance(cp1, cp2) +
        distance(cp2, nxt.anchor);

      // Fine step size (<= 1.5px per step) for fluid curves without polygonal faceting
      const steps = Math.max(24, Math.ceil(approxDist / 1.5));

      const startStep = rawPoints.length === 0 ? 0 : 1;
      for (let s = startStep; s <= steps; s++) {
        const t = s / steps;
        const res = evalCubicBezier(t, cur.anchor, cp1, cp2, nxt.anchor);
        rawPoints.push(res);
      }
    } else {
      const dx = nxt.anchor.x - cur.anchor.x;
      const dy = nxt.anchor.y - cur.anchor.y;
      const segDist = Math.hypot(dx, dy) || 1;
      const unitTan = { x: dx / segDist, y: dy / segDist };

      // Sample linear segments every 2px so distance parameterization matches curves
      const steps = Math.max(2, Math.ceil(segDist / 2));
      const startStep = rawPoints.length === 0 ? 0 : 1;
      for (let s = startStep; s <= steps; s++) {
        const t = s / steps;
        rawPoints.push({
          pt: {
            x: cur.anchor.x + dx * t,
            y: cur.anchor.y + dy * t,
          },
          tangent: unitTan,
        });
      }
    }
  }

  if (rawPoints.length < 2) {
    return { samples: [], totalLength: 0 };
  }

  // Calculate cumulative arc length
  const arcLengths: number[] = [0];
  let accumLength = 0;
  for (let i = 1; i < rawPoints.length; i++) {
    const d = distance(rawPoints[i - 1].pt, rawPoints[i].pt);
    accumLength += d;
    arcLengths.push(accumLength);
  }

  // Raw normals: (-tangent.y, tangent.x)
  const rawNormals: Point[] = rawPoints.map((p) => ({
    x: -p.tangent.y,
    y: p.tangent.x,
  }));

  // Multi-pass Gaussian smoothing on normals:
  // Blends normals across adjacent segments to prevent any ripple or creasing around curves
  let smoothedNormals = [...rawNormals];
  const passes = 2;
  const count = rawNormals.length;

  for (let pass = 0; pass < passes; pass++) {
    const nextNormals: Point[] = new Array(count);
    for (let i = 0; i < count; i++) {
      if (!closed && (i <= 1 || i >= count - 2)) {
        nextNormals[i] = smoothedNormals[i];
        continue;
      }
      const i_m2 = (i - 2 + count) % count;
      const i_m1 = (i - 1 + count) % count;
      const i_p1 = (i + 1) % count;
      const i_p2 = (i + 2) % count;

      // 5-tap Gaussian kernel [1, 2, 4, 2, 1] / 10
      const nx =
        smoothedNormals[i_m2].x * 0.1 +
        smoothedNormals[i_m1].x * 0.2 +
        smoothedNormals[i].x * 0.4 +
        smoothedNormals[i_p1].x * 0.2 +
        smoothedNormals[i_p2].x * 0.1;

      const ny =
        smoothedNormals[i_m2].y * 0.1 +
        smoothedNormals[i_m1].y * 0.2 +
        smoothedNormals[i].y * 0.4 +
        smoothedNormals[i_p1].y * 0.2 +
        smoothedNormals[i_p2].y * 0.1;

      const nLen = Math.hypot(nx, ny) || 1;
      nextNormals[i] = { x: nx / nLen, y: ny / nLen };
    }
    smoothedNormals = nextNormals;
  }

  // Compute local signed curvature dTheta / ds
  const samples: SampledStrokePoint[] = [];
  for (let i = 0; i < count; i++) {
    const prev = rawPoints[Math.max(0, i - 1)];
    const next = rawPoints[Math.min(count - 1, i + 1)];
    const ds = Math.max(0.1, distance(prev.pt, next.pt));

    const anglePrev = Math.atan2(prev.tangent.y, prev.tangent.x);
    const angleNext = Math.atan2(next.tangent.y, next.tangent.x);
    let dAngle = angleNext - anglePrev;
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    const curvature = dAngle / ds;

    // Smoothed tangent perpendicular to smoothed normal
    const norm = smoothedNormals[i];
    const tan = { x: norm.y, y: -norm.x };

    samples.push({
      pt: rawPoints[i].pt,
      tangent: tan,
      normal: norm,
      s: arcLengths[i],
      curvature,
    });
  }

  return { samples, totalLength: accumLength };
}

/**
 * Interpolates path state (pt, tangent, normal, curvature) at continuous distance `d`
 */
export function interpolatePathAtDistance(
  samples: SampledStrokePoint[],
  totalLength: number,
  d: number
): { pt: Point; tangent: Point; normal: Point; curvature: number } {
  if (samples.length === 0) {
    return { pt: { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, normal: { x: 0, y: 1 }, curvature: 0 };
  }
  if (samples.length === 1 || totalLength <= 1e-4) {
    return {
      pt: samples[0].pt,
      tangent: samples[0].tangent,
      normal: samples[0].normal,
      curvature: samples[0].curvature,
    };
  }

  const clampedD = Math.max(0, Math.min(totalLength, d));

  // Binary search for exact interval
  let low = 0;
  let high = samples.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (samples[mid].s < clampedD) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idx2 = Math.min(samples.length - 1, Math.max(1, low));
  const idx1 = idx2 - 1;
  const p1 = samples[idx1];
  const p2 = samples[idx2];

  const segLen = p2.s - p1.s;
  const t = segLen > 1e-5 ? (clampedD - p1.s) / segLen : 0;

  const pt: Point = {
    x: p1.pt.x + (p2.pt.x - p1.pt.x) * t,
    y: p1.pt.y + (p2.pt.y - p1.pt.y) * t,
  };

  // Slerp / normalize tangent & normal
  const tanX = p1.tangent.x + (p2.tangent.x - p1.tangent.x) * t;
  const tanY = p1.tangent.y + (p2.tangent.y - p1.tangent.y) * t;
  const tanLen = Math.hypot(tanX, tanY) || 1;
  const tangent = { x: tanX / tanLen, y: tanY / tanLen };

  const normX = p1.normal.x + (p2.normal.x - p1.normal.x) * t;
  const normY = p1.normal.y + (p2.normal.y - p1.normal.y) * t;
  const normLen = Math.hypot(normX, normY) || 1;
  const normal = { x: normX / normLen, y: normY / normLen };

  const curvature = p1.curvature + (p2.curvature - p1.curvature) * t;

  return { pt, tangent, normal, curvature };
}

/**
 * Deforms a vector path element along the target stroke with segment-aware geometry.
 * - Straight longitudinal edges (like rectangle sides) are sampled smoothly along the normal curve.
 * - Transverse edges (like end caps) stay crisp, perpendicular, and straight.
 * - No micro-oscillating Bezier handles: creates silky smooth, flawless bends.
 */
function deformPathElementAlongStroke(
  brushEl: PathElement,
  bbox: BrushBoundingBox,
  samples: SampledStrokePoint[],
  totalLength: number,
  options: BrushOptions,
  transverseScale: number
): VectorNode[] {
  const { nodes, closed } = brushEl;
  if (nodes.length === 0) return [];

  const isRightToLeft = options.direction === 'right-to-left';
  const flipAlong = !!options.flipAlong;
  const flipAcross = !!options.flipAcross;

  // Coordinate transformation from brush space (x, y) to deformed canvas point
  const mapPoint = (bx: number, by: number): Point => {
    let u = (bx - bbox.minX) / bbox.width;
    if (isRightToLeft) u = 1 - u;
    if (flipAlong) u = 1 - u;
    u = Math.max(0, Math.min(1, u));

    let v = by - bbox.centerY;
    if (flipAcross) v = -v;
    let scaledV = v * transverseScale;

    const distAlongPath = u * totalLength;
    const frame = interpolatePathAtDistance(samples, totalLength, distAlongPath);

    // Curvature mitigation on inside of tight bends:
    // Prevents self-intersecting loops or crushing when bending tightly
    const innerBendFactor = frame.curvature * scaledV;
    if (innerBendFactor < -0.6) {
      const damping = 1 / (1 + Math.abs(innerBendFactor) * 0.35);
      scaledV *= damping;
    }

    return {
      x: frame.pt.x + frame.normal.x * scaledV,
      y: frame.pt.y + frame.normal.y * scaledV,
    };
  };

  const deformedPoints: Point[] = [];
  const segCount = closed ? nodes.length : nodes.length - 1;

  for (let i = 0; i < segCount; i++) {
    const cur = nodes[i];
    const nxt = nodes[(i + 1) % nodes.length];
    const h1 = cur.handleOut;
    const h2 = nxt.handleIn;

    if (h1 || h2) {
      // Curved segment in source brush (e.g. teardrop, oval contour)
      const cp1 = h1 || cur.anchor;
      const cp2 = h2 || nxt.anchor;
      const approxDist =
        distance(cur.anchor, cp1) +
        distance(cp1, cp2) +
        distance(cp2, nxt.anchor);
      const steps = Math.max(12, Math.ceil(approxDist / 2.5));

      const start = deformedPoints.length === 0 ? 0 : 1;
      for (let s = start; s <= steps; s++) {
        const t = s / steps;
        const brushPt = evalCubicBezier(t, cur.anchor, cp1, cp2, nxt.anchor).pt;
        deformedPoints.push(mapPoint(brushPt.x, brushPt.y));
      }
    } else {
      // Straight segment in source brush (e.g. rectangle top/bottom, or end cap)
      const dx = nxt.anchor.x - cur.anchor.x;
      const dy = nxt.anchor.y - cur.anchor.y;

      if (Math.abs(dx) < 0.35) {
        // Transverse segment (end cap, vertical cut):
        // Only endpoints needed! Keeps end caps razor-sharp, straight, and perpendicular to stroke!
        if (deformedPoints.length === 0) {
          deformedPoints.push(mapPoint(cur.anchor.x, cur.anchor.y));
        }
        deformedPoints.push(mapPoint(nxt.anchor.x, nxt.anchor.y));
      } else {
        // Longitudinal segment (top or bottom edge of rectangle / stripe):
        // Flows along the stroke length! Sample smoothly every ~2px
        const uSpan = Math.abs(dx) / bbox.width;
        const pathSpan = uSpan * totalLength;
        const steps = Math.max(14, Math.ceil(pathSpan / 2.0));

        const start = deformedPoints.length === 0 ? 0 : 1;
        for (let s = start; s <= steps; s++) {
          const t = s / steps;
          const bx = cur.anchor.x + dx * t;
          const by = cur.anchor.y + dy * t;
          deformedPoints.push(mapPoint(bx, by));
        }
      }
    }
  }

  // Convert points to clean linear nodes (zero micro-bezier handles = silky smooth SVG rendering!)
  return deformedPoints.map((pt) => ({
    id: `bn-${Math.random().toString(36).substr(2, 9)}`,
    anchor: pt,
    type: 'corner',
  }));
}

/**
 * Core Engine Function:
 * Applies an Art Brush or Pattern Brush to follow a target stroke.
 * Produces silky smooth bends with zero ripples, distortion, or wobbling.
 */
export function applyBrushToStroke(
  targetElement: PathElement,
  brush: BrushDefinition
): PathElement[] {
  if (!brush || !brush.elements || brush.elements.length === 0) {
    return [targetElement];
  }

  const { samples, totalLength } = sampleTargetStroke(targetElement);
  if (samples.length < 2 || totalLength < 2) {
    return [];
  }

  const bbox = computeBrushBoundingBox(brush.elements);
  const options = brush.options;
  const isRightToLeft = options.direction === 'right-to-left';
  const flipAlong = !!options.flipAlong;
  const flipAcross = !!options.flipAcross;
  const scaleMultiplier = Math.max(0.05, options.scale || 1.0);

  // Effective thickness based on strokeWidth of target
  const effectiveStrokeWidth = Math.max(1, targetElement.strokeWidth) * scaleMultiplier;
  const transverseScale = effectiveStrokeWidth / Math.max(1, bbox.height);

  const deformedElements: PathElement[] = [];

  // ==========================================
  // TYPE 1: ART BRUSH (Stretches along path)
  // ==========================================
  if (brush.type === 'art') {
    brush.elements.forEach((brushEl, elIdx) => {
      const transformedNodes = deformPathElementAlongStroke(
        brushEl,
        bbox,
        samples,
        totalLength,
        options,
        transverseScale
      );

      if (transformedNodes.length === 0) return;

      // Color handling (Tints vs Original)
      let finalFill = brushEl.fill;
      let finalStroke = brushEl.stroke;

      if (options.colorMode === 'tints') {
        if (brushEl.fill !== 'none') {
          finalFill = targetElement.stroke;
        }
        if (brushEl.stroke !== 'none') {
          finalStroke = targetElement.stroke;
        }
      }

      deformedElements.push({
        id: `brush-deform-${targetElement.id}-${elIdx}-${Math.random().toString(36).substr(2, 6)}`,
        name: `${targetElement.name} (${brush.name})`,
        type: 'path',
        nodes: transformedNodes,
        closed: brushEl.closed,
        fill: finalFill,
        fillOpacity: brushEl.fillOpacity ?? 1,
        stroke: finalStroke,
        strokeWidth: Math.max(0.5, brushEl.strokeWidth * transverseScale),
        visible: targetElement.visible,
        locked: targetElement.locked,
      });
    });

    return deformedElements;
  }

  // ==========================================
  // TYPE 2: PATTERN / SCATTER BRUSH (Repeats along path)
  // ==========================================
  const spacingMultiplier = Math.max(0.2, options.spacing || 1.0);
  const patternInstanceWidth = bbox.width * transverseScale;
  const stepDist = Math.max(4, patternInstanceWidth * spacingMultiplier);
  const repeatCount = Math.max(1, Math.round(totalLength / stepDist));
  const actualStep = totalLength / repeatCount;

  for (let rep = 0; rep < repeatCount; rep++) {
    // Center of this repetition
    const centerDist = (rep + 0.5) * actualStep;
    const frame = interpolatePathAtDistance(samples, totalLength, centerDist);

    // Tangent angle in radians
    let angle = Math.atan2(frame.tangent.y, frame.tangent.x);
    if (isRightToLeft) angle += Math.PI;
    if (flipAlong) angle += Math.PI;

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    brush.elements.forEach((brushEl, elIdx) => {
      // Rigid transform of each node: center, scale, rotate, translate to frame.pt
      const transformedNodes: VectorNode[] = brushEl.nodes.map((n) => {
        const transformPt = (p: Point): Point => {
          let dx = (p.x - bbox.centerX) * transverseScale;
          let dy = (p.y - bbox.centerY) * transverseScale;
          if (flipAcross) dy = -dy;

          return {
            x: frame.pt.x + (dx * cosA - dy * sinA),
            y: frame.pt.y + (dx * sinA + dy * cosA),
          };
        };

        const newAnchor = transformPt(n.anchor);
        const newHandleIn = n.handleIn ? transformPt(n.handleIn) : undefined;
        const newHandleOut = n.handleOut ? transformPt(n.handleOut) : undefined;

        return {
          id: `pn-${Math.random().toString(36).substr(2, 9)}`,
          anchor: newAnchor,
          handleIn: newHandleIn,
          handleOut: newHandleOut,
          type: n.type,
        };
      });

      let finalFill = brushEl.fill;
      let finalStroke = brushEl.stroke;

      if (options.colorMode === 'tints') {
        if (brushEl.fill !== 'none') {
          finalFill = targetElement.stroke;
        }
        if (brushEl.stroke !== 'none') {
          finalStroke = targetElement.stroke;
        }
      }

      deformedElements.push({
        id: `brush-pattern-${targetElement.id}-${rep}-${elIdx}`,
        name: `${targetElement.name} (${brush.name} #${rep + 1})`,
        type: 'path',
        nodes: transformedNodes,
        closed: brushEl.closed,
        fill: finalFill,
        fillOpacity: brushEl.fillOpacity ?? 1,
        stroke: finalStroke,
        strokeWidth: Math.max(0.5, brushEl.strokeWidth * transverseScale),
        visible: targetElement.visible,
        locked: targetElement.locked,
      });
    });
  }

  return deformedElements;
}

/**
 * Creates a new BrushDefinition from selected Canvas elements.
 * Normalizes coordinates around origin so it can be reliably stamped or stretched.
 */
export function createBrushFromSelection(
  elements: PathElement[],
  name: string,
  type: BrushType,
  options: Partial<BrushOptions> = {}
): BrushDefinition {
  const bbox = computeBrushBoundingBox(elements);

  // Normalize elements relative to bounding box center
  const normalizedElements: PathElement[] = elements.map((el) => {
    return {
      ...el,
      id: `b-el-${Math.random().toString(36).substr(2, 9)}`,
      nodes: el.nodes.map((n) => ({
        ...n,
        id: `b-node-${Math.random().toString(36).substr(2, 9)}`,
        anchor: { x: n.anchor.x - bbox.minX, y: n.anchor.y - bbox.centerY },
        handleIn: n.handleIn
          ? { x: n.handleIn.x - bbox.minX, y: n.handleIn.y - bbox.centerY }
          : undefined,
        handleOut: n.handleOut
          ? { x: n.handleOut.x - bbox.minX, y: n.handleOut.y - bbox.centerY }
          : undefined,
      })),
    };
  });

  const fullOptions: BrushOptions = {
    direction: 'left-to-right',
    stretchMode: 'stretch-to-fit',
    spacing: 1.0,
    flipAcross: false,
    flipAlong: false,
    colorMode: 'tints',
    scale: 1.0,
    ...options,
  };

  const brushDef: BrushDefinition = {
    id: `brush-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    name: name.trim() || 'Custom Brush',
    type,
    elements: normalizedElements,
    options: fullOptions,
    isDefault: false,
    createdAt: Date.now(),
  };

  return brushDef;
}

/**
 * Generates an SVG string preview of a brush bending along an elegant sample S-curve.
 * Used for Illustrator-style thumbnails in brush palettes.
 */
export function generateBrushPreviewSvg(
  brush: BrushDefinition,
  svgWidth = 140,
  svgHeight = 36,
  strokeColor = '#2563eb'
): string {
  // Sample S-curve path
  const sampleStroke: PathElement = {
    id: 'sample-preview-path',
    name: 'Sample',
    type: 'path',
    nodes: [
      {
        id: 'sp1',
        anchor: { x: 12, y: svgHeight * 0.7 },
        handleOut: { x: svgWidth * 0.35, y: svgHeight * 0.1 },
        type: 'smooth',
      },
      {
        id: 'sp2',
        anchor: { x: svgWidth - 12, y: svgHeight * 0.3 },
        handleIn: { x: svgWidth * 0.65, y: svgHeight * 0.9 },
        type: 'smooth',
      },
    ],
    closed: false,
    fill: 'none',
    fillOpacity: 1,
    stroke: strokeColor,
    strokeWidth: 4,
    visible: true,
    locked: false,
  };

  const deformed = applyBrushToStroke(sampleStroke, brush);

  let pathsSvg = '';
  deformed.forEach((el) => {
    let d = `M ${el.nodes[0].anchor.x.toFixed(1)} ${el.nodes[0].anchor.y.toFixed(1)}`;
    for (let i = 1; i < el.nodes.length; i++) {
      d += ` L ${el.nodes[i].anchor.x.toFixed(1)} ${el.nodes[i].anchor.y.toFixed(1)}`;
    }
    if (el.closed) {
      d += ' Z';
    }

    const fillAttr = el.fill === 'none' ? 'none' : el.fill;
    const strokeAttr = el.stroke === 'none' ? 'none' : el.stroke;
    pathsSvg += `<path d="${d}" fill="${fillAttr}" stroke="${strokeAttr}" stroke-width="${el.strokeWidth.toFixed(1)}" />`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" class="w-full h-full">${pathsSvg}</svg>`;
}

/**
 * Built-in Illustrator-quality Default Brushes
 */
export const DEFAULT_BRUSHES: BrushDefinition[] = [
  // 1. Quad Stroke Ribbon (4 Parallel Rectangles / Stripes)
  {
    id: 'brush-4-stripes-ribbon',
    name: '4-Stripe Ribbon (Quad Stroke)',
    type: 'art',
    elements: [
      {
        id: 'b-s1',
        name: 'Stripe 1',
        type: 'rect',
        nodes: [
          { id: 's1-n1', anchor: { x: 0, y: -12 }, type: 'corner' },
          { id: 's1-n2', anchor: { x: 100, y: -12 }, type: 'corner' },
          { id: 's1-n3', anchor: { x: 100, y: -7 }, type: 'corner' },
          { id: 's1-n4', anchor: { x: 0, y: -7 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'b-s2',
        name: 'Stripe 2',
        type: 'rect',
        nodes: [
          { id: 's2-n1', anchor: { x: 0, y: -4.5 }, type: 'corner' },
          { id: 's2-n2', anchor: { x: 100, y: -4.5 }, type: 'corner' },
          { id: 's2-n3', anchor: { x: 100, y: -0.5 }, type: 'corner' },
          { id: 's2-n4', anchor: { x: 0, y: -0.5 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'b-s3',
        name: 'Stripe 3',
        type: 'rect',
        nodes: [
          { id: 's3-n1', anchor: { x: 0, y: 0.5 }, type: 'corner' },
          { id: 's3-n2', anchor: { x: 100, y: 0.5 }, type: 'corner' },
          { id: 's3-n3', anchor: { x: 100, y: 4.5 }, type: 'corner' },
          { id: 's3-n4', anchor: { x: 0, y: 4.5 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'b-s4',
        name: 'Stripe 4',
        type: 'rect',
        nodes: [
          { id: 's4-n1', anchor: { x: 0, y: 7 }, type: 'corner' },
          { id: 's4-n2', anchor: { x: 100, y: 7 }, type: 'corner' },
          { id: 's4-n3', anchor: { x: 100, y: 12 }, type: 'corner' },
          { id: 's4-n4', anchor: { x: 0, y: 12 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      stretchMode: 'stretch-to-fit',
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 2. Tapered Calligraphic Oval (Classic Art Brush)
  {
    id: 'brush-tapered-oval',
    name: 'Tapered Oval Stroke',
    type: 'art',
    elements: [
      {
        id: 'b-taper-el',
        name: 'Tapered Shape',
        type: 'path',
        nodes: [
          { id: 'tn1', anchor: { x: 0, y: 0 }, type: 'corner' },
          {
            id: 'tn2',
            anchor: { x: 50, y: -7 },
            handleIn: { x: 25, y: -7 },
            handleOut: { x: 75, y: -7 },
            type: 'smooth',
          },
          { id: 'tn3', anchor: { x: 100, y: 0 }, type: 'corner' },
          {
            id: 'tn4',
            anchor: { x: 50, y: 7 },
            handleIn: { x: 75, y: 7 },
            handleOut: { x: 25, y: 7 },
            type: 'smooth',
          },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      stretchMode: 'stretch-to-fit',
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 3. Chisel Calligraphy Nib (Art Brush)
  {
    id: 'brush-chisel-nib',
    name: 'Chisel Calligraphy Pen',
    type: 'art',
    elements: [
      {
        id: 'b-chisel-el',
        name: 'Chisel Ribbon',
        type: 'path',
        nodes: [
          { id: 'cn1', anchor: { x: 0, y: -6 }, type: 'corner' },
          { id: 'cn2', anchor: { x: 100, y: -9 }, type: 'corner' },
          { id: 'cn3', anchor: { x: 100, y: 3 }, type: 'corner' },
          { id: 'cn4', anchor: { x: 0, y: 6 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      stretchMode: 'stretch-to-fit',
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 4. Arrowhead Pointer (Art Brush)
  {
    id: 'brush-arrowhead-pointer',
    name: 'Directional Arrow',
    type: 'art',
    elements: [
      {
        id: 'b-arrow-el',
        name: 'Arrow',
        type: 'path',
        nodes: [
          { id: 'an1', anchor: { x: 0, y: -2.5 }, type: 'corner' },
          { id: 'an2', anchor: { x: 80, y: -2.5 }, type: 'corner' },
          { id: 'an3', anchor: { x: 80, y: -8 }, type: 'corner' },
          { id: 'an4', anchor: { x: 100, y: 0 }, type: 'corner' },
          { id: 'an5', anchor: { x: 80, y: 8 }, type: 'corner' },
          { id: 'an6', anchor: { x: 80, y: 2.5 }, type: 'corner' },
          { id: 'an7', anchor: { x: 0, y: 2.5 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      stretchMode: 'stretch-to-fit',
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 5. Teardrop Flourish (Art Brush)
  {
    id: 'brush-teardrop-flourish',
    name: 'Teardrop Taper Flourish',
    type: 'art',
    elements: [
      {
        id: 'b-teardrop-el',
        name: 'Teardrop Wave',
        type: 'path',
        nodes: [
          { id: 'td1', anchor: { x: 0, y: 0 }, type: 'corner' },
          {
            id: 'td2',
            anchor: { x: 75, y: -10 },
            handleIn: { x: 40, y: -4 },
            handleOut: { x: 92, y: -10 },
            type: 'smooth',
          },
          {
            id: 'td3',
            anchor: { x: 100, y: 0 },
            handleIn: { x: 100, y: -5 },
            handleOut: { x: 100, y: 5 },
            type: 'smooth',
          },
          {
            id: 'td4',
            anchor: { x: 75, y: 10 },
            handleIn: { x: 92, y: 10 },
            handleOut: { x: 40, y: 4 },
            type: 'smooth',
          },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      stretchMode: 'stretch-to-fit',
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 6. Arrow Chevrons (Pattern Brush)
  {
    id: 'brush-pattern-chevrons',
    name: 'Arrow Chevrons Chain',
    type: 'pattern',
    elements: [
      {
        id: 'b-chev-el',
        name: 'Chevron',
        type: 'path',
        nodes: [
          { id: 'cv1', anchor: { x: -8, y: -8 }, type: 'corner' },
          { id: 'cv2', anchor: { x: 2, y: 0 }, type: 'corner' },
          { id: 'cv3', anchor: { x: -8, y: 8 }, type: 'corner' },
          { id: 'cv4', anchor: { x: -3, y: 8 }, type: 'corner' },
          { id: 'cv5', anchor: { x: 8, y: 0 }, type: 'corner' },
          { id: 'cv6', anchor: { x: -3, y: -8 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      spacing: 1.2,
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 7. Pearl Beads / Dots (Pattern Brush)
  {
    id: 'brush-pattern-beads',
    name: 'Pearl Beads / Circles',
    type: 'pattern',
    elements: [
      {
        id: 'b-bead-el',
        name: 'Bead',
        type: 'path',
        nodes: [
          {
            id: 'bd1',
            anchor: { x: 0, y: -6 },
            handleIn: { x: -3.3, y: -6 },
            handleOut: { x: 3.3, y: -6 },
            type: 'smooth',
          },
          {
            id: 'bd2',
            anchor: { x: 6, y: 0 },
            handleIn: { x: 6, y: -3.3 },
            handleOut: { x: 6, y: 3.3 },
            type: 'smooth',
          },
          {
            id: 'bd3',
            anchor: { x: 0, y: 6 },
            handleIn: { x: 3.3, y: 6 },
            handleOut: { x: -3.3, y: 6 },
            type: 'smooth',
          },
          {
            id: 'bd4',
            anchor: { x: -6, y: 0 },
            handleIn: { x: -6, y: 3.3 },
            handleOut: { x: -6, y: -3.3 },
            type: 'smooth',
          },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      spacing: 1.5,
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 8. Botanical Foliage Leaf (Pattern Brush)
  {
    id: 'brush-pattern-leaves',
    name: 'Botanical Leaves Sprig',
    type: 'pattern',
    elements: [
      {
        id: 'b-leaf-el-1',
        name: 'Leaf Left',
        type: 'path',
        nodes: [
          { id: 'lf1', anchor: { x: -6, y: 0 }, type: 'corner' },
          { id: 'lf2', anchor: { x: 0, y: -9 }, handleIn: { x: -4, y: -6 }, handleOut: { x: 3, y: -8 }, type: 'smooth' },
          { id: 'lf3', anchor: { x: 6, y: -2 }, type: 'corner' },
          { id: 'lf4', anchor: { x: 0, y: -1 }, handleIn: { x: 4, y: -1 }, handleOut: { x: -2, y: -1 }, type: 'smooth' },
        ],
        closed: true,
        fill: '#15803d',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
      {
        id: 'b-leaf-el-2',
        name: 'Leaf Right',
        type: 'path',
        nodes: [
          { id: 'rf1', anchor: { x: -2, y: 0 }, type: 'corner' },
          { id: 'rf2', anchor: { x: 4, y: 9 }, handleIn: { x: 0, y: 6 }, handleOut: { x: 7, y: 8 }, type: 'smooth' },
          { id: 'rf3', anchor: { x: 10, y: 2 }, type: 'corner' },
          { id: 'rf4', anchor: { x: 4, y: 1 }, handleIn: { x: 8, y: 1 }, handleOut: { x: 2, y: 1 }, type: 'smooth' },
        ],
        closed: true,
        fill: '#15803d',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      spacing: 1.4,
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 9. Diamond Stitch (Pattern Brush)
  {
    id: 'brush-pattern-diamond',
    name: 'Diamond Stitch Chain',
    type: 'pattern',
    elements: [
      {
        id: 'b-dia-el',
        name: 'Diamond',
        type: 'path',
        nodes: [
          { id: 'dm1', anchor: { x: -6, y: 0 }, type: 'corner' },
          { id: 'dm2', anchor: { x: 0, y: -6 }, type: 'corner' },
          { id: 'dm3', anchor: { x: 6, y: 0 }, type: 'corner' },
          { id: 'dm4', anchor: { x: 0, y: 6 }, type: 'corner' },
        ],
        closed: true,
        fill: '#111827',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      spacing: 1.3,
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },

  // 10. Starlight Sparkle (Pattern Brush)
  {
    id: 'brush-pattern-star',
    name: 'Sparkle Star Trail',
    type: 'pattern',
    elements: [
      {
        id: 'b-star-el',
        name: 'Star',
        type: 'path',
        nodes: [
          { id: 'st1', anchor: { x: 0, y: -8 }, type: 'corner' },
          { id: 'st2', anchor: { x: 2, y: -2 }, type: 'corner' },
          { id: 'st3', anchor: { x: 8, y: 0 }, type: 'corner' },
          { id: 'st4', anchor: { x: 2, y: 2 }, type: 'corner' },
          { id: 'st5', anchor: { x: 0, y: 8 }, type: 'corner' },
          { id: 'st6', anchor: { x: -2, y: 2 }, type: 'corner' },
          { id: 'st7', anchor: { x: -8, y: 0 }, type: 'corner' },
          { id: 'st8', anchor: { x: -2, y: -2 }, type: 'corner' },
        ],
        closed: true,
        fill: '#eab308',
        fillOpacity: 1,
        stroke: 'none',
        strokeWidth: 1,
        visible: true,
        locked: false,
      },
    ],
    options: {
      direction: 'left-to-right',
      spacing: 1.6,
      flipAcross: false,
      flipAlong: false,
      colorMode: 'tints',
      scale: 1.0,
    },
    isDefault: true,
  },
];
