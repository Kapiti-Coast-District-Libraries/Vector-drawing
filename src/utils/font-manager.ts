import opentype from 'opentype.js';
import { PathElement, VectorNode } from '../types';

export interface FontItem {
  id: string;
  family: string;
  fullName?: string;
  postscriptName?: string;
  category: 'local-api' | 'file-upload' | 'google-font' | 'system';
  style?: string;
  blob?: Blob;
  ttfUrl?: string;
  isLoaded?: boolean;
}

// Global in-memory cache of parsed opentype font objects
const opentypeCache = new Map<string, opentype.Font>();

// Curated initial fonts available immediately
export const INITIAL_FONTS: FontItem[] = [
  // Popular Google Fonts (loaded via link tag in index.html)
  {
    id: 'gf-roboto',
    family: 'Roboto',
    fullName: 'Roboto Regular',
    category: 'google-font',
    ttfUrl: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxK.woff2'
  },
  {
    id: 'gf-montserrat',
    family: 'Montserrat',
    fullName: 'Montserrat Bold',
    category: 'google-font',
  },
  {
    id: 'gf-bebas',
    family: 'Bebas Neue',
    fullName: 'Bebas Neue',
    category: 'google-font',
  },
  {
    id: 'gf-inter',
    family: 'Inter',
    fullName: 'Inter SemiBold',
    category: 'google-font',
  },
  {
    id: 'gf-pacifico',
    family: 'Pacifico',
    fullName: 'Pacifico Cursive',
    category: 'google-font',
  },
  {
    id: 'gf-playfair',
    family: 'Playfair Display',
    fullName: 'Playfair Display Serif',
    category: 'google-font',
  },
  {
    id: 'gf-oswald',
    family: 'Oswald',
    fullName: 'Oswald Sans',
    category: 'google-font',
  },
  {
    id: 'gf-caveat',
    family: 'Caveat',
    fullName: 'Caveat Handwriting',
    category: 'google-font',
  },
  {
    id: 'gf-firacode',
    family: 'Fira Code',
    fullName: 'Fira Code Monospace',
    category: 'google-font',
  },
  {
    id: 'gf-lobster',
    family: 'Lobster',
    fullName: 'Lobster Script',
    category: 'google-font',
  },

  // Standard Computer & System Fonts (pre-installed on Windows / macOS / Linux)
  {
    id: 'sys-arial',
    family: 'Arial',
    fullName: 'Arial Sans',
    category: 'system',
  },
  {
    id: 'sys-helvetica',
    family: 'Helvetica',
    fullName: 'Helvetica Sans',
    category: 'system',
  },
  {
    id: 'sys-times',
    family: 'Times New Roman',
    fullName: 'Times New Roman Serif',
    category: 'system',
  },
  {
    id: 'sys-georgia',
    family: 'Georgia',
    fullName: 'Georgia Serif',
    category: 'system',
  },
  {
    id: 'sys-impact',
    family: 'Impact',
    fullName: 'Impact Headline',
    category: 'system',
  },
  {
    id: 'sys-trebuchet',
    family: 'Trebuchet MS',
    fullName: 'Trebuchet MS',
    category: 'system',
  },
  {
    id: 'sys-courier',
    family: 'Courier New',
    fullName: 'Courier New Mono',
    category: 'system',
  },
  {
    id: 'sys-verdana',
    family: 'Verdana',
    fullName: 'Verdana Sans',
    category: 'system',
  },
  {
    id: 'sys-comic',
    family: 'Comic Sans MS',
    fullName: 'Comic Sans MS',
    category: 'system',
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
        blob: f.blob ? f : undefined, // font data handle for opentype extraction
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

  // Register font in the browser's document.fonts so it renders live on canvas
  try {
    const fontFace = new FontFace(detectedFamily, buffer);
    const loadedFace = await fontFace.load();
    document.fonts.add(loadedFace);
  } catch (err) {
    console.warn('FontFace registration warning:', err);
  }

  // Cache parsed opentype font for vector outlining
  opentypeCache.set(detectedFamily, parsedFont);

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
 * Retrieve or dynamically load an opentype.Font instance for a given font family
 */
export async function getOrLoadOpentypeFont(fontItem: FontItem): Promise<opentype.Font | null> {
  if (opentypeCache.has(fontItem.family)) {
    return opentypeCache.get(fontItem.family)!;
  }

  // 1. If it came from Local Font Access API, extract blob
  if (fontItem.blob) {
    try {
      const blobObj = typeof (fontItem.blob as any).blob === 'function' ? await (fontItem.blob as any).blob() : fontItem.blob;
      const buffer = await blobObj.arrayBuffer();
      const parsed = opentype.parse(buffer);
      opentypeCache.set(fontItem.family, parsed);
      return parsed;
    } catch (e) {
      console.warn(`Could not extract blob for local font ${fontItem.family}:`, e);
    }
  }

  // 2. If it has a direct TTF URL (e.g. Google Font or fallback)
  if (fontItem.ttfUrl) {
    try {
      const resp = await fetch(fontItem.ttfUrl);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const parsed = opentype.parse(buffer);
        opentypeCache.set(fontItem.family, parsed);
        return parsed;
      }
    } catch (e) {
      console.warn(`Could not fetch TTF from ${fontItem.ttfUrl}:`, e);
    }
  }

  // 3. Try fetching from Google Fonts or jsDelivr GitHub fonts repository
  const familyClean = encodeURIComponent(fontItem.family);
  const possibleUrls = [
    `https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/${fontItem.family.toLowerCase().replace(/\s+/g, '')}/${fontItem.family.replace(/\s+/g, '')}-Regular.ttf`,
    `https://cdn.jsdelivr.net/gh/google/fonts@main/apache/${fontItem.family.toLowerCase().replace(/\s+/g, '')}/${fontItem.family.replace(/\s+/g, '')}-Regular.ttf`,
    `https://fonts.cdnfonts.com/s/14881/Roboto-Regular.woff`,
  ];

  for (const url of possibleUrls) {
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const buffer = await resp.arrayBuffer();
        const parsed = opentype.parse(buffer);
        opentypeCache.set(fontItem.family, parsed);
        return parsed;
      }
    } catch (e) {
      // Continue to next
    }
  }

  return null;
}

/**
 * Converts opentype path commands into closed PathElement vector shapes with full Bézier handles.
 */
export function opentypeCommandsToPathElements(
  commands: any[],
  baseElement: PathElement,
  offsetX = 0,
  offsetY = 0
): PathElement[] {
  const result: PathElement[] = [];
  let currentNodes: VectorNode[] = [];
  let contourIndex = 0;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];

    if (cmd.type === 'M') {
      if (currentNodes.length > 0) {
        result.push(createSubpathElement(baseElement, currentNodes, false, contourIndex++));
        currentNodes = [];
      }
      currentNodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x + offsetX, y: cmd.y + offsetY },
        type: 'corner',
      });
    } else if (cmd.type === 'L') {
      currentNodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x + offsetX, y: cmd.y + offsetY },
        type: 'corner',
      });
    } else if (cmd.type === 'C') {
      if (currentNodes.length > 0) {
        const prev = currentNodes[currentNodes.length - 1];
        prev.handleOut = { x: cmd.x1 + offsetX, y: cmd.y1 + offsetY };
        prev.type = 'smooth';
      }
      currentNodes.push({
        id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: cmd.x + offsetX, y: cmd.y + offsetY },
        handleIn: { x: cmd.x2 + offsetX, y: cmd.y2 + offsetY },
        type: 'smooth',
      });
    } else if (cmd.type === 'Q') {
      // Convert quadratic Bézier to cubic Bézier
      if (currentNodes.length > 0) {
        const prev = currentNodes[currentNodes.length - 1];
        const p0 = prev.anchor;
        const p1 = { x: cmd.x1 + offsetX, y: cmd.y1 + offsetY };
        const p2 = { x: cmd.x + offsetX, y: cmd.y + offsetY };

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

        currentNodes.push({
          id: `node-txt-${Math.random().toString(36).substr(2, 7)}`,
          anchor: p2,
          handleIn: cp2,
          type: 'smooth',
        });
      }
    } else if (cmd.type === 'Z') {
      if (currentNodes.length > 1) {
        // Check if last node matches first node
        const first = currentNodes[0];
        const last = currentNodes[currentNodes.length - 1];
        const dist = Math.hypot(first.anchor.x - last.anchor.x, first.anchor.y - last.anchor.y);
        if (dist < 0.5) {
          if (last.handleIn && !first.handleIn) {
            first.handleIn = last.handleIn;
          }
          currentNodes.pop();
        }
        result.push(createSubpathElement(baseElement, currentNodes, true, contourIndex++));
        currentNodes = [];
      }
    }
  }

  if (currentNodes.length > 0) {
    result.push(createSubpathElement(baseElement, currentNodes, false, contourIndex++));
  }

  return result;
}

function createSubpathElement(
  base: PathElement,
  nodes: VectorNode[],
  closed: boolean,
  index: number
): PathElement {
  return {
    id: `path-outline-${Math.random().toString(36).substr(2, 8)}-${index}`,
    name: `${base.text || 'Text'} Outline ${index + 1}`,
    type: 'path',
    nodes,
    closed,
    fill: base.fill === 'none' ? 'none' : base.fill,
    fillOpacity: base.fillOpacity ?? 1,
    stroke: base.stroke || '#111827',
    strokeWidth: base.strokeWidth || 1,
    visible: true,
    locked: false,
    brushId: base.brushId,
  };
}

/**
 * Fallback contour vectorizer using high-resolution offscreen HTML Canvas
 * when direct opentype font binary is not available.
 */
export function rasterContourVectorizer(
  text: string,
  baseElement: PathElement,
  x: number,
  y: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: string | number = 400,
  fontStyle = 'normal'
): PathElement[] {
  const canvas = document.createElement('canvas');
  const scale = 2; // high resolution rasterization for smooth vector curves
  const fontStr = `${fontStyle} ${fontWeight} ${fontSize * scale}px "${fontFamily}", sans-serif`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.font = fontStr;
  const metrics = ctx.measureText(text);
  const textW = Math.ceil(metrics.width) + 20 * scale;
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent || fontSize * 0.8 * scale);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent || fontSize * 0.2 * scale);
  const textH = ascent + descent + 20 * scale;

  canvas.width = Math.max(textW, 20);
  canvas.height = Math.max(textH, 20);

  // Render text cleanly in black on transparent
  ctx.font = fontStr;
  ctx.fillStyle = '#000000';
  ctx.textBaseline = 'alphabetic';
  const drawX = 10 * scale;
  const drawY = 10 * scale + ascent;
  ctx.fillText(text, drawX, drawY);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const w = canvas.width;
  const h = canvas.height;

  // Marching Squares / Boundary tracer to extract outer & inner boundary loops
  const visited = new Uint8Array(w * h);
  const isOpaque = (px: number, py: number) => {
    if (px < 0 || px >= w || py < 0 || py >= h) return false;
    return data[(py * w + px) * 4 + 3] > 120; // alpha threshold
  };

  const contours: { x: number; y: number }[][] = [];

  for (let cy = 1; cy < h - 1; cy += 2) {
    for (let cx = 1; cx < w - 1; cx += 2) {
      if (isOpaque(cx, cy) && !visited[cy * w + cx]) {
        // Trace contour boundary
        const pts: { x: number; y: number }[] = [];
        let currX = cx;
        let currY = cy;
        let dir = 0; // 0: right, 1: down, 2: left, 3: up
        const dx = [1, 0, -1, 0];
        const dy = [0, 1, 0, -1];
        let steps = 0;
        const maxSteps = 4000;

        while (steps < maxSteps) {
          visited[currY * w + currX] = 1;
          pts.push({
            x: x + (currX - drawX) / scale,
            y: y + (currY - drawY) / scale,
          });

          // Check next step
          let found = false;
          for (let turn = -1; turn <= 2; turn++) {
            const nextDir = (dir + turn + 4) % 4;
            const nx = currX + dx[nextDir];
            const ny = currY + dy[nextDir];
            if (isOpaque(nx, ny)) {
              currX = nx;
              currY = ny;
              dir = nextDir;
              found = true;
              break;
            }
          }

          if (!found || (currX === cx && currY === cy && steps > 3)) {
            break;
          }
          steps++;
        }

        if (pts.length > 6) {
          // Downsample points for clean vector nodes
          const simplified: { x: number; y: number }[] = [];
          const stepSize = Math.max(1, Math.floor(pts.length / 45));
          for (let k = 0; k < pts.length; k += stepSize) {
            simplified.push(pts[k]);
          }
          contours.push(simplified);
        }
      }
    }
  }

  // Convert contours into PathElements with smooth vector nodes
  return contours.map((contour, cIdx) => {
    const nodes: VectorNode[] = contour.map((pt, pIdx) => {
      const prev = contour[(pIdx - 1 + contour.length) % contour.length];
      const next = contour[(pIdx + 1) % contour.length];
      const tanX = (next.x - prev.x) * 0.25;
      const tanY = (next.y - prev.y) * 0.25;

      return {
        id: `node-vect-${Math.random().toString(36).substr(2, 7)}`,
        anchor: { x: pt.x, y: pt.y },
        handleIn: { x: pt.x - tanX, y: pt.y - tanY },
        handleOut: { x: pt.x + tanX, y: pt.y + tanY },
        type: 'smooth',
      };
    });

    return {
      id: `path-vectorized-${Math.random().toString(36).substr(2, 8)}-${cIdx}`,
      name: `${baseElement.text || 'Text'} Outline ${cIdx + 1}`,
      type: 'path',
      nodes,
      closed: true,
      fill: baseElement.fill === 'none' ? 'none' : baseElement.fill,
      fillOpacity: baseElement.fillOpacity ?? 1,
      stroke: baseElement.stroke || '#111827',
      strokeWidth: baseElement.strokeWidth || 1,
      visible: true,
      locked: false,
    };
  });
}

/**
 * High-level function to convert a Text Element into vector outlines (Illustrator "Create Outlines" / Ctrl+Shift+O).
 * Tries opentype first for 100% mathematical Bézier precision; falls back to canvas vectorizer.
 */
export async function convertTextToOutlines(
  textElement: PathElement,
  fontsList: FontItem[]
): Promise<PathElement[]> {
  const text = textElement.text || 'Text';
  const fontSize = textElement.fontSize || 48;
  const fontFamily = textElement.fontFamily || 'Inter';

  // Calculate baseline offset from bounding box
  const minX = textElement.nodes.length > 0 ? Math.min(...textElement.nodes.map(n => n.anchor.x)) : 100;
  const minY = textElement.nodes.length > 0 ? Math.min(...textElement.nodes.map(n => n.anchor.y)) : 100;
  const baselineY = minY + fontSize * 0.85;

  // Find font item
  const fontItem = fontsList.find(f => f.family.toLowerCase() === fontFamily.toLowerCase()) || {
    id: 'temp',
    family: fontFamily,
    category: 'system' as const,
  };

  try {
    const opentypeFont = await getOrLoadOpentypeFont(fontItem);
    if (opentypeFont) {
      const path = opentypeFont.getPath(text, minX, baselineY, fontSize, {
        kerning: true,
        letterSpacing: textElement.letterSpacing ? textElement.letterSpacing / fontSize : 0,
      });

      if (path && path.commands && path.commands.length > 0) {
        const shapes = opentypeCommandsToPathElements(path.commands, textElement);
        if (shapes.length > 0) {
          return shapes;
        }
      }
    }
  } catch (err) {
    console.warn('Opentype outline generation failed, falling back to raster vectorizer:', err);
  }

  // Fallback to Canvas contour vectorizer
  const fallbackShapes = rasterContourVectorizer(
    text,
    textElement,
    minX,
    baselineY,
    fontSize,
    fontFamily,
    textElement.fontWeight || 400,
    textElement.fontStyle || 'normal'
  );

  return fallbackShapes;
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
