import { getSupabaseAdmin } from '../supabase/admin';

/**
 * Whitelist of neutral notification labels.
 * Medical symptoms, diagnoses, or private conversation excerpts are strictly forbidden.
 */
export const NEUTRAL_TEMPLATES = {
  case_update: {
    title: 'Terrain+ — Mise à jour de dossier',
    body: 'Vous avez une mise à jour concernant votre consultation sur Terrain+.',
  },
  message_received: {
    title: 'Terrain+ — Nouveau message',
    body: 'Un nouveau message vous attend dans votre espace sécurisé.',
  },
  appointment_updated: {
    title: 'Terrain+ — Rendez-vous',
    body: 'Un créneau de rendez-vous a été proposé ou confirmé dans votre espace.',
  },
  verification_updated: {
    title: 'Terrain+ — Vérification professionnelle',
    body: 'Le statut de vérification de votre dossier médecin a été mis à jour.',
  },
  referral_proposed: {
    title: 'Terrain+ — Action attendue',
    body: 'Une proposition d’orientation nécessite votre réponse dans votre espace.',
  },
  contact_verification: {
    title: 'Terrain+ — Vérification téléphone',
    body: 'Un code de vérification temporaire a été généré pour votre compte.',
  },
} as const;

export type NeutralTemplateKey = keyof typeof NEUTRAL_TEMPLATES;

const FORBIDDEN_MEDICAL_PATTERN =
  /\b(genou|cheville|tête|commotion|douleur|entorse|fracture|ligament|sang|vomissement|symptôme|diagnostic|ordonnance|épaule|dos|poignet)\b/i;

export function assertNeutralNotificationText(title: string, body: string): void {
  if (FORBIDDEN_MEDICAL_PATTERN.test(title) || FORBIDDEN_MEDICAL_PATTERN.test(body)) {
    throw new Error('Blocked unsafe notification containing potential medical details');
  }
}

export async function sendNeutralNotification(params: {
  userId: string;
  channel?: 'push' | 'sms' | 'email';
  templateKey: NeutralTemplateKey;
  targetRef?: string | null;
}) {
  const tpl = NEUTRAL_TEMPLATES[params.templateKey] || NEUTRAL_TEMPLATES.case_update;
  assertNeutralNotificationText(tpl.title, tpl.body);

  const admin = getSupabaseAdmin();
  await admin.from('notifications').insert({
    user_id: params.userId,
    channel: params.channel ?? 'push',
    title: tpl.title,
    body: tpl.body,
    target_ref: params.targetRef ?? null,
  });
}
