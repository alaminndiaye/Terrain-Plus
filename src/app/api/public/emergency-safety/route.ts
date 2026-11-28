import { jsonOk } from '@/lib/http/errors';

export async function GET() {
  return jsonOk({
    title: 'Vigilance médicale & situations d’urgence sportive',
    banner: 'NE PAS ATTENDRE UNE RÉPONSE DE MESSAGERIE EN CAS D’URGENCE',
    guidance: [
      'Arrêtez immédiatement toute activité physique en cas de choc à la tête, perte de connaissance, douleur thoracique à l’effort, essoufflement anormal ou malaise.',
      'Pour un choc à la tête suspecté, ne reprenez jamais le jeu le jour même sans évaluation médicale complète.',
      'En présence de signes d’alerte (confusion, vomissements, maux de tête intenses, troubles de l’équilibre/vision, douleur thoracique), orientez immédiatement vers les urgences médicales locales plutôt que d’utiliser une consultation en ligne.',
    ],
    emergencyContacts: [
      { label: 'SAMU Sénégal (urgence médicale)', value: '1515 (à vérifier selon localité avant déploiement)' },
      { label: 'Sapeurs-Pompiers Sénégal', value: '18' },
    ],
    disclaimer:
      'Cette plateforme ne pose aucun diagnostic automatisé et ne délivre jamais d’autorisation automatique de reprise sportive.',
  });
}
