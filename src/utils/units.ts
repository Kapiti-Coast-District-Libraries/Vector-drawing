import { Point, VectorNode, PathElement } from '../types';
import { getCombinedBoundingBox } from './mirror-utils';

export type UnitType = 'mm' | 'cm' | 'in' | 'px';

export const PX_PER_INCH = 96;
export const MM_PER_INCH = 25.4;
export const PX_PER_MM = PX_PER_INCH / MM_PER_INCH; // ~3.779527559
export const MM_PER_PX = MM_PER_INCH / PX_PER_INCH; // ~0.264583333
export const PX_PER_CM = PX_PER_INCH / 2.54; // ~37.79527559
export const CM_PER_PX = 2.54 / PX_PER_INCH; // ~0.026458333

/**
 * Converts screen/canvas pixels into the target unit
 */
export function pxToUnit(px: number, unit: UnitType): number {
  switch (unit) {
    case 'mm':
      return px * MM_PER_PX;
    case 'cm':
      return px * CM_PER_PX;
    case 'in':
      return px / PX_PER_INCH;
    case 'px':
    default:
      return px;
  }
}

/**
 * Converts a measurement value in a given unit into canvas pixels
 */
export function unitToPx(val: number, unit: UnitType): number {
  if (isNaN(val)) return 0;
  switch (unit) {
    case 'mm':
      return val * PX_PER_MM;
    case 'cm':
      return val * PX_PER_CM;
    case 'in':
      return val * PX_PER_INCH;
    case 'px':
    default:
      return val;
  }
}

/**
 * Formats pixels into a human-readable string with unit symbol
 */
export function formatUnit(px: number, unit: UnitType, decimals = 1): string {
  const val = pxToUnit(px, unit);
  const rounded = Number(val.toFixed(decimals));
  return `${rounded} ${unit}`;
}

/**
 * Parses user input like "50", "50mm", "2in", "100px" into pixels
 */
export function parseUnitInput(inputStr: string, defaultUnit: UnitType): number | null {
  const trimmed = inputStr.trim().toLowerCase();
  if (!trimmed) return null;

  let unit: UnitType = defaultUnit;
  let numStr = trimmed;

  if (trimmed.endsWith('mm')) {
    unit = 'mm';
    numStr = trimmed.slice(0, -2).trim();
  } else if (trimmed.endsWith('cm')) {
    unit = 'cm';
    numStr = trimmed.slice(0, -2).trim();
  } else if (trimmed.endsWith('in') || trimmed.endsWith('"')) {
    unit = 'in';
    numStr = trimmed.replace(/in|"$/, '').trim();
  } else if (trimmed.endsWith('px')) {
    unit = 'px';
    numStr = trimmed.slice(0, -2).trim();
  }

  const parsed = parseFloat(numStr);
  if (isNaN(parsed) || !isFinite(parsed)) return null;

  return unitToPx(parsed, unit);
}

export type TransformOrigin = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface ResizeDimensionsOptions {
  newWidth?: number;  // In canvas pixels
  newHeight?: number; // In canvas pixels
  newX?: number;      // In canvas pixels
  newY?: number;      // In canvas pixels
  origin?: TransformOrigin;
  lockAspectRatio?: boolean;
}

/**
 * Resizes and/or repositions a collection of path elements to exact dimensions
 */
export function resizeElementsToDimensions(
  elements: PathElement[],
  options: ResizeDimensionsOptions
): PathElement[] {
  if (elements.length === 0) return elements;

  const box = getCombinedBoundingBox(elements);
  if (box.width <= 0 && box.height <= 0) return elements;

  const currentW = Math.max(0.001, box.width);
  const currentH = Math.max(0.001, box.height);

  let targetW = options.newWidth !== undefined ? Math.max(0.1, options.newWidth) : currentW;
  let targetH = options.newHeight !== undefined ? Math.max(0.1, options.newHeight) : currentH;

  // Handle aspect ratio constraint
  if (options.lockAspectRatio) {
    if (options.newWidth !== undefined && options.newHeight === undefined) {
      targetH = currentH * (targetW / currentW);
    } else if (options.newHeight !== undefined && options.newWidth === undefined) {
      targetW = currentW * (targetH / currentH);
    }
  }

  const scaleX = targetW / currentW;
  const scaleY = targetH / currentH;

  // Determine origin reference point
  const originType = options.origin || 'center';
  let originX = box.centerX;
  let originY = box.centerY;

  switch (originType) {
    case 'top-left':
      originX = box.minX;
      originY = box.minY;
      break;
    case 'top-right':
      originX = box.maxX;
      originY = box.minY;
      break;
    case 'bottom-left':
      originX = box.minX;
      originY = box.maxY;
      break;
    case 'bottom-right':
      originX = box.maxX;
      originY = box.maxY;
      break;
    case 'center':
    default:
      originX = box.centerX;
      originY = box.centerY;
      break;
  }

  // Handle position translation if newX or newY is given
  let deltaX = 0;
  let deltaY = 0;

  if (options.newX !== undefined) {
    const refX = originType === 'center' ? box.centerX : originType.includes('right') ? box.maxX : box.minX;
    deltaX = options.newX - refX;
  }

  if (options.newY !== undefined) {
    const refY = originType === 'center' ? box.centerY : originType.includes('bottom') ? box.maxY : box.minY;
    deltaY = options.newY - refY;
  }

  const transformPoint = (p: Point): Point => {
    return {
      x: originX + (p.x - originX) * scaleX + deltaX,
      y: originY + (p.y - originY) * scaleY + deltaY,
    };
  };

  return elements.map(el => {
    const newNodes = el.nodes.map(node => {
      return {
        ...node,
        anchor: transformPoint(node.anchor),
        handleIn: node.handleIn ? transformPoint(node.handleIn) : undefined,
        handleOut: node.handleOut ? transformPoint(node.handleOut) : undefined,
      };
    });

    const newFontSize = el.type === 'text' && el.fontSize
      ? Math.max(6, Math.round(el.fontSize * Math.abs(scaleY)))
      : el.fontSize;

    return {
      ...el,
      nodes: newNodes,
      fontSize: newFontSize,
    };
  });
}

/**
 * Common standard artboard presets
 */
export interface ArtboardPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  category: 'standard' | 'print' | 'craft' | 'custom';
}

export const ARTBOARD_PRESETS: ArtboardPreset[] = [
  { id: 'a4', name: 'A4 (210 × 297 mm)', widthMm: 210, heightMm: 297, category: 'print' },
  { id: 'a3', name: 'A3 (297 × 420 mm)', widthMm: 297, heightMm: 420, category: 'print' },
  { id: 'a5', name: 'A5 (148 × 210 mm)', widthMm: 148, heightMm: 210, category: 'print' },
  { id: 'square-200', name: 'Square (200 × 200 mm)', widthMm: 200, heightMm: 200, category: 'craft' },
  { id: 'square-300', name: 'Cricut 12" (304.8 × 304.8 mm)', widthMm: 304.8, heightMm: 304.8, category: 'craft' },
  { id: 'laser-bed', name: 'Laser Bed (300 × 200 mm)', widthMm: 300, heightMm: 200, category: 'craft' },
  { id: 'us-letter', name: 'US Letter (215.9 × 279.4 mm)', widthMm: 215.9, heightMm: 279.4, category: 'standard' },
  { id: 'business-card', name: 'Business Card (85 × 55 mm)', widthMm: 85, heightMm: 55, category: 'standard' },
];
