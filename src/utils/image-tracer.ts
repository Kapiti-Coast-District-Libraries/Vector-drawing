import { Point, VectorNode, PathElement } from '../types';
import { pointsToVectorNodes } from './stroke-to-path';

interface Segment {
  p1: Point;
  p2: Point;
}

/**
 * Linear interpolation fraction between two intensity values.
 */
function getLerpOffset(valA: number, valB: number, t: number): number {
  if (Math.abs(valA - valB) < 0.001) return 0.5;
  const fraction = (t - valA) / (valB - valA);
  return Math.max(0.01, Math.min(0.99, fraction));
}

/**
 * Chaikin's corner-cutting subdivision for quadratic B-spline curves.
 */
export function chaikinSubdivide(path: Point[], iterations: number = 2): Point[] {
  if (path.length <= 2) return path;

  let current = [...path];
  const isClosed = path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y;

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = [];
    const len = current.length;

    if (isClosed) {
      const cycleLen = len - 1;
      for (let i = 0; i < cycleLen; i++) {
        const pA = current[i];
        const pB = current[(i + 1) % cycleLen];

        next.push({
          x: 0.75 * pA.x + 0.25 * pB.x,
          y: 0.75 * pA.y + 0.25 * pB.y,
        });
        next.push({
          x: 0.25 * pA.x + 0.75 * pB.x,
          y: 0.25 * pA.y + 0.75 * pB.y,
        });
      }
      if (next.length > 0) {
        next.push({ ...next[0] });
      }
    } else {
      next.push({ ...current[0] });
      for (let i = 0; i < len - 1; i++) {
        const pA = current[i];
        const pB = current[i + 1];

        const q = {
          x: 0.75 * pA.x + 0.25 * pB.x,
          y: 0.75 * pA.y + 0.25 * pB.y,
        };
        const r = {
          x: 0.25 * pA.x + 0.75 * pB.x,
          y: 0.25 * pA.y + 0.75 * pB.y,
        };

        if (i === 0) {
          next.push(r);
        } else if (i === len - 2) {
          next.push(q);
        } else {
          next.push(q);
          next.push(r);
        }
      }
      next.push({ ...current[len - 1] });
    }
    current = next;
  }
  return current;
}

/**
 * Binomial low-pass filter (1-2-1 weighted moving average).
 */
export function smoothPathCoordinates(path: Point[], iterations: number = 3): Point[] {
  if (path.length <= 2) return path;

  const isClosed = path[0].x === path[path.length - 1].x && path[0].y === path[path.length - 1].y;
  let current = [...path];

  for (let iter = 0; iter < iterations; iter++) {
    const next: Point[] = [];
    const len = current.length;

    for (let i = 0; i < len; i++) {
      if (isClosed) {
        const nCycle = len - 1;
        const idx = i === len - 1 ? 0 : i;

        const prevIdx = (idx - 1 + nCycle) % nCycle;
        const nextIdx = (idx + 1) % nCycle;

        const prevPt = current[prevIdx];
        const currPt = current[idx];
        const nextPt = current[nextIdx];

        next.push({
          x: 0.25 * prevPt.x + 0.5 * currPt.x + 0.25 * nextPt.x,
          y: 0.25 * prevPt.y + 0.5 * currPt.y + 0.25 * nextPt.y,
        });
      } else {
        if (i === 0 || i === len - 1) {
          next.push({ ...current[i] });
        } else {
          const prevPt = current[i - 1];
          const currPt = current[i];
          const nextPt = current[i + 1];

          next.push({
            x: 0.25 * prevPt.x + 0.5 * currPt.x + 0.25 * nextPt.x,
            y: 0.25 * prevPt.y + 0.5 * currPt.y + 0.25 * nextPt.y,
          });
        }
      }
    }

    if (isClosed && next.length > 0) {
      next[next.length - 1] = { ...next[0] };
    }
    current = next;
  }

  return current;
}

function perpendicularDistance(p: Point, p1: Point, p2: Point): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (dx === 0 && dy === 0) {
    return Math.sqrt((p.x - p1.x) ** 2 + (p.y - p1.y) ** 2);
  }
  const num = Math.abs(dy * p.x - dx * p.y + p2.x * p1.y - p2.y * p1.x);
  const den = Math.sqrt(dx * dx + dy * dy);
  return num / den;
}

/**
 * Standard Ramer-Douglas-Peucker polygon simplification (iterative/stack-safe).
 */
export function ramerDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  // Use stack-based recursion to prevent call-stack limits on high-resolution curves
  const stack: [number, number][] = [[0, points.length - 1]];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    if (end <= start + 1) continue;

    let dmax = 0;
    let index = start;

    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > dmax) {
        index = i;
        dmax = d;
      }
    }

    if (dmax > epsilon) {
      keep[index] = 1;
      stack.push([start, index]);
      stack.push([index, end]);
    }
  }

  const result: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) result.push(points[i]);
  }
  return result;
}

/**
 * Fast O(N) stitching of disjoint segments into continuous polylines.
 */
function stitchSegments(segments: Segment[]): Point[][] {
  const getHash = (pt: Point) => {
    const hx = Math.round(pt.x * 2);
    const hy = Math.round(pt.y * 2);
    return `${hx},${hy}`;
  };

  const validSegments = segments.filter(seg => getHash(seg.p1) !== getHash(seg.p2));
  const adj = new Map<string, Segment[]>();

  for (const seg of validSegments) {
    const h1 = getHash(seg.p1);
    const h2 = getHash(seg.p2);

    if (!adj.has(h1)) adj.set(h1, []);
    if (!adj.has(h2)) adj.set(h2, []);

    adj.get(h1)!.push(seg);
    adj.get(h2)!.push(seg);
  }

  const visited = new Set<Segment>();
  const paths: Point[][] = [];

  for (const startSeg of validSegments) {
    if (visited.has(startSeg)) continue;

    visited.add(startSeg);
    const path: Point[] = [startSeg.p1, startSeg.p2];

    // Extend forward
    let currentPt = startSeg.p2;
    let done = false;
    while (!done) {
      const hash = getHash(currentPt);
      const candidates = adj.get(hash) || [];
      let found = false;
      for (const seg of candidates) {
        if (!visited.has(seg)) {
          visited.add(seg);
          const nextPt = getHash(seg.p1) === hash ? seg.p2 : seg.p1;
          path.push(nextPt);
          currentPt = nextPt;
          found = true;
          break;
        }
      }
      if (!found) done = true;
    }

    // Extend backward
    currentPt = path[0];
    done = false;
    while (!done) {
      const hash = getHash(currentPt);
      const candidates = adj.get(hash) || [];
      let found = false;
      for (const seg of candidates) {
        if (!visited.has(seg)) {
          visited.add(seg);
          const nextPt = getHash(seg.p1) === hash ? seg.p2 : seg.p1;
          path.unshift(nextPt);
          currentPt = nextPt;
          found = true;
          break;
        }
      }
      if (!found) done = true;
    }

    if (path.length > 2) {
      const startHash = getHash(path[0]);
      const endHash = getHash(path[path.length - 1]);
      if (startHash === endHash) {
        path[path.length - 1] = { ...path[0] };
      }
      paths.push(path);
    }
  }

  return paths;
}

/**
 * Main trace function.
 * @param imgData ImageData from a Canvas 2D context
 * @param threshold Brightness cutoff (0-255, default ~128)
 * @param invert Invert black/white polarity
 * @param smoothEpsilon Smoothing intensity (0 to 2.5, default ~1.0)
 */
export function traceImage(
  imgData: ImageData,
  threshold: number = 128,
  invert: boolean = false,
  smoothEpsilon: number = 1.0
): Point[][] {
  const { width, height, data } = imgData;

  const isActive = (g: number): boolean => {
    return invert ? (g >= threshold) : (g < threshold);
  };

  // 1. Build continuous intensity map
  const intensity = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];

    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    if (a < 30) {
      gray = 255; // Transparent pixels map to white background
    }
    intensity[i] = gray;
  }

  const getIntensity = (cx: number, cy: number): number => {
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) {
      return 255;
    }
    return intensity[cy * width + cx];
  };

  const segments: Segment[] = [];
  const clampX = (val: number) => Math.max(0, Math.min(width - 1, val));
  const clampY = (val: number) => Math.max(0, Math.min(height - 1, val));

  // 2. Marching Squares with sub-pixel interpolation
  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const g0 = getIntensity(x, y);
      const g1 = getIntensity(x + 1, y);
      const g2 = getIntensity(x + 1, y + 1);
      const g3 = getIntensity(x, y + 1);

      const v0 = isActive(g0) ? 1 : 0;
      const v1 = isActive(g1) ? 1 : 0;
      const v2 = isActive(g2) ? 1 : 0;
      const v3 = isActive(g3) ? 1 : 0;

      const index = (v0 << 3) | (v1 << 2) | (v2 << 1) | v3;

      // Sub-pixel continuous edge locations via Lerp
      const t = { x: clampX(x + getLerpOffset(g0, g1, threshold)), y: clampY(y) };
      const r = { x: clampX(x + 1), y: clampY(y + getLerpOffset(g1, g2, threshold)) };
      const b = { x: clampX(x + getLerpOffset(g3, g2, threshold)), y: clampY(y + 1) };
      const l = { x: clampX(x), y: clampY(y + getLerpOffset(g0, g3, threshold)) };

      switch (index) {
        case 1:  segments.push({ p1: l, p2: b }); break;
        case 2:  segments.push({ p1: b, p2: r }); break;
        case 3:  segments.push({ p1: l, p2: r }); break;
        case 4:  segments.push({ p1: t, p2: r }); break;
        case 5:
          segments.push({ p1: l, p2: t });
          segments.push({ p1: b, p2: r });
          break;
        case 6:  segments.push({ p1: t, p2: b }); break;
        case 7:  segments.push({ p1: l, p2: t }); break;
        case 8:  segments.push({ p1: l, p2: t }); break;
        case 9:  segments.push({ p1: t, p2: b }); break;
        case 10:
          segments.push({ p1: l, p2: b });
          segments.push({ p1: t, p2: r });
          break;
        case 11: segments.push({ p1: t, p2: r }); break;
        case 12: segments.push({ p1: l, p2: r }); break;
        case 13: segments.push({ p1: b, p2: r }); break;
        case 14: segments.push({ p1: l, p2: b }); break;
        default: break;
      }
    }
  }

  // 3. Stitch segments into polylines
  const rawPaths = stitchSegments(segments);

  // 4. 4-Stage Smoothing & Simplification
  if (smoothEpsilon <= 0) return rawPaths;

  // Pass A: Pre-simplification (removes sub-pixel wobble)
  let processed = rawPaths.map(path => ramerDouglasPeucker(path, 0.25));

  // Pass B: Chaikin B-spline corner subdivision
  const chaikinIterations = Math.min(3, Math.max(1, Math.round(smoothEpsilon * 1.5)));
  processed = processed.map(path => chaikinSubdivide(path, chaikinIterations));

  // Pass C: Binomial moving average smoothing
  processed = processed.map(path => smoothPathCoordinates(path, 2));

  // Pass D: Collinear decimation
  processed = processed.map(path => ramerDouglasPeucker(path, smoothEpsilon * 0.15));

  return processed;
}

export interface TraceOptions {
  threshold?: number;        // 0-255, default 128
  invert?: boolean;          // invert black/white
  smoothEpsilon?: number;    // 0 to 2.5, default 1.0
  minPathLength?: number;    // Minimum number of points to filter specks/dust, default 4
  mode?: 'fills' | 'strokes' | 'both'; // vector presentation
  fillColor?: string;        // fill color for closed shapes
  strokeColor?: string;      // stroke color
  strokeWidth?: number;      // stroke line width
  targetWidth?: number;      // scale result to target width in canvas px
  targetHeight?: number;     // scale result to target height in canvas px
  offsetX?: number;          // canvas X placement
  offsetY?: number;          // canvas Y placement
  rotationDeg?: number;      // canvas rotation
}

/**
 * Loads an HTMLImageElement or URL or Blob into an offscreen canvas and extracts ImageData.
 */
export async function getImageDataFromSource(
  source: string | HTMLImageElement | File | Blob,
  maxDimension = 1000
): Promise<{ imgData: ImageData; originalWidth: number; originalHeight: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const origW = img.naturalWidth || img.width;
      const origH = img.naturalHeight || img.height;

      let drawW = origW;
      let drawH = origH;
      if (drawW > maxDimension || drawH > maxDimension) {
        if (drawW >= drawH) {
          drawH = Math.round((drawH * maxDimension) / drawW);
          drawW = maxDimension;
        } else {
          drawW = Math.round((drawW * maxDimension) / drawH);
          drawH = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = drawW;
      canvas.height = drawH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0, drawW, drawH);
      const imgData = ctx.getImageData(0, 0, drawW, drawH);
      resolve({ imgData, originalWidth: origW, originalHeight: origH });
    };

    img.onerror = (e) => reject(new Error('Failed to load image for tracing: ' + e));

    if (typeof source === 'string') {
      img.src = source;
    } else if (source instanceof HTMLImageElement) {
      img.src = source.src;
    } else {
      const url = URL.createObjectURL(source);
      img.src = url;
    }
  });
}

/**
 * Traces an image and returns vector PathElement objects ready to be placed on layers.
 */
export async function vectorizeImage(
  source: string | HTMLImageElement | File | Blob,
  options: TraceOptions = {}
): Promise<{
  elements: PathElement[];
  rawPolylines: Point[][];
  previewDataUrl: string;
  sourceDimensions: { width: number; height: number };
  durationMs: number;
}> {
  const startTime = performance.now();
  const {
    threshold = 128,
    invert = false,
    smoothEpsilon = 1.0,
    minPathLength = 4,
    mode = 'both',
    fillColor = '#111827',
    strokeColor = '#2563eb',
    strokeWidth = 1.5,
    targetWidth,
    targetHeight,
    offsetX = 100,
    offsetY = 100,
    rotationDeg = 0,
  } = options;

  const { imgData, originalWidth, originalHeight } = await getImageDataFromSource(source, 1000);
  const tracedPolylines = traceImage(imgData, threshold, invert, smoothEpsilon);

  // Compute scale factors
  const sampleW = imgData.width;
  const sampleH = imgData.height;
  const finalW = targetWidth || 500;
  const finalH = targetHeight || (originalHeight * (finalW / (originalWidth || 1)));

  const scaleX = finalW / sampleW;
  const scaleY = finalH / sampleH;
  const rotRad = (rotationDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const filteredPaths = tracedPolylines.filter(p => p.length >= minPathLength);

  const elements: PathElement[] = filteredPaths.map((poly, idx) => {
    // Transform coordinates from sample pixel space to artboard canvas space
    const canvasPoints: Point[] = poly.map(pt => {
      const localX = pt.x * scaleX;
      const localY = pt.y * scaleY;

      // Apply rotation around top-left origin + offset
      const rx = localX * cosR - localY * sinR;
      const ry = localX * sinR + localY * cosR;

      return {
        x: offsetX + rx,
        y: offsetY + ry,
      };
    });

    const isClosed =
      poly.length > 2 &&
      Math.hypot(poly[0].x - poly[poly.length - 1].x, poly[0].y - poly[poly.length - 1].y) < 3;

    const nodes = pointsToVectorNodes(canvasPoints, isClosed);

    return {
      id: `traced-path-${Math.random().toString(36).substr(2, 9)}`,
      name: `Trace Contour ${idx + 1}`,
      type: 'path',
      nodes,
      closed: isClosed,
      fill: mode === 'strokes' ? 'none' : (isClosed ? (fillColor || '#111827') : 'none'),
      fillOpacity: mode === 'strokes' ? 0 : 1,
      stroke: mode === 'fills' ? 'none' : strokeColor,
      strokeWidth: mode === 'fills' ? 0 : strokeWidth,
      visible: true,
      locked: false,
    };
  });

  // Generate lightweight preview data URL
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = 240;
  previewCanvas.height = Math.round(240 * (sampleH / sampleW));
  const pCtx = previewCanvas.getContext('2d');
  let previewDataUrl = '';
  if (pCtx) {
    pCtx.fillStyle = '#ffffff';
    pCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
    const pScale = previewCanvas.width / sampleW;

    pCtx.strokeStyle = '#2563eb';
    pCtx.fillStyle = '#111827';
    pCtx.lineWidth = 1.2;

    for (const poly of filteredPaths) {
      if (poly.length < 2) continue;
      pCtx.beginPath();
      pCtx.moveTo(poly[0].x * pScale, poly[0].y * pScale);
      for (let i = 1; i < poly.length; i++) {
        pCtx.lineTo(poly[i].x * pScale, poly[i].y * pScale);
      }
      if (mode !== 'strokes') {
        pCtx.fill('evenodd');
      }
      if (mode !== 'fills') {
        pCtx.stroke();
      }
    }
    previewDataUrl = previewCanvas.toDataURL('image/png');
  }

  const durationMs = Math.round(performance.now() - startTime);

  return {
    elements,
    rawPolylines: filteredPaths,
    previewDataUrl,
    sourceDimensions: { width: originalWidth, height: originalHeight },
    durationMs,
  };
}
