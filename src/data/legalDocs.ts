export type LegalDocTab = 'confidentialite' | 'cgu' | 'cgv' | 'mentions';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocumentContent {
  id: LegalDocTab;
  tabLabel: string;
  title: string;
  subtitle: string;
  updatedAt: string;
  reference: string;
  sections: LegalSection[];
}

export const LEGAL_PLATFORM_META = {
  brand: 'Terrain+',
  domain: 'https://terrain-plus.vercel.app',
  founders: 'Ndeye Amy Kambaye & Mouhamadou Al Amin Ndiaye',
  institution: 'Université Iba Der Thiam de Thiès (UIDT), Sénégal',
  dpoContact: 'dpo@terrain-plus.sn',
  legalFramework: 'Loi n° 2008-12 du 25 janvier 2008 (CDP Sénégal)',
  effectiveDate: 'Novembre 2026 · Version 1.0',
} as const;

export const LEGAL_DOCUMENTS: Record<LegalDocTab, LegalDocumentContent> = {
  confidentialite: {
    id: 'confidentialite',
    tabLabel: 'Confidentialité (CDP)',
    title: 'Politique de confidentialité & Protection des données',
    subtitle:
      'Conformité à la Loi sénégalaise n° 2008-12 du 25 janvier 2008 et aux principes de la Commission de Protection des Données Personnelles (CDP Sénégal).',
    updatedAt: LEGAL_PLATFORM_META.effectiveDate,
    reference: 'Loi n° 2008-12 · CDP Sénégal',
    sections: [
      {
        heading: '1. Responsable du traitement',
        paragraphs: [
          `La plateforme ${LEGAL_PLATFORM_META.brand}, accessible à l'adresse officielle ${LEGAL_PLATFORM_META.domain}, est éditée par l'équipe fondatrice (${LEGAL_PLATFORM_META.founders}, ${LEGAL_PLATFORM_META.institution}).`,
          `Pour toute question relative à la protection de vos données personnelles ou à l'exercice de vos droits CDP, vous pouvez contacter le référent Données Personnelles : ${LEGAL_PLATFORM_META.dpoContact}.`,
        ],
      },
      {
        heading: '2. Données collectées (principe de minimisation)',
        paragraphs: [
          'Terrain+ collecte uniquement les données strictement nécessaires à la préparation physique encadrée et à la sécurité des comptes :',
        ],
        bullets: [
          'Identité & accès : nom, prénom, date de naissance, numéro de téléphone Sénégal (+221), adresse email, langue préférée (français / wolof), mot de passe chiffré (scrypt) et jetons OTP hachés.',
          'Données physiques & sportives (sensibles) : sport pratiqué, niveau, poste, taille, historique de poids, scores d’auto-évaluation et notes de ressenti (fatigue, difficulté).',
          'Protection des mineurs (< 18 ans) : nom et numéro de téléphone (+221) du parent ou tuteur légal obligatoires ; profil privé par défaut sans exposition publique.',
          'Dossier vérifié des coachs : spécialité, diplôme sportif, numéro de carte professionnelle et date d’expiration, assurance RC Pro, statut juridique (NINEA / RCCM / SIRET / RNA) et attestation d’honorabilité.',
          'Journaux de sécurité & audit : horodatage des consentements, journal des accès aux fiches sensibles (access_audit_logs) et compteurs techniques anti-abus (rate limiting).',
        ],
      },
      {
        heading: '3. Finalités, base légale et interdiction de revente',
        paragraphs: [
          'Le traitement repose sur le consentement explicite, libre et éclairé recueilli lors de l’inscription (article 33 de la Loi n° 2008-12) et sur l’exécution du suivi sportif demandé par l’utilisateur.',
          'Aucune donnée physique ou d’identité n’est cédée, louée ou vendue à des tiers publicitaires ou courtiers de données.',
        ],
      },
      {
        heading: '4. Sécurité, hébergement et sous-traitants techniques',
        paragraphs: [
          'Les communications transitent exclusivement sous chiffrement HTTPS/TLS sur https://terrain-plus.vercel.app avec en-têtes de sécurité stricts (CSP, HSTS, validation d’origine CSRF et sessions HttpOnly signées par HMAC-SHA256).',
          'L’application est hébergée sur l’infrastructure Edge & Serverless de Vercel Inc., et les données sont stockées sur PostgreSQL managé via Supabase avec contrôle d’accès Row Level Security (RLS) activé sur l’ensemble des tables et buckets privés pour les diplômes et vidéos. Lorsque le traitement technique implique un hébergement hors de l’espace CEDEAO, les données bénéficient de garanties techniques strictes (chiffrement en transit et au repos, cloisonnement par rôle, accès serveur uniquement).',
        ],
      },
      {
        heading: '5. Durée de conservation & traçabilité',
        paragraphs: [
          'Les données de suivi sportif sont conservées tant que le compte utilisateur est actif. Les jetons de session expirent automatiquement et sont révoqués immédiatement lors de la déconnexion ou d’un changement de mot de passe.',
          'En cas de suppression volontaire du compte depuis votre profil, l’ensemble de vos données personnelles, mesures, évaluations, séances et consentements sont supprimés en cascade de la base active.',
        ],
      },
      {
        heading: '6. Vos droits (CDP Sénégal — Loi n° 2008-12)',
        paragraphs: [
          'Conformément aux articles 62 et suivants de la Loi n° 2008-12, vous disposez à tout moment des droits suivants :',
        ],
        bullets: [
          'Droit d’accès et de portabilité : téléchargez l’intégralité de vos données au format structuré JSON directement depuis votre onglet Profil (« Exporter mes données »).',
          'Droit de rectification : modifiez vos informations sportives, préférences et langue depuis votre espace personnel.',
          'Droit d’opposition et d’effacement : supprimez définitivement votre compte et vos données à tout moment depuis la rubrique « Confidentialité et sécurité » (« Supprimer mon compte »).',
          'Droit de réclamation : en cas de difficulté non résolue, vous pouvez saisir la Commission de Protection des Données Personnelles (CDP Sénégal) à Dakar.',
        ],
      },
    ],
  },

  cgu: {
    id: 'cgu',
    tabLabel: 'CGU',
    title: 'Conditions Générales d’Utilisation (CGU)',
    subtitle: `Règles d’accès, clause non médicale et engagements éthiques sur ${LEGAL_PLATFORM_META.domain}.`,
    updatedAt: LEGAL_PLATFORM_META.effectiveDate,
    reference: 'Usage & Sécurité Terrain+',
    sections: [
      {
        heading: '1. Objet et champ d’application',
        paragraphs: [
          `Les présentes Conditions Générales d’Utilisation régissent l’accès et l’utilisation de la plateforme web et PWA Terrain+ (${LEGAL_PLATFORM_META.domain}) par les athlètes, coachs vérifiés et administrateurs autorisés.`,
          'La création d’un compte implique l’acceptation sans réserve des présentes CGU et de la Politique de confidentialité CDP Sénégal.',
        ],
      },
      {
        heading: '2. Clause essentielle de non-substitution médicale',
        paragraphs: [
          'Terrain+ est une plateforme de préparation physique générale, de régularité sportive et d’accompagnement pédagogique. Elle ne fournit aucun acte médical, diagnostic ou suivi clinique.',
        ],
      },
      {
        heading: '3. Règles applicables aux athlètes et aux mineurs',
        paragraphs: [
          'L’inscription est ouverte à partir de 12 ans avec renseignement exact de la date de naissance.',
        ],
        bullets: [
          'Tout athlète âgé de 12 à 17 ans doit fournir le nom complet et le numéro (+221) d’un parent ou représentant légal.',
          'Les identifiants, mots de passe et codes OTP à 6 chiffres sont strictement personnels et confidentiels.',
          'Les contenus vidéo, séances et évaluations mis à disposition ne doivent pas être redistribués commercialement sans autorisation.',
        ],
      },
      {
        heading: '4. Charte et vérification obligatoire des coachs',
        paragraphs: [
          'Tout éducateur ou préparateur physique souhaitant encadrer des athlètes sur Terrain+ doit obligatoirement :',
        ],
        bullets: [
          'Être âgé d’au moins 18 ans et déposer un justificatif officiel de diplôme ou brevet sportif, une carte professionnelle valide, une attestation d’assurance RC Pro et un numéro d’enregistrement légal (NINEA, RCCM, SIRET ou RNA).',
          'Signer numériquement l’attestation sur l’honneur d’honorabilité (absence de condamnation incompatible avec l’encadrement sportif et l’accompagnement de mineurs).',
          'Attendre la validation manuelle de son dossier par l’administrateur Terrain+ avant d’apparaître dans l’annuaire public ou d’accéder aux fiches d’athlètes.',
        ],
      },
      {
        heading: '5. Sécurité technique et usages prohibés',
        paragraphs: [
          'Il est strictement interdit de tenter de contourner les mécanismes d’authentification, de limitation de débit (rate limiting), d’isolation des données (RLS) ou de téléverser des fichiers falsifiés, malveillants ou contraires à la loi dans les dépôts de diplômes ou de vidéos.',
          'Tout manquement grave ou fausse déclaration entraîne la suspension ou clôture immédiate du compte concerné.',
        ],
      },
    ],
  },

  cgv: {
    id: 'cgv',
    tabLabel: 'CGV',
    title: 'Conditions Générales de Vente (CGV)',
    subtitle: 'Transparence tarifaire en Francs CFA (FCFA), formules athlètes, coachs et résiliation.',
    updatedAt: LEGAL_PLATFORM_META.effectiveDate,
    reference: 'Tarification FCFA · Droit sénégalais',
    sections: [
      {
        heading: '1. Formules destinées aux athlètes',
        paragraphs: ['Toutes les formules sont affichées en Francs CFA (XOF / FCFA) sans frais cachés :'],
        bullets: [
          'Essentiel (0 FCFA / mois) : accès au socle fondamental de séances FR/Wolof, suivi de poids, auto-évaluation de base et jusqu’à 2 séances hors ligne.',
          'Suivi Coach (5 000 FCFA / mois) : débloque l’intégralité des cycles spécialisés sur les 6 sports, le hors-ligne illimité ainsi que le rattachement à un coach vérifié avec messagerie directe et adaptation hebdomadaire.',
        ],
      },
      {
        heading: '2. Modèle économique pour les coachs vérifiés',
        paragraphs: ['L’inscription et l’accès à l’espace coach fonctionnent selon une règle unique et transparente :'],
        bullets: [
          'Coach Terrain+ (0 FCFA / mois fixe) : aucun abonnement fixe ; partage à 80 % pour le coach (4 000 FCFA) et 20 % de commission plateforme (1 000 FCFA) par athlète actif accompagné.',
        ],
      },
      {
        heading: '3. Changement de formule, résiliation et droit applicable',
        paragraphs: [
          'L’athlète peut à tout moment modifier sa formule ou revenir au palier gratuit Essentiel depuis son espace « Profil & Formule », sans pénalité de sortie.',
          'Les présentes CGV sont soumises au droit sénégalais et aux actes uniformes OHADA applicables. Tout différend fera l’objet d’une recherche prioritaire de règlement amiable avant saisine des juridictions compétentes du Sénégal.',
        ],
      },
    ],
  },

  mentions: {
    id: 'mentions',
    tabLabel: 'Mentions légales',
    title: 'Mentions légales',
    subtitle: `Identification de l’éditeur, de l’hébergement et du domaine officiel ${LEGAL_PLATFORM_META.domain}.`,
    updatedAt: LEGAL_PLATFORM_META.effectiveDate,
    reference: 'Éditeur & Hébergement',
    sections: [
      {
        heading: '1. Éditeur de la plateforme',
        paragraphs: [
          `Nom du service : ${LEGAL_PLATFORM_META.brand}`,
          `URL officielle : ${LEGAL_PLATFORM_META.domain}`,
          `Co-fondateurs et porteurs du projet : ${LEGAL_PLATFORM_META.founders}`,
          `Cadre académique et territorial initial : ${LEGAL_PLATFORM_META.institution}`,
          `Contact protection des données & support : ${LEGAL_PLATFORM_META.dpoContact}`,
        ],
      },
      {
        heading: '2. Hébergement et infrastructure cloud',
        paragraphs: [
          'Hébergement applicatif & diffusion CDN HTTPS : Vercel Inc. (440 N Barranca Ave #4133, Covina, CA 91723, États-Unis) — fonctions serverless et réseau Edge sécurisé.',
          'Base de données PostgreSQL & stockage privé des justificatifs : Supabase Inc. — base relationnelle chiffrée avec isolation Row Level Security (RLS) activée.',
        ],
      },
      {
        heading: '3. Propriété intellectuelle',
        paragraphs: [
          'L’architecture logicielle, les contenus rédactionnels, les guides d’exercices, les visuels anatomiques, les chartes graphiques et la marque Terrain+ sont protégés au titre de la propriété intellectuelle.',
          'Toute reproduction, extraction automatisée ou réutilisation commerciale sans accord écrit préalable des co-fondateurs est interdite.',
        ],
      },
      {
        heading: '4. Signalement et contact officiel',
        paragraphs: [
          `Pour signaler un contenu, une anomalie de sécurité ou exercer vos droits liés aux données personnelles (CDP Sénégal), écrivez à ${LEGAL_PLATFORM_META.dpoContact} ou utilisez les contrôles de confidentialité intégrés à votre espace personnel.`,
        ],
      },
    ],
  },
};
