import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH || './terrain_plus.db';

export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      telephone TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ATHLETE', 'COACH', 'ADMIN', 'MINISTRE')),
      date_naissance TEXT NOT NULL,
      langue TEXT NOT NULL DEFAULT 'fr' CHECK(langue IN ('fr', 'wo')),
      statut TEXT NOT NULL DEFAULT 'INSCRIT' CHECK(statut IN ('INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE')),
      is_minor INTEGER NOT NULL DEFAULT 0,
      parental_consent_name TEXT,
      parental_consent_phone TEXT,
      verified INTEGER NOT NULL DEFAULT 0,
      otp_code_hash TEXT,
      otp_expires_at TEXT,
      otp_attempts INTEGER NOT NULL DEFAULT 0,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS consents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      version TEXT NOT NULL,
      accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS athlete_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball')),
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      taille_cm INTEGER,
      poste TEXT,
      objectif TEXT,
      eco_data_mode INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      poids_kg REAL NOT NULL,
      date TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coaches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      specialite TEXT NOT NULL,
      qualification TEXT NOT NULL,
      zone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date_debut TEXT NOT NULL,
      date_fin TEXT,
      statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK(statut IN ('ACTIF', 'TERMINE'))
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ASC', 'CAMPUS', 'LIGUE')),
      zone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nom TEXT NOT NULL,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      captain_name TEXT NOT NULL,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball'))
    );

    CREATE TABLE IF NOT EXISTS group_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, group_id)
    );

    CREATE TABLE IF NOT EXISTS challenges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
      titre TEXT NOT NULL,
      indicateur TEXT NOT NULL,
      periode TEXT NOT NULL,
      target_sessions INTEGER NOT NULL,
      current_sessions INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball')),
      titre TEXT NOT NULL,
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      duree_min INTEGER NOT NULL,
      objectif TEXT NOT NULL,
      prevention_focus TEXT NOT NULL,
      relue_par TEXT,
      validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK(validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
      proposee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      exercises_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball')),
      date_debut TEXT NOT NULL,
      duree_semaines INTEGER NOT NULL DEFAULT 4,
      objectif TEXT NOT NULL,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS scheduled_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES program_plans(id) ON DELETE CASCADE,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES sessions_library(id) ON DELETE SET NULL,
      jour_semaine INTEGER NOT NULL CHECK(jour_semaine BETWEEN 1 AND 7),
      date_prevue TEXT NOT NULL,
      is_rest_day INTEGER NOT NULL DEFAULT 0,
      ajustee_par_coach INTEGER NOT NULL DEFAULT 0,
      motif_ajustement TEXT,
      date_ajustement TEXT,
      completed INTEGER NOT NULL DEFAULT 0,
      ressenti_fatigue INTEGER,
      difficulte INTEGER,
      qualite_sommeil INTEGER,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('INITIALE', 'PERIODIQUE')),
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball')),
      date TEXT NOT NULL,
      score_global INTEGER NOT NULL,
      results_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coach_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coach_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      evaluation_id INTEGER NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
      texte TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('DOULEUR', 'ABSENCE', 'RAPPEL', 'CHANGEMENT_COACH')),
      zone_douleur TEXT,
      intensite INTEGER,
      message TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (datetime('now')),
      traitee INTEGER NOT NULL DEFAULT 0,
      traitee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      note_traitement TEXT
    );

    CREATE TABLE IF NOT EXISTS access_audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL,
      athlete_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organisation TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('ASC', 'CAMPUS', 'LIGUE')),
      zone TEXT NOT NULL,
      contact_nom TEXT NOT NULL,
      contact_telephone TEXT NOT NULL,
      contact_email TEXT,
      sport_principal TEXT,
      nombre_athletes_estime INTEGER,
      message TEXT,
      statut TEXT NOT NULL DEFAULT 'NOUVELLE' CHECK(statut IN ('NOUVELLE', 'EN_ETUDE', 'VALIDEE')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe idempotent column migrations for existing databases
  const userCols = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
  const colNames = new Set(userCols.map((c) => c.name));
  if (!colNames.has('otp_attempts')) {
    db.exec('ALTER TABLE users ADD COLUMN otp_attempts INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('failed_login_attempts')) {
    db.exec('ALTER TABLE users ADD COLUMN failed_login_attempts INTEGER NOT NULL DEFAULT 0;');
  }
  if (!colNames.has('locked_until')) {
    db.exec('ALTER TABLE users ADD COLUMN locked_until TEXT;');
  }

  // Safe idempotent role CHECK constraint migration to include MINISTRE
  const usersSqlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get() as { sql: string } | undefined;
  if (usersSqlRow && !usersSqlRow.sql.includes("'MINISTRE'")) {
    db.pragma('foreign_keys = OFF');
    const migrateUsers = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          nom TEXT NOT NULL,
          prenom TEXT NOT NULL,
          telephone TEXT NOT NULL UNIQUE,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('ATHLETE', 'COACH', 'ADMIN', 'MINISTRE')),
          date_naissance TEXT NOT NULL,
          langue TEXT NOT NULL DEFAULT 'fr' CHECK(langue IN ('fr', 'wo')),
          statut TEXT NOT NULL DEFAULT 'INSCRIT' CHECK(statut IN ('INSCRIT', 'ACTIF', 'SUIVI_ACTIF', 'EN_PAUSE', 'CLOTURE')),
          is_minor INTEGER NOT NULL DEFAULT 0,
          parental_consent_name TEXT,
          parental_consent_phone TEXT,
          verified INTEGER NOT NULL DEFAULT 0,
          otp_code_hash TEXT,
          otp_expires_at TEXT,
          otp_attempts INTEGER NOT NULL DEFAULT 0,
          failed_login_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO users_new (
          id, nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
          statut, is_minor, parental_consent_name, parental_consent_phone, verified,
          otp_code_hash, otp_expires_at, otp_attempts, failed_login_attempts, locked_until, created_at
        )
        SELECT
          id, nom, prenom, telephone, email, password_hash, role, date_naissance, langue,
          statut, is_minor, parental_consent_name, parental_consent_phone, verified,
          otp_code_hash, otp_expires_at, otp_attempts, failed_login_attempts, locked_until, created_at
        FROM users;

        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    migrateUsers();
    db.pragma('foreign_keys = ON');
  }
}

export function logAccess(
  actorUserId: number | null,
  actorRole: string,
  athleteUserId: number | null,
  action: string,
  resource: string
): void {
  db.prepare(
    `INSERT INTO access_audit_logs (actor_user_id, actor_role, athlete_user_id, action, resource)
     VALUES (?, ?, ?, ?, ?)`
  ).run(actorUserId, actorRole, athleteUserId, action, resource);
}
