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
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      taille_cm INTEGER,
      poste TEXT,
      objectif TEXT,
      eco_data_mode INTEGER NOT NULL DEFAULT 0,
      notifications_enabled INTEGER NOT NULL DEFAULT 1,
      reminder_time TEXT NOT NULL DEFAULT '18:00',
      reminder_lead_minutes INTEGER NOT NULL DEFAULT 30,
      coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE' CHECK(coach_subscription_status IN ('GRATUIT_BASE', 'ACTIF_5000')),
      coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      coach_subscribed_at TEXT,
      plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
      plan_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL'
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
      zone TEXT NOT NULL,
      monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
      athlete_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 5000,
      platform_subscription_status TEXT NOT NULL DEFAULT 'ACTIF_1000' CHECK(platform_subscription_status IN ('EN_ATTENTE', 'ACTIF_1000')),
      coach_plan TEXT NOT NULL DEFAULT 'MARKETPLACE',
      commission_pct INTEGER NOT NULL DEFAULT 20,
      athlete_payout_fcfa INTEGER NOT NULL DEFAULT 4000,
      verification_status TEXT NOT NULL DEFAULT 'VERIFIE' CHECK(verification_status IN ('EN_ATTENTE', 'VERIFIE', 'REFUSE'))
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
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme'))
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
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
      titre TEXT NOT NULL,
      niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
      duree_min INTEGER NOT NULL,
      objectif TEXT NOT NULL,
      prevention_focus TEXT NOT NULL,
      relue_par TEXT,
      validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK(validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
      proposee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
      exercises_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS program_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      coach_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
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
      sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
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
      pack_souhaite TEXT,
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

  const athCols = db.prepare('PRAGMA table_info(athlete_profiles)').all() as Array<{ name: string }>;
  const athColNames = new Set(athCols.map((c) => c.name));
  if (!athColNames.has('coach_subscription_status')) {
    db.exec("ALTER TABLE athlete_profiles ADD COLUMN coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE';");
  }
  if (!athColNames.has('coach_monthly_fee_fcfa')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
  }
  if (!athColNames.has('coach_subscribed_at')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN coach_subscribed_at TEXT;');
  }
  if (!athColNames.has('plan_tier')) {
    db.exec("ALTER TABLE athlete_profiles ADD COLUMN plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL';");
    db.exec("UPDATE athlete_profiles SET plan_tier = 'COACH_PRIVE', plan_fee_fcfa = 5000 WHERE coach_subscription_status = 'ACTIF_5000';");
  }
  if (!athColNames.has('plan_fee_fcfa')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN plan_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
    db.exec("UPDATE athlete_profiles SET plan_tier = 'COACH_PRIVE', plan_fee_fcfa = 5000 WHERE coach_subscription_status = 'ACTIF_5000';");
  }
  if (!athColNames.has('plan_billing_cycle')) {
    db.exec("ALTER TABLE athlete_profiles ADD COLUMN plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL';");
  }
  if (!athColNames.has('reminder_time')) {
    db.exec("ALTER TABLE athlete_profiles ADD COLUMN reminder_time TEXT NOT NULL DEFAULT '18:00';");
  }
  if (!athColNames.has('reminder_lead_minutes')) {
    db.exec('ALTER TABLE athlete_profiles ADD COLUMN reminder_lead_minutes INTEGER NOT NULL DEFAULT 30;');
  }

  const coachCols = db.prepare('PRAGMA table_info(coaches)').all() as Array<{ name: string }>;
  const coachColNames = new Set(coachCols.map((c) => c.name));
  if (!coachColNames.has('monthly_fee_fcfa')) {
    db.exec('ALTER TABLE coaches ADD COLUMN monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0;');
  }
  if (!coachColNames.has('athlete_monthly_fee_fcfa')) {
    db.exec('ALTER TABLE coaches ADD COLUMN athlete_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 5000;');
  }
  if (!coachColNames.has('platform_subscription_status')) {
    db.exec("ALTER TABLE coaches ADD COLUMN platform_subscription_status TEXT NOT NULL DEFAULT 'ACTIF_1000';");
  }
  if (!coachColNames.has('coach_plan')) {
    db.exec("ALTER TABLE coaches ADD COLUMN coach_plan TEXT NOT NULL DEFAULT 'MARKETPLACE';");
    db.exec("UPDATE coaches SET coach_plan = 'MARKETPLACE', monthly_fee_fcfa = 0, commission_pct = 20, athlete_payout_fcfa = 4000;");
  }
  if (!coachColNames.has('commission_pct')) {
    db.exec('ALTER TABLE coaches ADD COLUMN commission_pct INTEGER NOT NULL DEFAULT 20;');
  }
  if (!coachColNames.has('athlete_payout_fcfa')) {
    db.exec('ALTER TABLE coaches ADD COLUMN athlete_payout_fcfa INTEGER NOT NULL DEFAULT 4000;');
  }
  if (!coachColNames.has('verification_status')) {
    db.exec("ALTER TABLE coaches ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'VERIFIE';");
  }

  const sessCols = db.prepare('PRAGMA table_info(sessions_library)').all() as Array<{ name: string }>;
  const sessColNames = new Set(sessCols.map((c) => c.name));
  if (!sessColNames.has('access_tier')) {
    db.exec("ALTER TABLE sessions_library ADD COLUMN access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL';");
  }

  const prCols = db.prepare('PRAGMA table_info(partner_requests)').all() as Array<{ name: string }>;
  const prColNames = new Set(prCols.map((c) => c.name));
  if (!prColNames.has('pack_souhaite')) {
    db.exec('ALTER TABLE partner_requests ADD COLUMN pack_souhaite TEXT;');
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

  // Safe idempotent sport_code CHECK constraint migration to include volleyball and athletisme
  const checkSportsTable = (tableName: string): boolean => {
    const row = db
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { sql: string } | undefined;
    return Boolean(row && (!row.sql.includes("'volleyball'") || !row.sql.includes("'athletisme'")));
  };

  if (
    checkSportsTable('athlete_profiles') ||
    checkSportsTable('groups') ||
    checkSportsTable('sessions_library') ||
    checkSportsTable('program_plans') ||
    checkSportsTable('evaluations')
  ) {
    db.pragma('foreign_keys = OFF');
    const migrateSports = db.transaction(() => {
      if (checkSportsTable('athlete_profiles')) {
        db.exec(`
          CREATE TABLE athlete_profiles_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
            niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
            taille_cm INTEGER,
            poste TEXT,
            objectif TEXT,
            eco_data_mode INTEGER NOT NULL DEFAULT 0,
            notifications_enabled INTEGER NOT NULL DEFAULT 1,
            reminder_time TEXT NOT NULL DEFAULT '18:00',
            reminder_lead_minutes INTEGER NOT NULL DEFAULT 30,
            coach_subscription_status TEXT NOT NULL DEFAULT 'GRATUIT_BASE' CHECK(coach_subscription_status IN ('GRATUIT_BASE', 'ACTIF_5000')),
            coach_monthly_fee_fcfa INTEGER NOT NULL DEFAULT 0,
            coach_subscribed_at TEXT,
            plan_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
            plan_fee_fcfa INTEGER NOT NULL DEFAULT 0,
            plan_billing_cycle TEXT NOT NULL DEFAULT 'MENSUEL'
          );
          INSERT INTO athlete_profiles_new (
            id, user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode,
            notifications_enabled, reminder_time, reminder_lead_minutes,
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
          )
          SELECT
            id, user_id, sport_code, niveau, taille_cm, poste, objectif, eco_data_mode,
            notifications_enabled, COALESCE(reminder_time, '18:00'), COALESCE(reminder_lead_minutes, 30),
            coach_subscription_status, coach_monthly_fee_fcfa, coach_subscribed_at,
            plan_tier, plan_fee_fcfa, plan_billing_cycle
          FROM athlete_profiles;
          DROP TABLE athlete_profiles;
          ALTER TABLE athlete_profiles_new RENAME TO athlete_profiles;
        `);
      }

      if (checkSportsTable('groups')) {
        db.exec(`
          CREATE TABLE groups_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nom TEXT NOT NULL,
            partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
            captain_name TEXT NOT NULL,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme'))
          );
          INSERT INTO groups_new (id, nom, partner_id, captain_name, sport_code)
          SELECT id, nom, partner_id, captain_name, sport_code FROM groups;
          DROP TABLE groups;
          ALTER TABLE groups_new RENAME TO groups;
        `);
      }

      if (checkSportsTable('sessions_library')) {
        db.exec(`
          CREATE TABLE sessions_library_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
            titre TEXT NOT NULL,
            niveau TEXT NOT NULL CHECK(niveau IN ('debutant', 'intermediaire', 'avance')),
            duree_min INTEGER NOT NULL,
            objectif TEXT NOT NULL,
            prevention_focus TEXT NOT NULL,
            relue_par TEXT,
            validation_status TEXT NOT NULL DEFAULT 'VALIDEE' CHECK(validation_status IN ('VALIDEE', 'EN_RELECTURE', 'BROUILLON')),
            proposee_par_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            access_tier TEXT NOT NULL DEFAULT 'ESSENTIEL',
            exercises_json TEXT NOT NULL
          );
          INSERT INTO sessions_library_new (
            id, sport_code, titre, niveau, duree_min, objectif, prevention_focus,
            relue_par, validation_status, proposee_par_user_id, access_tier, exercises_json
          )
          SELECT
            id, sport_code, titre, niveau, duree_min, objectif, prevention_focus,
            relue_par, validation_status, proposee_par_user_id, COALESCE(access_tier, 'ESSENTIEL'), exercises_json
          FROM sessions_library;
          DROP TABLE sessions_library;
          ALTER TABLE sessions_library_new RENAME TO sessions_library;
        `);
      }

      if (checkSportsTable('program_plans')) {
        db.exec(`
          CREATE TABLE program_plans_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            coach_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
            date_debut TEXT NOT NULL,
            duree_semaines INTEGER NOT NULL DEFAULT 4,
            objectif TEXT NOT NULL,
            notes TEXT
          );
          INSERT INTO program_plans_new (id, athlete_user_id, coach_user_id, sport_code, date_debut, duree_semaines, objectif, notes)
          SELECT id, athlete_user_id, coach_user_id, sport_code, date_debut, duree_semaines, objectif, notes FROM program_plans;
          DROP TABLE program_plans;
          ALTER TABLE program_plans_new RENAME TO program_plans;
        `);
      }

      if (checkSportsTable('evaluations')) {
        db.exec(`
          CREATE TABLE evaluations_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL CHECK(type IN ('INITIALE', 'PERIODIQUE')),
            sport_code TEXT NOT NULL CHECK(sport_code IN ('football', 'basket', 'handball', 'volleyball', 'athletisme')),
            date TEXT NOT NULL,
            score_global INTEGER NOT NULL,
            results_json TEXT NOT NULL
          );
          INSERT INTO evaluations_new (id, athlete_user_id, type, sport_code, date, score_global, results_json)
          SELECT id, athlete_user_id, type, sport_code, date, score_global, results_json FROM evaluations;
          DROP TABLE evaluations;
          ALTER TABLE evaluations_new RENAME TO evaluations;
        `);
      }
    });
    migrateSports();
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
