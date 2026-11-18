import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACCEPTED_DIPLOMA_MIME_TYPES,
  COACH_LEGAL_STATUS_OPTIONS,
  MAX_DIPLOMA_FILE_BYTES,
  SPORT_DIPLOMA_FORMATS,
  type DiplomaTypeCode,
} from '../src/data/sportsDiplomas.ts';
import type { CoachDocumentStudyCheck, CoachDocumentStudyReport } from '../src/types.ts';
import { db } from './db.ts';
import { uploadDiplomaToSupabaseStorage } from './supabaseAdmin.ts';

export const DIPLOMA_UPLOAD_DIR = path.resolve(process.env.DIPLOMA_UPLOAD_DIR || './uploads/coach-diplomas');

export function ensureUploadDir(): void {
  if (!fs.existsSync(DIPLOMA_UPLOAD_DIR)) {
    fs.mkdirSync(DIPLOMA_UPLOAD_DIR, { recursive: true });
  }
}

export function detectMimeFromMagicBytes(buf: Buffer): (typeof ACCEPTED_DIPLOMA_MIME_TYPES)[number] | null {
  if (buf.length < 12) return null;

  // PDF: %PDF-
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d) {
    return 'application/pdf';
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

export function extensionForMime(mime: string): string {
  if (mime === 'application/pdf') return '.pdf';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/webp') return '.webp';
  return '.bin';
}

export interface DiplomaStudyInput {
  coachUserId: number;
  diplomaType: DiplomaTypeCode;
  issuingOrganism: string;
  diplomaNumber: string;
  issueYear: number;
  specialite: string;
  qualification: string;
  originalFilename: string;
  buffer: Buffer;
  proCardNumber?: string | null;
  proCardExpiry?: string | null;
  rcProInsurer?: string | null;
  rcProPolicyNumber?: string | null;
  legalStatus?: string | null;
  businessRegNumber?: string | null;
  honorabilityAttested?: boolean;
}

export function evaluateDiplomaDocument(
  input: Omit<DiplomaStudyInput, 'coachUserId' | 'buffer'> & {
    detectedMime: string | null;
    fileSizeBytes: number;
    sha256Hash: string;
    excludeCoachUserId?: number;
  }
): {
  score: number;
  status: 'CONFORME_PRE_ETUDE' | 'A_VERIFIER' | 'ANOMALIE';
  report: CoachDocumentStudyReport;
} {
  const spec = SPORT_DIPLOMA_FORMATS[input.diplomaType];
  const currentYear = new Date().getFullYear();

  const duplicateRow = db
    .prepare(
      `SELECT coach_user_id FROM coach_documents
       WHERE sha256_hash = ? AND coach_user_id != ?
       LIMIT 1`
    )
    .get(input.sha256Hash, input.excludeCoachUserId ?? -1) as { coach_user_id: number } | undefined;

  const isFormatValid = Boolean(
    input.detectedMime && (ACCEPTED_DIPLOMA_MIME_TYPES as readonly string[]).includes(input.detectedMime)
  );
  const isSizeValid = input.fileSizeBytes >= 400 && input.fileSizeBytes <= MAX_DIPLOMA_FILE_BYTES;
  const isUniqueHash = !duplicateRow;
  const isNumberValid = Boolean(spec && spec.numberPattern.test(input.diplomaNumber.trim()));
  const isYearPlausible = Number.isInteger(input.issueYear) && input.issueYear >= 1980 && input.issueYear <= currentYear;

  const orgLower = input.issuingOrganism.toLowerCase();
  const isOrganismRecognized = Boolean(
    spec &&
      (spec.acceptedOrganisms.some((o) => orgLower.includes(o.toLowerCase()) || o.toLowerCase().includes(orgLower)) ||
        orgLower.includes('minist') ||
        orgLower.includes('féd') ||
        orgLower.includes('fed') ||
        orgLower.includes('univ') ||
        orgLower.includes('inseps') ||
        orgLower.includes('cneps') ||
        orgLower.includes('drajes') ||
        orgLower.includes('creps') ||
        orgLower.includes('insep') ||
        orgLower.includes('cpnef'))
  );

  const specLower = `${input.specialite} ${input.qualification}`.toLowerCase();
  const isSportConsistent = Boolean(
    spec &&
      (spec.relatedSports === 'ALL' ||
        spec.relatedSports.some((sc) => {
          if (sc === 'football') return specLower.includes('foot');
          if (sc === 'basket') return specLower.includes('basket');
          if (sc === 'handball') return specLower.includes('hand');
          if (sc === 'volleyball') return specLower.includes('volley');
          if (sc === 'athletisme') return specLower.includes('athl') || specLower.includes('sprint') || specLower.includes('fond');
          return false;
        }))
  );

  const proCardNum = (input.proCardNumber || '').trim();
  const proCardExpiryDate = input.proCardExpiry ? new Date(input.proCardExpiry) : null;
  const isProCardValid = Boolean(
    proCardNum.length >= 4 &&
      proCardExpiryDate &&
      !Number.isNaN(proCardExpiryDate.getTime()) &&
      proCardExpiryDate.getTime() > Date.now() &&
      input.honorabilityAttested !== false
  );

  const rcInsurer = (input.rcProInsurer || '').trim();
  const rcPolicy = (input.rcProPolicyNumber || '').trim();
  const isRcProValid = rcInsurer.length >= 2 && rcPolicy.length >= 4;

  const legalOpt = COACH_LEGAL_STATUS_OPTIONS.find((o) => o.code === input.legalStatus);
  const regNum = (input.businessRegNumber || '').trim();
  const isLegalStatusValid = Boolean(legalOpt && regNum.length >= 5);

  const checks: CoachDocumentStudyCheck[] = [
    {
      id: 'magic_bytes',
      label: 'Signature binaire & format officiel',
      passed: isFormatValid,
      detail: isFormatValid
        ? `Format vérifié (${input.detectedMime === 'application/pdf' ? 'Document PDF' : input.detectedMime})`
        : 'En-tête binaire non reconnu (PDF, PNG, JPG ou WEBP requis).',
    },
    {
      id: 'file_size',
      label: 'Taille et intégrité du fichier',
      passed: isSizeValid,
      detail: isSizeValid
        ? `${Math.max(1, Math.round(input.fileSizeBytes / 1024))} Ko (seuil max 3 072 Ko)`
        : 'Fichier vide, corrompu ou supérieur à 3 Mo.',
    },
    {
      id: 'unique_hash',
      label: 'Unicité de l’empreinte (SHA-256)',
      passed: isUniqueHash,
      detail: isUniqueHash
        ? 'Aucun doublon détecté parmi les autres dossiers coach.'
        : 'Attention : document identique déjà déposé sur un autre compte.',
    },
    {
      id: 'number_format',
      label: 'Format du numéro de diplôme / licence',
      passed: isNumberValid,
      detail: isNumberValid
        ? `Référence structurée (${input.diplomaNumber})`
        : `Format attendu : ${spec?.formatExample || 'Code alphanumérique'}`,
    },
    {
      id: 'organism',
      label: 'Organisme émetteur reconnu',
      passed: isOrganismRecognized,
      detail: isOrganismRecognized
        ? `Organisme cohérent (${input.issuingOrganism})`
        : `Organisme inhabituel pour ce diplôme (attendu : ${spec?.acceptedOrganisms.join(', ')})`,
    },
    {
      id: 'year_and_sport',
      label: 'Année d’obtention & cohérence discipline',
      passed: isYearPlausible && isSportConsistent,
      detail:
        isYearPlausible && isSportConsistent
          ? `Année ${input.issueYear} cohérente avec la spécialité déclarée.`
          : !isYearPlausible
            ? `Année (${input.issueYear}) hors plage plausible (1980–${currentYear}).`
            : 'Vérifier la correspondance entre la fédération du diplôme et la spécialité déclarée.',
    },
    {
      id: 'pro_card',
      label: 'Carte professionnelle & honorabilité (renouvellement 5 ans)',
      passed: isProCardValid,
      detail: isProCardValid
        ? `Carte pro ${proCardNum} valide jusqu’au ${input.proCardExpiry} · honorabilité attestée.`
        : 'Carte professionnelle expirée, absente ou attestation d’honorabilité non cochée.',
    },
    {
      id: 'rc_pro',
      label: 'Assurance Responsabilité Civile Pro (RC Pro)',
      passed: isRcProValid,
      detail: isRcProValid
        ? `${rcInsurer} · Police ${rcPolicy}`
        : 'Assureur ou numéro de police RC Pro manquant.',
    },
    {
      id: 'legal_status',
      label: 'Statut juridique & immatriculation (SIRET / NINEA / RNA)',
      passed: isLegalStatusValid,
      detail: isLegalStatusValid
        ? `${legalOpt!.label} · ${regNum}`
        : 'Statut juridique d’exercice ou numéro SIRET/NINEA incomplet.',
    },
  ];

  const weights = [20, 10, 15, 10, 10, 10, 10, 8, 7];
  const score = checks.reduce((acc, ch, idx) => acc + (ch.passed ? weights[idx] : 0), 0);

  let status: 'CONFORME_PRE_ETUDE' | 'A_VERIFIER' | 'ANOMALIE' = 'A_VERIFIER';
  if (!isFormatValid || !isSizeValid || !isUniqueHash) {
    status = 'ANOMALIE';
  } else if (score >= 85) {
    status = 'CONFORME_PRE_ETUDE';
  }

  return {
    score,
    status,
    report: {
      formatLabel: spec ? spec.label : input.diplomaType,
      detectedMime: input.detectedMime || 'application/octet-stream',
      isDuplicateHash: !isUniqueHash,
      checks,
    },
  };
}

export function storeCoachDiplomaDocument(input: DiplomaStudyInput): {
  docId: number;
  studyScore: number;
  studyStatus: 'CONFORME_PRE_ETUDE' | 'A_VERIFIER' | 'ANOMALIE';
} {
  const detectedMime = detectMimeFromMagicBytes(input.buffer);
  if (!detectedMime) {
    throw new Error('Format de document refusé : envoyez un véritable fichier PDF, JPG, PNG ou WEBP.');
  }
  if (input.buffer.length < 400 || input.buffer.length > MAX_DIPLOMA_FILE_BYTES) {
    throw new Error('La taille du document doit être comprise entre 400 octets et 3 Mo.');
  }

  const sha256Hash = crypto.createHash('sha256').update(input.buffer).digest('hex');
  const { score, status, report } = evaluateDiplomaDocument({
    diplomaType: input.diplomaType,
    issuingOrganism: input.issuingOrganism,
    diplomaNumber: input.diplomaNumber,
    issueYear: input.issueYear,
    specialite: input.specialite,
    qualification: input.qualification,
    originalFilename: input.originalFilename,
    detectedMime,
    fileSizeBytes: input.buffer.length,
    sha256Hash,
    excludeCoachUserId: input.coachUserId,
    proCardNumber: input.proCardNumber,
    proCardExpiry: input.proCardExpiry,
    rcProInsurer: input.rcProInsurer,
    rcProPolicyNumber: input.rcProPolicyNumber,
    legalStatus: input.legalStatus,
    businessRegNumber: input.businessRegNumber,
    honorabilityAttested: input.honorabilityAttested,
  });

  ensureUploadDir();
  const safeExt = extensionForMime(detectedMime);
  const storedFilename = `coach_${input.coachUserId}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}${safeExt}`;
  fs.writeFileSync(path.join(DIPLOMA_UPLOAD_DIR, storedFilename), input.buffer);
  void uploadDiplomaToSupabaseStorage(storedFilename, input.buffer, detectedMime);

  const safeOriginal = path.basename(input.originalFilename || `diplome${safeExt}`).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

  const res = db
    .prepare(
      `INSERT INTO coach_documents (
        coach_user_id, diploma_type, issuing_organism, diploma_number, issue_year,
        original_filename, stored_filename, mime_type, file_size_bytes, sha256_hash,
        study_score, study_status, study_report_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.coachUserId,
      input.diplomaType,
      input.issuingOrganism,
      input.diplomaNumber,
      input.issueYear,
      safeOriginal,
      storedFilename,
      detectedMime,
      input.buffer.length,
      sha256Hash,
      score,
      status,
      JSON.stringify(report)
    );

  return {
    docId: Number(res.lastInsertRowid),
    studyScore: score,
    studyStatus: status,
  };
}

export function buildSampleDiplomaPdfBuffer(title: string, subtitle: string, reference: string): Buffer {
  const clean = (txt: string) =>
    txt
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[()\\]/g, ' ');

  const streamContent = [
    'BT',
    '/F1 18 Tf',
    '56 760 Td',
    `(${clean(title)}) Tj`,
    '/F1 12 Tf',
    '0 -28 Td',
    `(${clean(subtitle)}) Tj`,
    '0 -22 Td',
    `(${clean(`Reference officielle : ${reference}`)}) Tj`,
    '0 -22 Td',
    '(Document justificatif depose sur Terrain+ pour verification administrative.) Tj',
    'ET',
  ].join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}
