import { UPLOAD_LIMITS, type UploadKind } from '../../../shared/constants';

/** Detect a file's real type from its magic bytes (never trust the client's Content-Type). */
export function sniffType(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
    return 'image/webp';
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'application/pdf';
  return null;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export function validateUpload(kind: UploadKind, bytes: Uint8Array): { type: string; ext: string } | string {
  const limits = UPLOAD_LIMITS[kind];
  if (bytes.byteLength === 0) return 'File is empty';
  if (bytes.byteLength > limits.maxBytes) return `File is too large (max ${Math.round(limits.maxBytes / 1024 / 1024)} MB)`;
  const type = sniffType(bytes);
  if (!type || !(limits.types as readonly string[]).includes(type)) return 'Unsupported file type';
  return { type, ext: EXT[type] };
}

/** R2 key prefixes. Certificates are private; photos and logos are public. */
export const KEY_PREFIX: Record<UploadKind, string> = {
  photo: 'photos',
  cert: 'certs',
  logo: 'logos',
};

export function isPublicKey(key: string): boolean {
  return key.startsWith('photos/') || key.startsWith('logos/');
}

export function publicFileUrl(key: string | null | undefined): string | null {
  return key ? `/api/files/${key}` : null;
}
