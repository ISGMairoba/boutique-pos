import { supabase } from '../../lib/supabase.ts';

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
export const LOGO_MAX_BYTES = 512 * 1024;
/** Receipt printers print 384 dots across on 58 mm paper; keeping the black logo that wide suits both papers. */
const RECEIPT_WIDTH = 384;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This file could not be opened as an image. Try a PNG or JPEG.'));
    };
    image.src = url;
  });
}

/**
 * A black-and-white version of the logo for thermal receipt printers: transparent and light areas
 * become white paper, everything darker than mid-grey prints black.
 */
export async function receiptVersion(file: File): Promise<Blob> {
  const image = await loadImage(file);
  const width = Math.min(RECEIPT_WIDTH, image.naturalWidth || RECEIPT_WIDTH);
  const height = Math.max(
    1,
    Math.round((width / (image.naturalWidth || width)) * (image.naturalHeight || width)),
  );
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot prepare the receipt logo.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const light = 0.299 * (data[i] ?? 255) + 0.587 * (data[i + 1] ?? 255) + 0.114 * (data[i + 2] ?? 255);
    const ink = light < 160 ? 0 : 255;
    data[i] = ink;
    data[i + 1] = ink;
    data[i + 2] = ink;
    data[i + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The receipt logo could not be made.'))),
      'image/png',
    ),
  );
}

export function checkLogoFile(file: File): string | null {
  if (!LOGO_TYPES.includes(file.type)) return 'Use a PNG, JPEG, WebP or SVG image.';
  if (file.size > LOGO_MAX_BYTES) return 'Use an image smaller than 512 KB.';
  return null;
}

const extension: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/** Uploads the logo and its receipt version; returns their storage paths. */
export async function uploadLogo(
  businessId: string,
  file: File,
): Promise<{ screen: string; receipt: string }> {
  if (!supabase) throw new Error('This build has no server configured.');
  const problem = checkLogoFile(file);
  if (problem) throw new Error(problem);
  const receipt = await receiptVersion(file);
  const stamp = Date.now().toString(36);
  const screenPath = `${businessId}/logo-${stamp}.${extension[file.type] ?? 'png'}`;
  const receiptPath = `${businessId}/logo-${stamp}-receipt.png`;
  const bucket = supabase.storage.from('brand-assets');
  const first = await bucket.upload(screenPath, file, { contentType: file.type, cacheControl: '31536000' });
  if (first.error) throw new Error(`The logo could not be uploaded: ${first.error.message}`);
  const second = await bucket.upload(receiptPath, receipt, {
    contentType: 'image/png',
    cacheControl: '31536000',
  });
  if (second.error) {
    await bucket.remove([screenPath]);
    throw new Error(`The receipt logo could not be uploaded: ${second.error.message}`);
  }
  return { screen: screenPath, receipt: receiptPath };
}
