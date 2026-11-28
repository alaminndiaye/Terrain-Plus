# Terrain+ — Plateforme de suivi médical sportif (18+)

Application full-stack **Next.js 15 (App Router, TypeScript, Tailwind CSS v4)** connectée à **Supabase** (PostgreSQL + Auth + Storage privé + Realtime) et prête pour un déploiement **Vercel + GitHub**.

## Fonctionnalités clés

- **Public adulte uniquement (18+)** : contrôle strict de majorité à l'inscription et lors de l'onboarding sportif.
- **Vérification SMS OTP bloquante** : code 6 chiffres haché, expiration 10 min, limitation à 5 tentatives + anti-spam par numéro/IP.
- **Parcours sportif complet** :
  - Onboarding obligatoire (sport(s), niveau, fréquence, antécédents, consentement santé séparé).
  - Recherche de médecins vérifiés par spécialité médicale.
  - Paiement fixe **10 000 FCFA TTC** par consultation (9 000 FCFA net médecin / 1 000 FCFA commission 10 %).
  - Messagerie temps réel, partage sécurisé d'images/vidéos/PDF (URLs signées + vérification magic bytes), prise de rendez-vous et téléconsultation **Visio WebRTC** intégrée.
  - **Suivi & prévention** (`/sportif/suivi`) : journal d'entraînement & match manuel, graphiques Recharts, signaux de vigilance non diagnostiques, bibliothèque de contenus validés, partage sélectif vers le médecin sur consentement, parcours de retour après blessure contrôlé par le médecin.
  - Notation (1–5★ + commentaire) débloquée après clôture de consultation.
- **Parcours médecin & communauté confraternelle** :
  - Dossier de vérification manuelle (SLA cible 72h) avec pièces justificatives privées.
  - Agenda / créneaux, revenus, dossier médical longitudinal inter-praticiens obligatoirement mis à jour avant toute clôture.
  - Transfert sans consultation préalable avec réattribution atomique du paiement de 10 000 FCFA vers le confrère receveur.
  - **Forum médical anonymisé** (`/medecin/forum`) et **messagerie privée entre confrères vérifiés** (`/medecin/confreres`).
- **Portail administrateur** (`/admin`) : file de vérification 72h, gestion spécialités & fiches prévention, reversements et litiges > 48h, modération des avis/forum, suspension de comptes, audit immuable et accès exceptionnel justifié de 15 minutes.

## Architecture & déploiement (GitHub + Vercel + Supabase Cloud)

### 1. Préparer Supabase Cloud
1. Créez un projet sur [Supabase](https://supabase.com/).
2. Exécutez la migration [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) dans le SQL Editor (ou via `supabase db push`).
3. Exécutez les données de référence [`supabase/seed.sql`](supabase/seed.sql) (spécialités médicales et articles de prévention).
4. (Optionnel pour environnement de démo/test) Lancez `npx tsx scripts/seed-supabase.ts` après avoir renseigné `.env.local` pour créer des comptes de démonstration (sportifs, médecins vérifiés/en attente, administrateur).

### 2. Variables d'environnement
Copiez `.env.example` vers `.env.local` (en local) et configurez les variables suivantes sur **Vercel** :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DATA_ENCRYPTION_KEY` (32+ caractères ou 64 hex pour AES-256-GCM des données de santé)
- `SESSION_SECRET` (secret HMAC long pour empreintes OTP)
- `PAYMENT_WEBHOOK_SECRET` (secret HMAC SHA-256 des webhooks PSP)
- Optionnels : `TWILIO_*` / fournisseur SMS, `WEBRTC_ICE_SERVERS_JSON` (TURN production), `NEXT_PUBLIC_ENABLE_DEMO_CONTROLS=false` en production.

### 3. Commandes locales

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run dev
```
