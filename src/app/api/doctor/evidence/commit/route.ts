import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { recordAudit } from '@/lib/audit/auditService';
import { AppError, jsonError, jsonOk } from '@/lib/http/errors';
import { validateDoctorEvidence } from '@/lib/security/files';
import {
  deleteStorageObject,
  getSupabaseAdmin,
  readStorageFileHeader,
} from '@/lib/supabase/admin';

const commitSchema = z.object({
  storagePath: z.string().trim().min(5).max(300),
  originalName: z.string().trim().min(1).max(120),
  docType: z.enum(['professional_card', 'facility_proof', 'diploma', 'complement']).default('professional_card'),
});

export async function POST(req: Request) {
  try {
    const auth = await requireRole('doctor');
    const body = await req.json().catch(() => ({}));
    const parsed = commitSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError(400, 'INVALID_EVIDENCE_COMMIT', 'Paramètres justificatif invalides.');
    }

    if (!parsed.data.storagePath.startsWith(`doctors/${auth.user.id}/`) || parsed.data.storagePath.includes('..')) {
      throw new AppError(400, 'INVALID_STORAGE_PATH', 'Chemin de stockage invalide.');
    }

    const { headerBytes, totalBytes } = await readStorageFileHeader('doctor-evidence', parsed.data.storagePath);

    let validated;
    try {
      validated = validateDoctorEvidence(headerBytes, totalBytes, parsed.data.originalName);
    } catch (fileErr) {
      await deleteStorageObject('doctor-evidence', parsed.data.storagePath);
      const code = fileErr instanceof Error ? fileErr.message : 'UNSUPPORTED_FILE_TYPE';
      throw new AppError(
        code === 'FILE_TOO_LARGE' ? 413 : 400,
        code,
        'Format justificatif refusé (PDF, JPEG, PNG ou WebP ≤ 5 Mo uniquement).'
      );
    }

    const admin = getSupabaseAdmin();
    const { data: ev, error } = await admin
      .from('doctor_evidence')
      .insert({
        doctor_id: auth.user.id,
        doc_type: parsed.data.docType,
        original_name_safe: validated.safeName,
        mime_type: validated.mimeType,
        byte_size: totalBytes,
        storage_path: parsed.data.storagePath,
      })
      .select('*')
      .single();

    if (error || !ev) {
      throw new AppError(500, 'EVIDENCE_SAVE_FAILED', 'Impossible d’enregistrer le justificatif.');
    }

    const { data: doc } = await admin
      .from('doctor_profiles')
      .select('verification_status, facility_name')
      .eq('user_id', auth.user.id)
      .single();

    let nextStatus = doc?.verification_status || 'to_complete';
    let slaDueAt: string | null = null;
    if (nextStatus !== 'verified' && String(doc?.facility_name || '').trim().length >= 3) {
      const now = new Date();
      nextStatus = 'pending';
      slaDueAt = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();
      await admin
        .from('doctor_profiles')
        .update({
          verification_status: 'pending',
          verification_reason: null,
          submitted_at: now.toISOString(),
          sla_due_at: slaDueAt,
          updated_at: now.toISOString(),
        })
        .eq('user_id', auth.user.id);
    }

    await recordAudit({
      actorId: auth.user.id,
      actorRole: 'doctor',
      action: 'DOCTOR_EVIDENCE_UPLOADED',
      targetType: 'doctor_evidence',
      targetId: ev.id,
      metadata: { docType: parsed.data.docType, verificationStatus: nextStatus },
    });

    return jsonOk({ evidence: ev, verificationStatus: nextStatus, slaDueAt }, 201);
  } catch (err) {
    return jsonError(err);
  }
}
