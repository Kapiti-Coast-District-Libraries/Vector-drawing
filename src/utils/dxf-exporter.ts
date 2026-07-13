import { PathElement, Point } from '../types';
import { sampleCurve } from './vector-math';

/**
 * Samples nodes along a bezier path element to generate line coordinates.
 */
export function getSampledPointsForElement(element: PathElement): Point[] {
  const nodes = element.nodes;
  if (nodes.length === 0) return [];
  const points: Point[] = [];

  for (let i = 0; i < nodes.length - 1; i++) {
    const current = nodes[i];
    const next = nodes[i + 1];
    const h1 = current.handleOut;
    const h2 = next.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || current.anchor;
      const cp2 = h2 || next.anchor;
      const sampled = sampleCurve(current.anchor, cp1, cp2, next.anchor, 16);
      const startIdx = points.length === 0 ? 0 : 1;
      for (let j = startIdx; j < sampled.length; j++) {
        points.push(sampled[j]);
      }
    } else {
      if (points.length === 0) {
        points.push(current.anchor);
      }
      points.push(next.anchor);
    }
  }

  // If closed, sample the closing segment
  if (element.closed && nodes.length > 1) {
    const last = nodes[nodes.length - 1];
    const first = nodes[0];
    const h1 = last.handleOut;
    const h2 = first.handleIn;

    if (h1 || h2) {
      const cp1 = h1 || last.anchor;
      const cp2 = h2 || first.anchor;
      const sampled = sampleCurve(last.anchor, cp1, cp2, first.anchor, 16);
      for (let j = 1; j < sampled.length - 1; j++) {
        points.push(sampled[j]);
      }
    }
  }

  return points;
}

/**
 * Generates a clean, standard DXF file content string for CAD, Laser Cutters, and CNC machines.
 */
export function exportToDXF(elements: PathElement[]): string {
  let dxf = '';
  
  // SECTION: HEADER
  dxf += '  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n';
  
  // SECTION: TABLES
  dxf += '  0\nSECTION\n  2\nTABLES\n';
  dxf += '  0\nTABLE\n  2\nLTYPE\n 70\n1\n';
  dxf += '  0\nLTYPE\n  2\nCONTINUOUS\n 70\n0\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n';
  dxf += '  0\nENDTAB\n';
  dxf += '  0\nTABLE\n  2\nLAYER\n 70\n1\n';
  dxf += '  0\nLAYER\n  2\n0\n 70\n0\n 62\n7\n  6\nCONTINUOUS\n'; // White layer
  dxf += '  0\nENDTAB\n';
  dxf += '  0\nENDSEC\n';
  
  // SECTION: ENTITIES
  dxf += '  0\nSECTION\n  2\nENTITIES\n';

  let handleCount = 1;
  for (const element of elements) {
    if (!element.visible) continue;
    const points = getSampledPointsForElement(element);
    if (points.length < 2) continue;

    const isClosed = element.closed ? 1 : 0;
    
    // We use standard LWPOLYLINE (lightweight polyline) which is extremely well supported across CAM / AutoCAD
    dxf += '  0\nLWPOLYLINE\n';
    dxf += `  5\n${handleCount.toString(16).toUpperCase()}\n`;
    dxf += '100\nAcDbEntity\n';
    dxf += '  8\n0\n'; // Layer 0
    dxf += '100\nAcDbPolyline\n';
    dxf += ` 90\n${points.length}\n`;
    dxf += ` 70\n${isClosed}\n`;
    dxf += ' 43\n0.0\n';

    for (const pt of points) {
      // Invert Y relative to a standard 600px canvas height to keep layout matching the user's screen space
      const x = pt.x.toFixed(3);
      const y = (600 - pt.y).toFixed(3);
      dxf += ` 10\n${x}\n`;
      dxf += ` 20\n${y}\n`;
    }
    
    handleCount++;
  }

  dxf += '  0\nENDSEC\n';
  dxf += '  0\nEOF\n';
  return dxf;
}
