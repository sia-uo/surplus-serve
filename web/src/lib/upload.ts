import { api } from './api';

/** Downscale and re-encode an image in the browser before upload (keeps R2 and bandwidth small). */
export async function compressImage(file: File, maxSide = 1280, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadFile(kind: 'photo' | 'cert' | 'logo', file: File): Promise<{ key: string; url: string | null }> {
  const body = kind === 'cert' && file.type === 'application/pdf' ? file : await compressImage(file);
  const form = new FormData();
  form.set('file', body, file.name);
  return api.post(`/api/uploads?kind=${kind}`, form);
}
