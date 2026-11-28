import type { AuthContext } from '../auth/session';
import { AppError } from '../http/errors';
import { getSupabaseAdmin } from '../supabase/admin';

export interface CaseAccessResult {
  caseRow: Record<string, unknown>;
  accessType: 'athlete_owner' | 'assigned_doctor' | 'admin_exceptional_grant';
  grantExpiresAt?: string;
}

/**
 * Single server-side authorization gate for accessing any private consultation case.
 */
export async function assertCanAccessCase(
  auth: AuthContext,
  caseId: string,
  options: { allowExceptionalAdmin?: boolean } = {}
): Promise<CaseAccessResult> {
  const allowExceptionalAdmin = options.allowExceptionalAdmin ?? true;
  const admin = getSupabaseAdmin();

  const { data: caseRow, error } = await admin
    .from('cases')
    .select('*')
    .eq('id', caseId)
    .single();

  if (error || !caseRow) {
    throw new AppError(404, 'CASE_NOT_FOUND', 'Dossier introuvable.');
  }

  if (auth.user.role === 'athlete' && caseRow.athlete_id === auth.user.id) {
    return { caseRow, accessType: 'athlete_owner' };
  }

  if (auth.user.role === 'doctor' && caseRow.doctor_id === auth.user.id) {
    return { caseRow, accessType: 'assigned_doctor' };
  }

  if (auth.user.role === 'admin') {
    if (allowExceptionalAdmin) {
      const nowIso = new Date().toISOString();
      const { data: grant } = await admin
        .from('exceptional_access_grants')
        .select('id, expires_at')
        .eq('admin_id', auth.user.id)
        .eq('case_id', caseId)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (grant) {
        return {
          caseRow,
          accessType: 'admin_exceptional_grant',
          grantExpiresAt: grant.expires_at,
        };
      }
    }
    throw new AppError(
      403,
      'ADMIN_CASE_ACCESS_DENIED',
      'Les administrateurs n’ont pas accès par défaut aux dossiers et échanges médicaux.'
    );
  }

  throw new AppError(403, 'FORBIDDEN_CASE_ACCESS', 'Vous n’êtes pas autorisé à accéder à ce dossier.');
}
