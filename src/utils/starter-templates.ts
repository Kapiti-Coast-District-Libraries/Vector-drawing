import { PathElement, VectorNode, Point } from '../types';

function createNode(id: string, anchor: Point, handleIn?: Point, handleOut?: Point, type: 'corner' | 'smooth' = 'smooth'): VectorNode {
  return { id, anchor, handleIn, handleOut, type };
}

export function getSpiralTemplate(): PathElement {
  // A beautiful fluid spiral flourish with Bezier handles
  const nodes: VectorNode[] = [
    createNode('s1', { x: 100, y: 350 }, undefined, { x: 120, y: 250 }, 'corner'),
    createNode('s2', { x: 160, y: 180 }, { x: 130, y: 220 }, { x: 190, y: 140 }),
    createNode('s3', { x: 260, y: 150 }, { x: 220, y: 130 }, { x: 300, y: 170 }),
    createNode('s4', { x: 310, y: 240 }, { x: 310, y: 200 }, { x: 310, y: 280 }),
    createNode('s5', { x: 250, y: 300 }, { x: 290, y: 300 }, { x: 210, y: 300 }),
    createNode('s6', { x: 180, y: 240 }, { x: 190, y: 270 }, { x: 170, y: 210 }),
    createNode('s7', { x: 220, y: 180 }, { x: 190, y: 180 }, { x: 240, y: 180 }),
    createNode('s8', { x: 260, y: 220 }, { x: 250, y: 200 }, { x: 270, y: 240 }),
    createNode('s9', { x: 230, y: 260 }, { x: 250, y: 260 }, { x: 210, y: 260 }),
    createNode('s10', { x: 200, y: 220 }, { x: 205, y: 240 }, { x: 195, y: 200 }),
    createNode('s11', { x: 240, y: 210 }, { x: 220, y: 210 }, { x: 260, y: 210 }),
    createNode('s12', { x: 275, y: 245 }, { x: 270, y: 230 }, { x: 280, y: 260 }),
    createNode('s13', { x: 230, y: 340 }, { x: 270, y: 320 }, { x: 190, y: 360 }),
    createNode('s14', { x: 130, y: 370 }, { x: 160, y: 370 }, undefined, 'corner')
  ];

  return {
    id: 'starter-spiral',
    name: 'Spiral Flourish',
    type: 'path',
    nodes,
    closed: true,
    fill: 'none',
    fillOpacity: 1,
    stroke: '#ff007f', // bright pink
    strokeWidth: 4,
    visible: true,
    locked: false
  };
}

export function getTeardropTemplate(): PathElement {
  // Sleek teardrop shape with a sharp corner top node
  const nodes: VectorNode[] = [
    createNode('t1', { x: 250, y: 120 }, undefined, undefined, 'corner'), // sharp pointed top
    createNode('t2', { x: 330, y: 240 }, { x: 310, y: 190 }, { x: 350, y: 290 }),
    createNode('t3', { x: 250, y: 330 }, { x: 300, y: 330 }, { x: 200, y: 330 }),
    createNode('t4', { x: 170, y: 240 }, { x: 150, y: 290 }, { x: 190, y: 190 })
  ];

  return {
    id: 'starter-teardrop',
    name: 'Fluid Teardrop',
    type: 'path',
    nodes,
    closed: true,
    fill: 'none',
    fillOpacity: 1,
    stroke: '#ff007f', // bright pink
    strokeWidth: 4,
    visible: true,
    locked: false
  };
}

export function getTwinLeafTemplate(): PathElement[] {
  // A two-element set representing a pair of mirrored designer leaves
  const leafLeft = getSpiralTemplate();
  leafLeft.id = 'starter-leaf-1';
  leafLeft.name = 'Left Shell';
  leafLeft.fill = 'none';
  leafLeft.stroke = '#ff007f';
  
  const mirrorNodes = leafLeft.nodes.map((n, idx) => {
    const mirrorX = (x: number) => 700 - x;
    return {
      id: `starter-leaf-2-n${idx}`,
      anchor: { x: mirrorX(n.anchor.x) - 100, y: n.anchor.y },
      handleIn: n.handleIn ? { x: mirrorX(n.handleIn.x) - 100, y: n.handleIn.y } : undefined,
      handleOut: n.handleOut ? { x: mirrorX(n.handleOut.x) - 100, y: n.handleOut.y } : undefined,
      type: n.type
    };
  });

  const leafRight: PathElement = {
    ...leafLeft,
    id: 'starter-leaf-2',
    name: 'Right Shell (Mirrored)',
    nodes: mirrorNodes,
    fill: 'none', 
    stroke: '#ff007f',
    strokeWidth: 4,
  };

  return [leafLeft, leafRight];
}
