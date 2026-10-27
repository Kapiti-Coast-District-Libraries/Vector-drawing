import * as opentype from 'opentype.js';
import clipper from 'polygon-clipping';
import { PathElement, VectorNode, Point } from '../types';

export interface FontItem {
  id: string;
  family: string;
  fullName?: string;
  postscriptName?: string;
  category: 'local-api' | 'file-upload' | 'google-font' | 'system';
  style?: string;
  blob?: any;
  ttfUrl?: string;
  isLoaded?: boolean;
}

// Global in-memory cache of parsed opentype font objects
const opentypeCache = new Map<string, opentype.Font>();

// Curated fonts with direct mathematical TTF vectors available immediately
export const INITIAL_FONTS: FontItem[] = [
  // Curated Popular Fonts (High-precision TrueType vectors from Fontsource)
  {
    id: 'gf-inter',
    family: 'Inter',
    fullName: 'Inter Regular',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-roboto',
    family: 'Roboto',
    fullName: 'Roboto Regular',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-montserrat',
    family: 'Montserrat',
    fullName: 'Montserrat Regular',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/montserrat@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-bebas',
    family: 'Bebas Neue',
    fullName: 'Bebas Neue',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-pacifico',
    family: 'Pacifico',
    fullName: 'Pacifico Cursive',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/pacifico@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-playfair',
    family: 'Playfair Display',
    fullName: 'Playfair Display Serif',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/playfair-display@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-oswald',
    family: 'Oswald',
    fullName: 'Oswald Sans',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/oswald@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-caveat',
    family: 'Caveat',
    fullName: 'Caveat Handwriting',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-firacode',
    family: 'Fira Code',
    fullName: 'Fira Code Monospace',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/fira-code@latest/latin-400-normal.ttf'
  },
  {
    id: 'gf-lobster',
    family: 'Lobster',
    fullName: 'Lobster Script',
    category: 'google-font',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/lobster@latest/latin-400-normal.ttf'
  },

  // Standard Computer & System Fonts
  {
    id: 'sys-arial',
    family: 'Arial',
    fullName: 'Arial Sans',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/arimo@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-helvetica',
    family: 'Helvetica',
    fullName: 'Helvetica Sans',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-times',
    family: 'Times New Roman',
    fullName: 'Times New Roman Serif',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/tinos@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-georgia',
    family: 'Georgia',
    fullName: 'Georgia Serif',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/gelasio@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-impact',
    family: 'Impact',
    fullName: 'Impact Headline',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/anton@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-courier',
    family: 'Courier New',
    fullName: 'Courier New Mono',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/cousine@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-verdana',
    family: 'Verdana',
    fullName: 'Verdana Sans',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-trebuchet',
    family: 'Trebuchet MS',
    fullName: 'Trebuchet MS',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf'
  },
  {
    id: 'sys-comic',
    family: 'Comic Sans MS',
    fullName: 'Comic Sans MS',
    category: 'system',
    ttfUrl: 'https://cdn.jsdelivr.net/fontsource/fonts/caveat@latest/latin-400-normal.ttf'
  }
];

/**
 * Checks if the browser supports the Local Font Access API (window.queryLocalFonts)
 */
export function isLocalFontAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'queryLocalFonts' in window;
}

/**
 * Queries the user's computer for locally installed system fonts using Local Font Access API.
 * Prompts user with native browser permission dialog.
 */
export async function queryLocalComputerFonts(): Promise<FontItem[]> {
  if (!isLocalFontAccessSupported()) {
    throw new Error('Local Font Access API is not supported in this browser. You can still load any font file directly from your computer (.ttf, .otf, .woff)!');
  }

  try {
    const rawFonts = await (window as any).queryLocalFonts();
    const seenFamilies = new Set<string>();
    const localFonts: FontItem[] = [];

    for (const f of rawFonts) {
      const family = f.family || f.fullName;
      if (!family || seenFamilies.has(family)) continue;
      seenFamilies.add(family);

      localFonts.push({
        id: `local-${family.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        family: family,
        fullName: f.fullName || family,
        postscriptName: f.postscriptName,
        style: f.style || 'Regular',
        category: 'local-api',
        blob: f, // FontData object handle with .blob() method
      });
    }

    // Sort alphabetically
    localFonts.sort((a, b) => a.family.localeCompare(b.family));
    return localFonts;
  } catch (err: any) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Font access permission was denied. You can still upload font files (.ttf, .otf) directly from your computer!');
    }
    throw err;
  }
}

/**
 * Loads a font directly from a user's local disk file (.ttf, .otf, .woff).
 * Registers with document.fonts and parses with opentype for vector outlining.
 */
export async function loadFontFromFile(file: File): Promise<FontItem> {
  const buffer = await file.arrayBuffer();
  let parsedFont: opentype.Font;

  try {
    parsedFont = opentype.parse(buffer);
  } catch (err) {
    console.error('Failed to parse font with opentype:', err);
    throw new Error(`Unable to parse "${file.name}". Please ensure it is a valid TTF, OTF, or WOFF font file.`);
  }

  const detectedFamily =
    parsedFont.names.fontFamily?.en ||
    parsedFont.names.fullName?.en ||
    file.name.replace(/\.[^/.]+$/, '');

  // Register font in browser's document.fonts so it renders live on canvas
  try {
    const fontFace = new FontFace(detectedFamily, buffer);
    const loadedFace = await fontFace.load();
    document.fonts.add(loadedFace);
  } catch (err) {
    console.warn('FontFace registration warning:', err);
  }

  // Cache parsed opentype font for vector outlining
  opentypeCache.set(detectedFamily.toLowerCase(), parsedFont);

  const fontItem: FontItem = {
    id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    family: detectedFamily,
    fullName: parsedFont.names.fullName?.en || detectedFamily,
    postscriptName: parsedFont.names.postScriptName?.en,
    style: parsedFont.names.fontSubfamily?.en || 'Regular',
    category: 'file-upload',
    isLoaded: true,
  };

  return fontItem;
}

/**
 * Returns Fontsource slug for standard families
 */
function getFontsourceSlug(family: string): string {
  const norm = family.toLowerCase().trim();
  const map: Record<string, string> = {
    'inter': 'inter',
    'roboto': 'roboto',
    'montserrat': 'montserrat',
    'bebas neue': 'bebas-neue',
    'pacifico': 'pacifico',
    'playfair display': 'playfair-display',
    'oswald': 'oswald',
    'caveat': 'caveat',
    'fira code': 'fira-code',
    'lobster': 'lobster',
    'arial': 'arimo',
    'helvetica': 'inter',
    'times new roman': 'tinos',
    'times': 'tinos',
    'georgia': 'gelasio',
    'impact': 'anton',
    'trebuchet ms': 'roboto',
    'verdana': 'inter',
    'courier new': 'cousine',
    'courier': 'cousine',
    'comic sans ms': 'caveat',
  };
  return map[norm] || norm.replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

/**
 * Retrieve or dynamically load an opentype.Font instance for a given font family
 */
export async function getOrLoadOpentypeFont(fontItem: FontItem): Promise<opentype.Font | null> {
  const cacheKey = fontItem.family.toLowerCase();
  if (opentypeCache.has(cacheKey)) {
    return opentypeCache.get(cacheKey)!;
  }

  // 1. If it came from Local Font Access API, extract arrayBuffer from FontData
  if (fontItem.blob) {
    try {
      const blobObj = typeof fontItem.blob.blob === 'function' ? await fontItem.blob.blob() : fontItem.blob;
      const buffer = await blobObj.arrayBuffer();
      const parsed = opentype.parse(buffer);
      opentypeCache.set(cacheKey, parsed);
      return parsed;
    } catch (e) {
      console.warn(`Could not extract blob for local font ${fontItem.family}:`, e);
    }
  }

  // 2. If it has an explicit direct TTF URL
  if (fontItem.ttfUrl) {
    try {
      const resp = await fetch(fontItem.ttfUrl);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const parsed = opentype.parse(buffer);
        opentypeCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`Could not fetch TTF from ${fontItem.ttfUrl}:`, e);
    }
  }

  // 3. Fallback to Fontsource CDN URL
  const slug = getFontsourceSlug(fontItem.family);
  const fontsourceUrls = [
    `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-400-normal.ttf`,
    `https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf`
  ];

  for (const url of fontsourceUrls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const parsed = opentype.parse(buffer);
        opentypeCache.set(cacheKey, parsed);
        return parsed;
      }
    } catch (e) {
      // Continue to next URL
    }
  }

  return null;
}

/**
 * Converts mathematical OpenType path commands into clean VectorNode[]
 * preserving Bézier tangents, smooth curves, and subpaths for holes (e.g. O, B, e).
 */
export function opentypeCommandsToNodes(commands: any[]): VectorNode[] {
  const nodes: VectorNode[] = [];
  let subpathStartIndex = 0;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    if (cmd.type === 'M') {
      subpathStartIndex = nodes.length;
      nodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x, y: cmd.y },
        type: 'corner',
        subpathStart: true,
      });
    } else if (cmd.type === 'L') {
      nodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x, y: cmd.y },
        type: 'corner',
      });
    } else if (cmd.type === 'C') {
      if (nodes.length > 0) {
        const prev = nodes[nodes.length - 1];
        prev.handleOut = { x: cmd.x1, y: cmd.y1 };
        prev.type = 'smooth';
      }
      nodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x, y: cmd.y },
        handleIn: { x: cmd.x2, y: cmd.y2 },
        type: 'smooth',
      });
    } else if (cmd.type === 'Q') {
      // Convert quadratic Bézier to cubic Bézier for exact curve matching
      if (nodes.length > 0) {
        const prev = nodes[nodes.length - 1];
        const p0 = prev.anchor;
        const p1 = { x: cmd.x1, y: cmd.y1 };
        const p2 = { x: cmd.x, y: cmd.y };

        const cp1 = {
          x: p0.x + (2 / 3) * (p1.x - p0.x),
          y: p0.y + (2 / 3) * (p1.y - p0.y),
        };
        const cp2 = {
          x: p2.x + (2 / 3) * (p1.x - p2.x),
          y: p2.y + (2 / 3) * (p1.y - p2.y),
        };

        prev.handleOut = cp1;
        prev.type = 'smooth';

        nodes.push({
          id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
          anchor: p2,
          handleIn: cp2,
          type: 'smooth',
        });
      }
    } else if (cmd.type === 'Z') {
      // Close subpath: if last node coincides with subpath start, merge tangent and pop duplicate
      if (nodes.length > subpathStartIndex + 1) {
        const first = nodes[subpathStartIndex];
        const last = nodes[nodes.length - 1];
        const dist = Math.hypot(first.anchor.x - last.anchor.x, first.anchor.y - last.anchor.y);
        if (dist < 0.5) {
          if (last.handleIn && !first.handleIn) {
            first.handleIn = last.handleIn;
            first.type = 'smooth';
          }
          nodes.pop();
        }
      }
    }
  }

  return nodes;
}

/**
 * Ramer-Douglas-Peucker polygon reduction algorithm for clean anchor points
 */
function simplifyPoints(points: Point[], epsilon = 0.4): Point[] {
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
      d = Math.hypot(points[i].x - p1.x, points[i].y - p1.y);
    } else {
      const t = Math.max(0, Math.min(1, ((points[i].x - p1.x) * lineDx + (points[i].y - p1.y) * lineDy) / lineLenSq));
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
 * Converts a polygon ring into smooth VectorNode[] with cubic Bézier tangent handles
 */
function ringToVectorNodes(ringCoords: [number, number][], isSubpathStart = true): VectorNode[] {
  // polygon-clipping rings have first and last point identical
  const pts: Point[] = ringCoords.slice(0, -1).map(c => ({ x: c[0], y: c[1] }));
  if (pts.length < 3) return [];
  const simplified = simplifyPoints(pts, 0.4);
  if (simplified.length < 3) return [];

  const nodes: VectorNode[] = [];
  const count = simplified.length;

  for (let i = 0; i < count; i++) {
    const curr = simplified[i];
    const prev = simplified[(i - 1 + count) % count];
    const next = simplified[(i + 1) % count];

    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const l1 = Math.hypot(d1x, d1y) || 1;
    const l2 = Math.hypot(d2x, d2y) || 1;
    const dot = (d1x * d2x + d1y * d2y) / (l1 * l2);

    const isFirstNode = (i === 0);

    if (dot < 0.6) {
      // Corner node (sharp turn)
      nodes.push({
        id: `node-${Math.random().toString(36).substr(2, 7)}`,
        anchor: curr,
        type: 'corner',
        subpathStart: (isFirstNode && isSubpathStart) ? true : undefined,
      });
    } else {
      // Smooth node with tangential cubic Bézier control handles
      const tanX = next.x - prev.x;
      const tanY = next.y - prev.y;
      const tanLen = Math.hypot(tanX, tanY) || 1;
      const ux = tanX / tanLen;
      const uy = tanY / tanLen;
      const hLen1 = Math.min(l1 * 0.35, 20);
      const hLen2 = Math.min(l2 * 0.35, 20);

      nodes.push({
        id: `node-${Math.random().toString(36).substr(2, 7)}`,
        anchor: curr,
        handleIn: { x: curr.x - ux * hLen1, y: curr.y - uy * hLen1 },
        handleOut: { x: curr.x + ux * hLen2, y: curr.y + uy * hLen2 },
        type: 'smooth',
        subpathStart: (isFirstNode && isSubpathStart) ? true : undefined,
      });
    }
  }

  return nodes;
}

/**
 * Checks whether a 2D point is inside a closed polygon ring
 */
function pointInPolygon(pt: [number, number], ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Computes signed polygon area (shoelace formula)
 */
function signedPolygonArea(ring: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    area += (ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]);
  }
  return area / 2;
}

/**
 * Discretizes OpenType path commands into closed polygon rings
 */
function opentypeCommandsToRings(commands: any[]): [number, number][][] {
  const rings: [number, number][][] = [];
  let currentRing: [number, number][] = [];
  let prevPt: [number, number] = [0, 0];

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (currentRing.length > 2) {
        currentRing.push([currentRing[0][0], currentRing[0][1]]);
        rings.push(currentRing);
      }
      prevPt = [cmd.x, cmd.y];
      currentRing = [prevPt];
    } else if (cmd.type === 'L') {
      prevPt = [cmd.x, cmd.y];
      currentRing.push(prevPt);
    } else if (cmd.type === 'Q') {
      const p0 = prevPt;
      const p1: [number, number] = [cmd.x1, cmd.y1];
      const p2: [number, number] = [cmd.x, cmd.y];
      const len = Math.hypot(p2[0] - p0[0], p2[1] - p0[1]);
      const steps = Math.max(5, Math.min(24, Math.ceil(len / 2.5)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
        const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
        currentRing.push([x, y]);
      }
      prevPt = p2;
    } else if (cmd.type === 'C') {
      const p0 = prevPt;
      const p1: [number, number] = [cmd.x1, cmd.y1];
      const p2: [number, number] = [cmd.x2, cmd.y2];
      const p3: [number, number] = [cmd.x, cmd.y];
      const len = Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
      const steps = Math.max(6, Math.min(32, Math.ceil(len / 2.5)));
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        const x = mt2 * mt * p0[0] + 3 * mt2 * t * p1[0] + 3 * mt * t2 * p2[0] + t2 * t * p3[0];
        const y = mt2 * mt * p0[1] + 3 * mt2 * t * p1[1] + 3 * mt * t2 * p2[1] + t2 * t * p3[1];
        currentRing.push([x, y]);
      }
      prevPt = p3;
    } else if (cmd.type === 'Z') {
      if (currentRing.length > 2) {
        currentRing.push([currentRing[0][0], currentRing[0][1]]);
        rings.push(currentRing);
        currentRing = [];
      }
    }
  }
  if (currentRing.length > 2) {
    currentRing.push([currentRing[0][0], currentRing[0][1]]);
    rings.push(currentRing);
  }
  return rings;
}

/**
 * Organizes rings into [outerRing, ...holeRings] polygons via topological containment
 */
function ringsToPolygons(rings: [number, number][][]): [number, number][][][] {
  const valid = rings
    .map(r => ({ ring: r, area: Math.abs(signedPolygonArea(r)) }))
    .filter(r => r.area > 0.5)
    .sort((a, b) => b.area - a.area);

  if (valid.length === 0) return [];

  const ringMetas = valid.map((item, idx) => {
    let parentIdx = -1;
    let depth = 0;
    const sampleIndices = [0.25, 0.5, 0.75].map(f => Math.floor(item.ring.length * f));
    for (let j = 0; j < idx; j++) {
      let insideCount = 0;
      for (const sIdx of sampleIndices) {
        if (pointInPolygon(item.ring[sIdx], valid[j].ring)) {
          insideCount++;
        }
      }
      if (insideCount >= 2) {
        depth++;
        if (parentIdx === -1) parentIdx = j;
      }
    }
    return { ring: item.ring, depth, parentIdx, idx, area: item.area };
  });

  const outers = ringMetas.filter(m => m.depth % 2 === 0);
  const holes = ringMetas.filter(m => m.depth % 2 === 1);

  return outers.map(outer => {
    const myHoles = holes
      .filter(h => h.parentIdx === outer.idx)
      .map(h => h.ring);
    return [outer.ring, ...myHoles];
  });
}

/**
 * High-level function to convert a Text Element into true solid vector shapes
 * (Illustrator "Create Outlines" / "Expand into Shapes" with automatic Pathfinder Unite / Weld).
 *
 * When fonts are made of overlapping paths (such as cursive connectors, script fonts, ligatures,
 * or overlapping strokes), this function performs a clean Boolean Union so that:
 * 1. Each word becomes a solid continuous shape.
 * 2. The path goes ONLY around the exterior outline and internal counter holes (e.g. 'e', 'o', 'a').
 * 3. NO internal paths go through the middle of the shape.
 * 4. NO inverted sections are created when rendered with fill or stroke.
 */
export async function convertTextToOutlines(
  textElement: PathElement,
  fontsList: FontItem[]
): Promise<PathElement[]> {
  const text = textElement.text || 'Text';
  const fontSize = textElement.fontSize || 48;
  const fontFamily = textElement.fontFamily || 'Inter';
  const letterSpacing = textElement.letterSpacing || 0;

  // Calculate baseline offset from bounding box
  const minX = textElement.nodes.length > 0 ? Math.min(...textElement.nodes.map(n => n.anchor.x)) : 100;
  const minY = textElement.nodes.length > 0 ? Math.min(...textElement.nodes.map(n => n.anchor.y)) : 100;
  const baselineY = minY + fontSize * 0.82;

  // Find font item
  const fontItem = fontsList.find(f => f.family.toLowerCase() === fontFamily.toLowerCase()) || {
    id: 'temp',
    family: fontFamily,
    category: 'system' as const,
  };

  const opentypeFont = await getOrLoadOpentypeFont(fontItem);
  if (!opentypeFont) {
    throw new Error(`Unable to load vector font outlines for ${fontFamily}`);
  }

  const scale = fontSize / opentypeFont.unitsPerEm;
  const words = text.split(/(\s+)/);
  let currentX = minX;
  const wordShapes: PathElement[] = [];

  for (let wIdx = 0; wIdx < words.length; wIdx++) {
    const part = words[wIdx];
    if (!part) continue;

    // Handle whitespace spacing
    if (/^\s+$/.test(part)) {
      currentX += part.length * (fontSize * 0.28 + letterSpacing);
      continue;
    }

    // Collect all glyph commands for this word
    const wordCommands: any[] = [];
    let wordCursorX = currentX;

    for (let cIdx = 0; cIdx < part.length; cIdx++) {
      const char = part[cIdx];
      const glyph = opentypeFont.charToGlyph(char);
      const glyphPath = glyph.getPath(wordCursorX, baselineY, fontSize);

      if (glyphPath && glyphPath.commands && glyphPath.commands.length > 0) {
        wordCommands.push(...glyphPath.commands);
      }

      const advance = (glyph.advanceWidth || 1000) * scale;
      wordCursorX += advance + letterSpacing;
    }
    currentX = wordCursorX;

    if (wordCommands.length === 0) continue;

    // Discretize commands into rings and group into polygons
    const rings = opentypeCommandsToRings(wordCommands);
    const polygons = ringsToPolygons(rings);

    if (polygons.length === 0) {
      // Fallback: direct opentype commands conversion
      const rawNodes = opentypeCommandsToNodes(wordCommands);
      if (rawNodes.length >= 3) {
        wordShapes.push({
          id: `shape-text-${Math.random().toString(36).substr(2, 8)}-${wIdx}`,
          name: `${textElement.text || 'Text'}: ${part}`,
          type: 'path',
          nodes: rawNodes,
          closed: true,
          fill: textElement.fill === 'none' ? 'none' : textElement.fill,
          fillOpacity: textElement.fillOpacity ?? 1,
          stroke: textElement.strokeWidth === 0 || textElement.stroke === 'none' ? 'none' : textElement.stroke,
          strokeWidth: textElement.strokeWidth || 0,
          visible: true,
          locked: false,
        });
      }
      continue;
    }

    let unioned: any = null;
    try {
      if (polygons.length === 1) {
        unioned = (clipper.union as any)(polygons[0]);
      } else if (polygons.length > 1) {
        unioned = (clipper.union as any)(polygons[0], ...polygons.slice(1));
      }
    } catch (e) {
      console.warn("Clipper union failed, using raw polygons", e);
    }

    const finalPolys: any[] = (unioned && unioned.length > 0) ? unioned : polygons;

    // Convert unioned polygons into VectorNode[]
    const wordNodes: VectorNode[] = [];
    for (const poly of finalPolys) {
      for (const ring of poly) {
        const ringNodes = ringToVectorNodes(ring, true);
        if (ringNodes.length > 0) {
          wordNodes.push(...ringNodes);
        }
      }
    }

    if (wordNodes.length >= 3) {
      wordShapes.push({
        id: `shape-text-${Math.random().toString(36).substr(2, 8)}-${wIdx}`,
        name: `${textElement.text || 'Text'}: ${part}`,
        type: 'path',
        nodes: wordNodes,
        closed: true,
        fill: textElement.fill === 'none' ? 'none' : textElement.fill,
        fillOpacity: textElement.fillOpacity ?? 1,
        stroke: textElement.strokeWidth === 0 || textElement.stroke === 'none' ? 'none' : textElement.stroke,
        strokeWidth: textElement.strokeWidth || 0,
        visible: true,
        locked: false,
      });
    }
  }

  return wordShapes;
}


/**
 * Measure accurate text bounding box on canvas
 */
export function measureTextBoundingBox(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string | number = 400,
  fontStyle = 'normal',
  letterSpacing = 0
): { width: number; height: number; ascent: number; descent: number } {
  if (typeof document === 'undefined') {
    return { width: text.length * fontSize * 0.6, height: fontSize * 1.2, ascent: fontSize * 0.8, descent: fontSize * 0.2 };
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { width: text.length * fontSize * 0.6, height: fontSize * 1.2, ascent: fontSize * 0.8, descent: fontSize * 0.2 };
  }

  ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px "${fontFamily}", sans-serif`;
  if (letterSpacing && 'letterSpacing' in ctx) {
    (ctx as any).letterSpacing = `${letterSpacing}px`;
  }

  const metrics = ctx.measureText(text);
  const width = Math.max(20, metrics.width + (text.length > 1 ? letterSpacing * (text.length - 1) : 0));
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.25;
  const height = Math.max(fontSize * 1.1, ascent + descent);

  return { width, height, ascent, descent };
}
