/**
 * Optimizes an image (e.g. JPEG, PNG) to ensure it stays sharp and high quality
 * for vector tracing while keeping its data size well within Firestore document limits (~500KB or less).
 */
export async function optimizeTracingImageDataUrl(
  dataUrl: string,
  maxDimension: number = 1400,
  quality: number = 0.82
): Promise<string> {
  // If already relatively small (less than 250KB base64 string), return immediately
  if (dataUrl.length < 250000) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      let width = img.naturalWidth || img.width;
      let height = img.naturalHeight || img.height;

      if (!width || !height) {
        resolve(dataUrl);
        return;
      }

      // Calculate scale if exceeding maxDimension
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve(dataUrl);
        return;
      }

      // Fill white background in case of transparent PNG being converted to JPEG
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // Export as clean compressed JPEG
      const compressedUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(compressedUrl);
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}
