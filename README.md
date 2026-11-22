# Terrain+

Plateforme de préparation physique, de prévention des blessures et de suivi sportif destinée aux athlètes amateurs (Football, Basket-ball, Handball, Volleyball, Athlétisme), coachs et partenaires (ASC, campus universitaires et ligues).

## Fonctionnalités principales

- **Espace Athlète** : tableau de bord sportif adaptatif, statistiques d'entraînement hebdomadaires, vue calendrier des séances passées et programmées, lecteur de séance guidée (consignes français/wolof, variantes, signaux sonores, fonctionnement hors ligne), auto-évaluation chronométrée et signalement de douleur.
- **Espace Coach** : suivi de la charge et des alertes des athlètes affectés, ajustement daté des programmes hebdomadaires, commentaires sur les évaluations, mise en ligne de vidéos de séances et proposition de séances soumises à validation.
- **Espace Administrateur** : gestion des utilisateurs et affectations coach-athlète, vérification des diplômes et pièces réglementaires des coachs, circuit de validation des séances (`BROUILLON` -> `EN_RELECTURE` -> `VALIDEE`), suivi des partenaires/défis et journal d'audit des accès aux données sensibles.
- **Observatoire Ministériel** : vue strictement agrégée (zéro donnée personnelle) sur l'assiduité, la couverture territoriale et la conformité prévention/mineurs.
- **Sécurité et confidentialité** : authentification par mot de passe (`scrypt`) ou code OTP (Email/SMS réel), jetons de session signés HMAC-SHA256 en cookie `HttpOnly`, contrôle d'accès par rôle et affectation, consentement parental obligatoire pour les mineurs, export JSON et suppression de compte.

## Stack technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide React, Vite + PWA (`vite-plugin-pwa`).
- **Backend** : Node.js 22+, Express, PostgreSQL (Supabase en production) ou SQLite (`better-sqlite3` en local).

## Installation et lancement

```bash
npm install
cp .env.example .env
npm run dev
```

L'application est servie sur `http://localhost:3000`.

### Scripts disponibles

- `npm run dev` : lance le serveur Express avec Vite en mode développement.
- `npm run build` : compile l'interface client dans `dist/`.
- `npm run start` : démarre le serveur en production (`node server.ts`, nécessite Node 22+).
- `npm run lint` : vérifie le typage TypeScript (`tsc --noEmit`).

## Variables d'environnement principales

Voir `.env.example` :

- `APP_URL` : URL publique de l'application (`https://...` en production).
- `SESSION_SECRET` : clé secrète HMAC aléatoire pour signer les jetons de session.
- `DATABASE_URL` / `DIRECT_URL` : chaînes de connexion PostgreSQL Supabase (ou `DB_PATH` pour SQLite local).
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, `SUPABASE_VIDEO_BUCKET` : stockage privé des diplômes et vidéos coach.
- `RESEND_API_KEY`, `OTP_FROM_EMAIL` (ou `OTP_WEBHOOK_URL`) : transport transactionnel réel pour l'envoi des codes OTP.
- `BOOTSTRAP_ADMIN_*` et `BOOTSTRAP_MINISTER_*` : identifiants initiaux de création des comptes Admin et Ministère au premier démarrage.
