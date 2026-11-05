const cache = new Map<string, string>();

/** The icon as a PNG data URL, optionally with a colored notification dot (for the favicon). */
export const makeBadgedIcon = (src: string, dotColor?: string): Promise<string> => {
  const key = `${src}|${dotColor ?? ''}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('no canvas'));
        return;
      }
      ctx.drawImage(img, 0, 0, size, size);
      if (dotColor) {
        ctx.beginPath();
        ctx.arc(size - 17, 17, 14, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#FFFFFF';
        ctx.stroke();
      }
      const url = canvas.toDataURL('image/png');
      cache.set(key, url);
      resolve(url);
    };
    img.onerror = () => reject(new Error('icon failed to load'));
    img.src = src;
  });
};
