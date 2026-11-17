# Terrain+

Plateforme de préparation physique, de prévention des blessures et de suivi sportif destinée aux athlètes amateurs (Football, Basket-ball, Handball), coachs et partenaires (ASC, campus universitaires et ligues).

## Fonctionnalités principales

- **Espace Athlète** : tableau de bord sportif adaptatif, statistiques d'entraînement hebdomadaires, vue calendrier des séances passées et programmées, lecteur de séance guidée (consignes français/wolof, variantes, signaux sonores, fonctionnement hors ligne), auto-évaluation chronométrée et signalement de douleur.
- **Espace Coach** : suivi de la charge et des alertes des athlètes affectés, ajustement daté des programmes hebdomadaires, commentaires sur les évaluations et proposition de séances soumises à validation.
- **Espace Administrateur** : gestion des utilisateurs et affectations coach-athlète, circuit de validation des séances (`BROUILLON` -> `EN_RELECTURE` -> `VALIDEE`), suivi des partenaires/défis et journal d'audit des accès aux données sensibles.
- **Sécurité et confidentialité** : authentification par mot de passe (`scrypt`) ou code OTP, jetons de session signés HMAC-SHA256 en cookie `HttpOnly`, contrôle d'accès par rôle et affectation, consentement parental obligatoire pour les mineurs, export JSON et suppression de compte.

## Stack technique

- **Frontend** : React 19, TypeScript, Tailwind CSS v4, Recharts, Lucide React, Vite + PWA (`vite-plugin-pwa`).
- **Backend** : Node.js 22+, Express, SQLite (`better-sqlite3` en mode WAL).

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

## Variables d'environnement

Voir `.env.example` :

- `APP_URL` : URL de l'application.
- `SESSION_SECRET` : clé secrète HMAC pour signer les jetons de session.
- `DB_PATH` : chemin vers le fichier SQLite (par défaut `./terrain_plus.db`).
