import { Layer } from '../types';
import { getPathData } from './vector-math';

/**
 * Generates a clean, lightweight SVG string representing the layers
 * for use as a preview thumbnail in the cloud documents browser.
 */
export function generateThumbnailSvg(
  layers: Layer[],
  artboardWidth: number = 800,
  artboardHeight: number = 600
): string {
  const visibleLayers = layers.filter(l => l.visible);
  
  const pathElements: string[] = [];

  for (const layer of visibleLayers) {
    for (const el of layer.elements) {
      const d = getPathData(el.nodes, el.closed);
      if (!d) continue;

      const fill = el.fill === 'none' ? 'none' : (el.fill || 'none');
      const fillOpacity = typeof el.fillOpacity === 'number' ? el.fillOpacity : 1;
      const stroke = el.stroke || '#ff007f';
      const strokeWidth = el.strokeWidth || 2;

      pathElements.push(
        `<path d="${d}" fill="${fill}" fill-opacity="${fillOpacity}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`
      );
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${artboardWidth} ${artboardHeight}" class="w-full h-full">${pathElements.join('')}</svg>`;
}
