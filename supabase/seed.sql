-- Seed SQL de référence : Spécialités officielles & Bibliothèque Prévention validée
-- Exécuter après 0001_initial_schema.sql dans Supabase SQL Editor (les comptes démo sont créés via npm run seed).

INSERT INTO public.specialties (slug, name, description, icon, is_active, sort_order)
VALUES
  ('medecine-du-sport', 'Médecine du sport', 'Suivi médical régulier, bilans d’aptitude, surcharge et prévention des blessures sportives.', 'activity', true, 1),
  ('traumatologie-orthopedie', 'Traumatologie & Orthopédie', 'Entorses, genou, cheville, épaule, fractures et traumatismes articulaires ou ligamentaires.', 'bone', true, 2),
  ('kinesitherapie-readaptation', 'Kinésithérapie & Réadaptation', 'Rééducation fonctionnelle, reprise progressive après blessure et travail de mobilité.', 'heart-pulse', true, 3),
  ('cardiologie-du-sport', 'Cardiologie du sport', 'Bilan cardiovasculaire à l’effort, essoufflement, palpitations et suivi d’endurance.', 'heart', true, 4),
  ('nutrition-sportive', 'Nutrition & Hydratation sportive', 'Récupération énergétique, hydratation en climat chaud, gestion du poids de forme.', 'apple', true, 5),
  ('medecine-generale-sportive', 'Médecine générale sportive', 'Première orientation médicale, fatigue persistante, suivi général du pratiquant.', 'stethoscope', true, 6)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order;

INSERT INTO public.prevention_articles (slug, category, title, summary, content, reviewer_name, is_published)
VALUES
  (
    'echauffement-progressif-appuis',
    'warmup',
    'Échauffement progressif avant séance et match',
    'Préparer les articulations, les muscles et le système cardiovasculaire avant l’intensité.',
    'Consacrez 10 à 15 minutes à une mise en train progressive : mobilité articulaire (chevilles, hanches, épaules), montée en température douce, puis déplacements dynamiques adaptés à votre sport. Ce repère éducatif général ne remplace pas l’avis d’un professionnel de santé.',
    'Dr. Cheikh Fall (Relecteur médical)',
    true
  ),
  (
    'recuperation-sommeil-charge',
    'recovery',
    'Récupération et gestion de la charge hebdomadaire',
    'Repérer les signes de fatigue cumulative entre deux entraînements ou matchs.',
    'Alterner séances intenses et journées de récupération active aide à limiter les douleurs de surcharge. Un sommeil suffisant (7 à 9 h) et un suivi régulier de votre fatigue perçue permettent d’adapter votre volume avec votre médecin si une gêne s’installe.',
    'Dr. Abdoulaye Diop (Relecteur médical)',
    true
  ),
  (
    'mobilite-chevilles-hanches',
    'mobility',
    'Mobilité chevilles, genoux et hanches pour sports de pivot',
    'Améliorer le contrôle des réceptions et changements de direction.',
    'Des exercices réguliers de mobilité de cheville et de stabilité de hanche participent au confort lors des sauts et pivots. En cas de douleur aiguë, de blocage ou de gonflement, cessez l’exercice et consultez un médecin vérifié.',
    'Dr. Mariama Sarr (Relecteur médical)',
    true
  ),
  (
    'hydratation-climat-chaud-senegal',
    'hydration',
    'Hydratation et prévention des crampes en climat chaud',
    'Adapter les apports hydriques avant, pendant et après l’effort au Sénégal.',
    'La chaleur et l’humidité augmentent les pertes en eau et en électrolytes. Buvez régulièrement par petites gorgées avant la sensation de soif, fractionnez les pauses lors des séances en plein air et surveillez tout signe d’étourdissement.',
    'Dr. Cheikh Fall (Relecteur médical)',
    true
  ),
  (
    'basketball-receptions-et-chocs',
    'basketball',
    'Basketball : réceptions de saut, doigts et vigilance choc à la tête',
    'Conseils généraux spécifiques au basketball sur sol dur et contacts.',
    'En basketball, les réceptions après rebond et les contacts sollicitent particulièrement les chevilles, les genoux et les doigts. En cas de choc à la tête ou de suspicion de commotion, arrêtez immédiatement le jeu et demandez une évaluation médicale sans reprendre le jour même.',
    'Dr. Mariama Sarr (Relecteur médical)',
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content = EXCLUDED.content,
  reviewer_name = EXCLUDED.reviewer_name,
  is_published = true;
