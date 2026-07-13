import { PathElement, Point, VectorNode } from '../types';

/**
 * Calculates the bounding box of a path element
 */
export function getElementBoundingBox(element: PathElement) {
  if (element.nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 0, centerY: 0 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  element.nodes.forEach(node => {
    // Check anchor
    minX = Math.min(minX, node.anchor.x);
    maxX = Math.max(maxX, node.anchor.x);
    minY = Math.min(minY, node.anchor.y);
    maxY = Math.max(maxY, node.anchor.y);

    // Check handles if present
    if (node.handleIn) {
      minX = Math.min(minX, node.handleIn.x);
      maxX = Math.max(maxX, node.handleIn.x);
      minY = Math.min(minY, node.handleIn.y);
      maxY = Math.max(maxY, node.handleIn.y);
    }
    if (node.handleOut) {
      minX = Math.min(minX, node.handleOut.x);
      maxX = Math.max(maxX, node.handleOut.x);
      minY = Math.min(minY, node.handleOut.y);
      maxY = Math.max(maxY, node.handleOut.y);
    }
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

/**
 * Calculates the combined bounding box of a list of path elements
 */
export function getCombinedBoundingBox(elements: PathElement[]) {
  if (elements.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, centerX: 400, centerY: 300 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  elements.forEach(el => {
    const box = getElementBoundingBox(el);
    minX = Math.min(minX, box.minX);
    maxX = Math.max(maxX, box.maxX);
    minY = Math.min(minY, box.minY);
    maxY = Math.max(maxY, box.maxY);
  });

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

/**
 * Mirrors a single vector node
 */
function mirrorNode(
  node: VectorNode,
  axis: 'horizontal' | 'vertical',
  center: number,
  elementId: string
): VectorNode {
  const mirrorX = (x: number) => 2 * center - x;
  const mirrorY = (y: number) => 2 * center - y;

  const anchor = {
    x: axis === 'horizontal' ? mirrorX(node.anchor.x) : node.anchor.x,
    y: axis === 'vertical' ? mirrorY(node.anchor.y) : node.anchor.y
  };

  const handleIn = node.handleIn
    ? {
        x: axis === 'horizontal' ? mirrorX(node.handleIn.x) : node.handleIn.x,
        y: axis === 'vertical' ? mirrorY(node.handleIn.y) : node.handleIn.y
      }
    : undefined;

  const handleOut = node.handleOut
    ? {
        x: axis === 'horizontal' ? mirrorX(node.handleOut.x) : node.handleOut.x,
        y: axis === 'vertical' ? mirrorY(node.handleOut.y) : node.handleOut.y
      }
    : undefined;

  return {
    id: `node-${elementId}-${Math.random().toString(36).substr(2, 5)}`,
    anchor,
    handleIn,
    handleOut,
    type: node.type
  };
}

/**
 * Returns a mirrored copy of the PathElement
 */
export function mirrorElement(
  element: PathElement,
  axis: 'horizontal' | 'vertical',
  center: number
): PathElement {
  const mirroredNodes = element.nodes.map(node =>
    mirrorNode(node, axis, center, element.id)
  );

  return {
    ...element,
    id: `el-${Math.random().toString(36).substr(2, 9)}`,
    name: `${element.name} (Mirrored)`,
    nodes: mirroredNodes
  };
}
