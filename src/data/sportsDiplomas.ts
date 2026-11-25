import type { SportCode } from '../types';

export type DiplomaTypeCode =
  | 'BPJEPS_DEJEPS'
  | 'STAPS_LICENCE_MASTER'
  | 'CQP_ALS_FITNESS'
  | 'CNEPS_BREVET'
  | 'LICENCE_CAF_FSF'
  | 'BREVET_FIBA_FSBB'
  | 'BREVET_IHF_FSHB'
  | 'DIPLOME_FIVB_FSVB'
  | 'CERTIFICAT_IAA_CAA_FSA'
  | 'PREPARATEUR_PHYSIQUE_CERT';

export type CoachLegalStatusCode =
  | 'MICRO_ENTREPRISE'
  | 'ENTREPRISE_INDIVIDUELLE'
  | 'SOCIETE_SASU_EURL'
  | 'ASSOCIATION_SALARIE';

export const COACH_LEGAL_STATUS_OPTIONS: Array<{
  code: CoachLegalStatusCode;
  label: string;
  idHint: string;
}> = [
  {
    code: 'MICRO_ENTREPRISE',
    label: 'Micro-entreprise / Auto-entrepreneur',
    idHint: 'N° SIRET ou récépissé auto-entrepreneur',
  },
  {
    code: 'ENTREPRISE_INDIVIDUELLE',
    label: 'Entreprise Individuelle / NINEA',
    idHint: 'N° NINEA ou Registre du Commerce',
  },
  {
    code: 'SOCIETE_SASU_EURL',
    label: 'Société (SASU / EURL / SARL)',
    idHint: 'N° SIRET / NINEA / RCCM de la société',
  },
  {
    code: 'ASSOCIATION_SALARIE',
    label: 'Association / Club / Éducateur salarié',
    idHint: 'N° RNA / récépissé club ou employeur',
  },
];

export interface SportDiplomaFormatSpec {
  code: DiplomaTypeCode;
  label: string;
  acceptedOrganisms: string[];
  formatExample: string;
  numberPattern: RegExp;
  relatedSports: SportCode[] | 'ALL';
  summary: string;
}

export const ACCEPTED_DIPLOMA_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const MAX_DIPLOMA_FILE_BYTES = 3 * 1024 * 1024; // 3 Mo

export const SPORT_DIPLOMA_FORMATS: Record<DiplomaTypeCode, SportDiplomaFormatSpec> = {
  BPJEPS_DEJEPS: {
    code: 'BPJEPS_DEJEPS',
    label: 'BPJEPS / DEJEPS / DESJEPS (AF, APT, Sports Co · État)',
    acceptedOrganisms: ['Ministère des Sports', 'DRAJES', 'CREPS', 'INSEP'],
    formatExample: 'Ex : BPJEPS-AF-2023-4410 ou DEJEPS/DRAJES/2022/109',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: 'ALL',
    summary: "Brevet ou diplôme d'État ouvrant droit à l'obtention de la carte professionnelle d'éducateur sportif.",
  },
  STAPS_LICENCE_MASTER: {
    code: 'STAPS_LICENCE_MASTER',
    label: 'Licence / Master STAPS (INSEPS, UGB, UIDT, UFR STAPS)',
    acceptedOrganisms: ['INSEPS Dakar', 'Université Iba Der Thiam', 'UGB Saint-Louis', 'UCAD', 'UFR STAPS', 'DRAJES', 'CAMES'],
    formatExample: 'Ex : STAPS-INSEPS-2022-0418 ou UIDT/STAPS/2023/114',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: 'ALL',
    summary: 'Diplôme universitaire reconnu en entraînement sportif et sciences des activités physiques.',
  },
  CQP_ALS_FITNESS: {
    code: 'CQP_ALS_FITNESS',
    label: 'CQP ALS / Instructeur Fitness (Qualification Pro)',
    acceptedOrganisms: ['CPNEF Sport', 'Ministère des Sports', 'DRAJES', 'Fédération Sportive'],
    formatExample: 'Ex : CQP-ALS-2023-204 ou CQP/IF/2022/81',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: 'ALL',
    summary: 'Certificat de Qualification Professionnelle reconnu pour l’animation et la préparation physique.',
  },
  CNEPS_BREVET: {
    code: 'CNEPS_BREVET',
    label: "Diplôme d'État / Maître EPS (CNEPS Thiès · MJS)",
    acceptedOrganisms: ['CNEPS Thiès', 'Ministère des Sports', 'MJS Sénégal', 'ENF'],
    formatExample: 'Ex : CNEPS-BE1-2021-089 ou MJS/EPS/2020/312',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: 'ALL',
    summary: "Brevet d'État ou diplôme d'éducateur sportif délivré par le CNEPS ou le Ministère des Sports.",
  },
  LICENCE_CAF_FSF: {
    code: 'LICENCE_CAF_FSF',
    label: 'Licence Entraîneur CAF / FSF (D, C, B, A, Pro)',
    acceptedOrganisms: ['FSF', 'CAF', 'DTN Football Sénégal', 'Ligue Régionale'],
    formatExample: 'Ex : CAF-C-SN-2023-1042 ou FSF/DTN/B/2022/55',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: ['football'],
    summary: 'Certification fédérale officielle de football délivrée par la FSF sous l’égide de la CAF.',
  },
  BREVET_FIBA_FSBB: {
    code: 'BREVET_FIBA_FSBB',
    label: 'Brevet Entraîneur FIBA / FSBB (Niveaux 1 à 3)',
    acceptedOrganisms: ['FSBB', 'FIBA Afrique', 'FIBA', 'DTN Basket'],
    formatExample: 'Ex : FIBA-L1-SN-2022-214 ou FSBB/ENT/2023/77',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: ['basket'],
    summary: 'Brevet fédéral d’encadrement basketball validé par la FSBB ou FIBA Afrique.',
  },
  BREVET_IHF_FSHB: {
    code: 'BREVET_IHF_FSHB',
    label: 'Diplôme Entraîneur IHF / FSHB (Handball)',
    acceptedOrganisms: ['FSHB', 'CAHB', 'IHF', 'DTN Handball'],
    formatExample: 'Ex : IHF-D-SN-2023-061 ou FSHB/2022/18',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: ['handball'],
    summary: 'Qualification technique handball certifiée par la FSHB, la CAHB ou l’IHF.',
  },
  DIPLOME_FIVB_FSVB: {
    code: 'DIPLOME_FIVB_FSVB',
    label: 'Certificat Entraîneur FIVB / FSVB (Volleyball)',
    acceptedOrganisms: ['FSVB', 'CAVB', 'FIVB', 'DTN Volleyball'],
    formatExample: 'Ex : FIVB-L1-SN-2023-034 ou FSVB/2022/91',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: ['volleyball'],
    summary: 'Diplôme d’entraîneur de volleyball niveau national ou international FIVB.',
  },
  CERTIFICAT_IAA_CAA_FSA: {
    code: 'CERTIFICAT_IAA_CAA_FSA',
    label: 'Certificat World Athletics / CAA / FSA (Athlétisme)',
    acceptedOrganisms: ['FSA', 'CAA', 'World Athletics', 'Centre de Développement Dakar'],
    formatExample: 'Ex : WA-L1-SN-2022-145 ou FSA/2023/42',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: ['athletisme'],
    summary: 'Certification officielle sprint, demi-fond, sauts ou haies World Athletics / FSA.',
  },
  PREPARATEUR_PHYSIQUE_CERT: {
    code: 'PREPARATEUR_PHYSIQUE_CERT',
    label: 'DU / Certificat Préparation Physique',
    acceptedOrganisms: ['INSEPS Dakar', 'CNEPS Thiès', 'Université', 'Fédération Nationale'],
    formatExample: 'Ex : DU-PP-2023-019 ou CERT-PREPA-2022-88',
    numberPattern: /^[A-Z0-9][A-Z0-9/\-_]{3,39}$/i,
    relatedSports: 'ALL',
    summary: 'Diplôme universitaire ou fédéral dédié à la préparation physique et à l’encadrement sportif.',
  },
};

export const SPORT_DIPLOMA_LIST: SportDiplomaFormatSpec[] = Object.values(SPORT_DIPLOMA_FORMATS);
