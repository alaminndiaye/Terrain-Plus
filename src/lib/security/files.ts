import { MAX_EVIDENCE_BYTES, MAX_IMAGE_OR_DOC_BYTES, MAX_VIDEO_BYTES } from '../config';

export type MediaKind = 'image' | 'video' | 'document';

export interface DetectedFileType {
  mimeType: string;
  mediaKind: MediaKind;
}

/**
 * Inspect file header magic bytes to determine real MIME type (never trust client extension alone).
 */
export function detectMediaFromMagicBytes(buffer: Buffer): DetectedFileType | null {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  // PDF: %PDF-
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mimeType: 'application/pdf', mediaKind: 'document' };
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', mediaKind: 'image' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', mediaKind: 'image' };
  }
  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', mediaKind: 'image' };
  }
  // MP4 / QuickTime MOV: bytes 4..8 == 'ftyp'
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii');
    if (brand === 'qt  ') {
      return { mimeType: 'video/quicktime', mediaKind: 'video' };
    }
    return { mimeType: 'video/mp4', mediaKind: 'video' };
  }
  // WebM / Matroska EBML: 1A 45 DF A3
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mimeType: 'video/webm', mediaKind: 'video' };
  }

  return null;
}

export function sanitizeDisplayFilename(filename: string): string {
  const base = String(filename || 'fichier')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  return base || 'fichier';
}

export function validateCaseAttachment(
  headerBytes: Buffer,
  byteSize: number,
  originalName: string
): { mimeType: string; mediaKind: MediaKind; safeName: string } {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw new Error('EMPTY_FILE');
  }
  const detected = detectMediaFromMagicBytes(headerBytes);
  if (!detected) {
    throw new Error('UNSUPPORTED_FILE_TYPE');
  }
  const limit = detected.mediaKind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_OR_DOC_BYTES;
  if (byteSize > limit) {
    throw new Error('FILE_TOO_LARGE');
  }
  return {
    mimeType: detected.mimeType,
    mediaKind: detected.mediaKind,
    safeName: sanitizeDisplayFilename(originalName),
  };
}

export function validateDoctorEvidence(
  headerBytes: Buffer,
  byteSize: number,
  originalName: string
): { mimeType: string; safeName: string } {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    throw new Error('EMPTY_FILE');
  }
  if (byteSize > MAX_EVIDENCE_BYTES) {
    throw new Error('FILE_TOO_LARGE');
  }
  const detected = detectMediaFromMagicBytes(headerBytes);
  if (!detected || detected.mediaKind === 'video') {
    throw new Error('UNSUPPORTED_FILE_TYPE');
  }
  return {
    mimeType: detected.mimeType,
    safeName: sanitizeDisplayFilename(originalName),
  };
}
