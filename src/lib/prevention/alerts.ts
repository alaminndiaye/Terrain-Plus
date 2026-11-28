import type { PreventionSignal, TrainingLog } from '../types';

const NON_DIAGNOSTIC_DISCLAIMER =
  'Signal préventif non médical : ce repère repose uniquement sur vos déclarations et ne constitue ni un diagnostic ni une prédiction de blessure.';

/**
 * Deterministic, explainable rule engine producing preventive vigilance signals from training logs.
 * Never diagnoses, predicts injury, or clears return-to-sport.
 */
export function evaluatePreventionSignals(logs: TrainingLog[]): PreventionSignal[] {
  if (!logs.length) return [];

  const sorted = [...logs].sort((a, b) => b.session_date.localeCompare(a.session_date));
  const nowRef = new Date(sorted[0].session_date).getTime();
  const last7Days = sorted.filter((l) => {
    const diffDays = (nowRef - new Date(l.session_date).getTime()) / 86400000;
    return diffDays >= 0 && diffDays <= 7;
  });

  const signals: PreventionSignal[] = [];

  // Rule 1: Repeated discomfort on the same body part within 7 days (>= 2 sessions)
  const discomfortByPart = new Map<string, number>();
  for (const log of last7Days) {
    if (log.has_discomfort && log.discomfort_level >= 2) {
      const key = log.body_part || 'autre';
      discomfortByPart.set(key, (discomfortByPart.get(key) || 0) + 1);
    }
  }
  for (const [part, count] of discomfortByPart.entries()) {
    if (count >= 2) {
      signals.push({
        id: `discomfort_${part}`,
        severity: 'attention',
        title: 'Gêne signalée à plusieurs reprises cette semaine',
        message: `Vous avez signalé une gêne (${part.replace(/_/g, ' ')}) lors de ${count} séances sur les 7 derniers jours. Pensez à réduire l’intensité, consulter nos fiches de récupération ou demander l’avis d’un médecin / kinésithérapeute.`,
        disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
        recommendedCategory: 'recovery',
        suggestedBodyPart: part,
      });
    }
  }

  // Rule 2: Rising declared fatigue over 3+ consecutive recent sessions
  if (sorted.length >= 3) {
    const [latest, prev1, prev2] = sorted;
    if (
      latest.fatigue_score >= 4 &&
      latest.fatigue_score >= prev1.fatigue_score &&
      prev1.fatigue_score >= prev2.fatigue_score &&
      latest.fatigue_score > prev2.fatigue_score
    ) {
      signals.push({
        id: 'rising_fatigue',
        severity: 'attention',
        title: 'Fatigue déclarée en augmentation',
        message:
          'Votre fatigue déclarée augmente depuis vos dernières séances. Privilégiez une séance de récupération, veillez à votre sommeil et demandez un avis médical si la fatigue persiste.',
        disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
        recommendedCategory: 'hydration',
      });
    }
  }

  // Rule 3: Low recovery + high intensity combination in recent sessions
  const highStrainCount = last7Days.filter(
    (l) => l.rpe_intensity >= 8 && l.recovery_score <= 2
  ).length;
  if (highStrainCount >= 2) {
    signals.push({
      id: 'high_load_low_recovery',
      severity: 'info',
      title: 'Charge élevée avec récupération perçue faible',
      message:
        'Plusieurs séances intenses ont été enregistrées avec un ressenti de récupération bas. Alléger temporairement la charge et soigner l’échauffement et l’hydratation peut aider.',
      disclaimer: NON_DIAGNOSTIC_DISCLAIMER,
      recommendedCategory: 'warmup',
    });
  }

  return signals;
}

export function detectHeadTraumaKeywords(text: string): boolean {
  return /\b(tête|commotion|perte de connaissance|vertige|nausée|vomissement|choc cr[aâ]nien|vision trouble)\b/i.test(
    String(text || '')
  );
}
