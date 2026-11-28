import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signSandboxWebhook } from '@/lib/adapters/payment';

type Row = Record<string, unknown>;

function makeStore() {
  const specSportId = crypto.randomUUID();
  const specKineId = crypto.randomUUID();

  const tables: Record<string, Row[]> = {
    profiles: [],
    otp_verifications: [],
    rate_limits: [],
    specialties: [
      {
        id: specSportId,
        slug: 'medecine-du-sport',
        name: 'Médecine du sport',
        description: 'Suivi régulier et diagnostic des blessures sportives.',
        sort_order: 1,
        is_active: true,
      },
      {
        id: specKineId,
        slug: 'kinesitherapie-du-sport',
        name: 'Kinésithérapie du sport',
        description: 'Rééducation et retour au terrain.',
        sort_order: 2,
        is_active: true,
      },
    ],
    athlete_profiles: [],
    athlete_medical_records: [],
    athlete_medical_entries: [],
    training_logs: [],
    prevention_articles: [],
    return_to_sport_plans: [],
    return_to_sport_steps: [],
    doctor_profiles: [],
    doctor_evidence: [],
    availability_slots: [],
    cases: [],
    case_messages: [],
    case_attachments: [],
    appointments: [],
    video_sessions: [],
    doctor_payouts: [],
    referrals: [],
    payments: [],
    reviews: [],
    review_reports: [],
    consents: [],
    data_requests: [],
    doctor_forum_topics: [],
    doctor_forum_posts: [],
    doctor_forum_reports: [],
    doctor_dm_threads: [],
    doctor_dm_messages: [],
    exceptional_access_grants: [],
    audit_logs: [],
    notifications: [],
  };

  const storage = new Map<string, Buffer>();
  let activeAuthUserId: string | null = null;

  function enrichRow(table: string, row: Row): Row {
    const out: Row = { ...row };
    if (table === 'doctor_profiles') {
      out.specialties =
        tables.specialties.find((s) => s.id === row.specialty_id) || null;
      const prof = tables.profiles.find((p) => p.id === row.user_id) || null;
      out.profiles = prof;
      out['profiles!doctor_profiles_user_id_fkey'] = prof;
    }
    if (table === 'cases') {
      const dp = tables.doctor_profiles.find((d) => d.user_id === row.doctor_id);
      if (dp) {
        const enrichedDp = enrichRow('doctor_profiles', dp);
        out.doctor_profiles = enrichedDp;
        out['doctor_profiles!cases_doctor_id_fkey'] = enrichedDp;
      }
    }
    if (table === 'return_to_sport_plans') {
      out.return_to_sport_steps = tables.return_to_sport_steps.filter((s) => s.plan_id === row.id);
    }
    if (table === 'doctor_forum_topics' || table === 'doctor_forum_posts') {
      const dp = tables.doctor_profiles.find((d) => d.user_id === row.author_doctor_id);
      out.doctor_profiles = dp ? enrichRow('doctor_profiles', dp) : null;
      out.specialties = row.specialty_id
        ? tables.specialties.find((s) => s.id === row.specialty_id) || null
        : null;
    }
    return out;
  }

  function resolveField(row: Row, field: string): unknown {
    if (field in row) return row[field];
    if (field.includes('.')) {
      const [rel, col] = field.split('.');
      const nested = row[rel] as Row | null | undefined;
      return nested ? nested[col] : undefined;
    }
    return undefined;
  }

  class QueryBuilder {
    private table: string;
    private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
    private payload: Row | Row[] = {};
    private filters: Array<(row: Row) => boolean> = [];
    private headOnly = false;
    private wantsCount = false;
    private orders: Array<{ col: string; asc: boolean }> = [];
    private maxLimit: number | null = null;
    private expectSingle: 'none' | 'single' | 'maybe' = 'none';

    constructor(table: string) {
      this.table = table;
    }

    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.count === 'exact') this.wantsCount = true;
      if (opts?.head) this.headOnly = true;
      return this;
    }

    insert(rows: Row | Row[]) {
      this.mode = 'insert';
      this.payload = rows;
      return this;
    }

    upsert(rows: Row | Row[]) {
      this.mode = 'upsert';
      this.payload = rows;
      return this;
    }

    update(patch: Row) {
      this.mode = 'update';
      this.payload = patch;
      return this;
    }

    delete() {
      this.mode = 'delete';
      return this;
    }

    eq(col: string, val: unknown) {
      this.filters.push((r) => resolveField(r, col) === val);
      return this;
    }

    neq(col: string, val: unknown) {
      this.filters.push((r) => resolveField(r, col) !== val);
      return this;
    }

    in(col: string, vals: unknown[]) {
      this.filters.push((r) => vals.includes(resolveField(r, col)));
      return this;
    }

    is(col: string, val: null) {
      this.filters.push((r) => resolveField(r, col) === val || resolveField(r, col) === undefined);
      return this;
    }

    gt(col: string, val: string) {
      this.filters.push((r) => String(resolveField(r, col) || '') > val);
      return this;
    }

    lt(col: string, val: string) {
      this.filters.push((r) => String(resolveField(r, col) || '') < val);
      return this;
    }

    or(expr: string) {
      const clauses = expr.split(',');
      this.filters.push((r) =>
        clauses.some((clause) => {
          const [col, op, val] = clause.split('.');
          if (op === 'eq') return String(resolveField(r, col)) === val;
          return false;
        })
      );
      return this;
    }

    order(col: string, opts?: { ascending?: boolean }) {
      this.orders.push({ col, asc: opts?.ascending !== false });
      return this;
    }

    limit(n: number) {
      this.maxLimit = n;
      return this;
    }

    single() {
      this.expectSingle = 'single';
      return this;
    }

    maybeSingle() {
      this.expectSingle = 'maybe';
      return this;
    }

    private exec(): { data: unknown; error: { message: string } | null; count?: number } {
      const tbl = tables[this.table];
      if (!tbl) return { data: null, error: { message: `Unknown table ${this.table}` } };

      const nowIso = new Date().toISOString();

      if (this.mode === 'insert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = list.map((item) => {
          const row: Row = {
            id: (item.id as string) || crypto.randomUUID(),
            created_at: item.created_at || nowIso,
            updated_at: item.updated_at || nowIso,
            uploaded_at: item.uploaded_at || nowIso,
            last_activity_at: item.last_activity_at || nowIso,
            last_message_at: item.last_message_at || nowIso,
            replies_count: item.replies_count ?? 0,
            is_pinned: item.is_pinned ?? false,
            ...item,
          };
          tbl.push(row);
          return enrichRow(this.table, row);
        });
        if (this.expectSingle === 'single' || this.expectSingle === 'maybe') {
          return { data: inserted[0] ?? null, error: null };
        }
        return { data: inserted, error: null };
      }

      if (this.mode === 'upsert') {
        const list = Array.isArray(this.payload) ? this.payload : [this.payload];
        const keyCol =
          this.table === 'athlete_profiles' || this.table === 'doctor_profiles'
            ? 'user_id'
            : this.table === 'athlete_medical_records'
            ? 'athlete_id'
            : 'id';
        const out: Row[] = [];
        for (const item of list) {
          const existing = tbl.find((r) => r[keyCol] === item[keyCol]);
          if (existing) {
            Object.assign(existing, item, { updated_at: nowIso });
            out.push(enrichRow(this.table, existing));
          } else {
            const row: Row = {
              id: (item.id as string) || crypto.randomUUID(),
              created_at: nowIso,
              updated_at: nowIso,
              ...item,
            };
            tbl.push(row);
            out.push(enrichRow(this.table, row));
          }
        }
        if (this.expectSingle === 'single' || this.expectSingle === 'maybe') {
          return { data: out[0] ?? null, error: null };
        }
        return { data: out, error: null };
      }

      const matched = tbl.filter((r) => {
        const enriched = enrichRow(this.table, r);
        return this.filters.every((fn) => fn(enriched));
      });

      if (this.mode === 'update') {
        const updated: Row[] = [];
        for (const row of matched) {
          Object.assign(row, this.payload);
          updated.push(enrichRow(this.table, row));
        }
        if (this.expectSingle === 'single' || this.expectSingle === 'maybe') {
          return { data: updated[0] ?? null, error: null };
        }
        return { data: updated, error: null };
      }

      if (this.mode === 'delete') {
        const ids = new Set(matched);
        tables[this.table] = tbl.filter((r) => !ids.has(r));
        return { data: matched, error: null };
      }

      let rows = matched.map((r) => enrichRow(this.table, r));
      for (const ord of [...this.orders].reverse()) {
        rows.sort((a, b) => {
          const av = String(a[ord.col] ?? '');
          const bv = String(b[ord.col] ?? '');
          return ord.asc ? av.localeCompare(bv) : bv.localeCompare(av);
        });
      }
      const totalCount = rows.length;
      if (this.maxLimit !== null) rows = rows.slice(0, this.maxLimit);

      if (this.headOnly) {
        return { data: null, error: null, count: totalCount };
      }
      if (this.expectSingle === 'single') {
        if (!rows[0]) return { data: null, error: { message: 'Not found' } };
        return { data: rows[0], error: null };
      }
      if (this.expectSingle === 'maybe') {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null, ...(this.wantsCount ? { count: totalCount } : {}) };
    }

    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
    }
  }

  const adminClient = {
    from(table: string) {
      return new QueryBuilder(table);
    },
    auth: {
      admin: {
        async createUser(args: { email: string; user_metadata?: Row }) {
          const id = crypto.randomUUID();
          return { data: { user: { id, email: args.email, user_metadata: args.user_metadata } }, error: null };
        },
        async deleteUser(id: string) {
          tables.profiles = tables.profiles.filter((p) => p.id !== id);
          return { data: {}, error: null };
        },
        async signOut() {
          return { error: null };
        },
      },
    },
    storage: {
      from(bucket: string) {
        return {
          async createSignedUploadUrl(path: string) {
            return {
              data: { signedUrl: `https://mock.storage/${bucket}/${path}`, token: 'tok', path },
              error: null,
            };
          },
          async createSignedUrl(path: string) {
            return { data: { signedUrl: `https://mock.storage/dl/${bucket}/${path}` }, error: null };
          },
          async download(path: string) {
            const buf = storage.get(`${bucket}:${path}`);
            if (!buf) return { data: null, error: { message: 'Missing file' } };
            return {
              data: {
                async arrayBuffer() {
                  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                },
              },
              error: null,
            };
          },
          async remove(paths: string[]) {
            for (const p of paths) storage.delete(`${bucket}:${p}`);
            return { data: {}, error: null };
          },
        };
      },
    },
    async rpc(fnName: string, args: Row) {
      if (fnName === 'rpc_consume_rate_limit') {
        return { data: true, error: null };
      }
      if (fnName === 'rpc_confirm_payment_and_unlock_case') {
        const pay = tables.payments.find((p) => p.id === args.p_payment_id);
        if (!pay) return { data: null, error: { message: 'PAYMENT_NOT_FOUND' } };
        if (pay.status === 'succeeded') {
          return { data: { idempotent_replay: true, payment_id: pay.id, status: 'succeeded' }, error: null };
        }
        const nowIso = new Date().toISOString();
        pay.status = args.p_outcome;
        pay.provider_event_id = args.p_event_id;
        if (args.p_outcome === 'succeeded') {
          pay.paid_at = nowIso;
          const c = tables.cases.find((x) => x.id === pay.case_id);
          if (c) {
            c.payment_unlocked = true;
            if (c.status === 'awaiting_payment') c.status = 'open';
            c.updated_at = nowIso;
          }
        }
        return { data: { idempotent_replay: false, payment_id: pay.id, status: pay.status }, error: null };
      }
      if (fnName === 'rpc_accept_handoff_transfer') {
        const ref = tables.referrals.find((r) => r.id === args.p_referral_id);
        if (!ref || ref.status !== 'pending_consent') {
          return { data: null, error: { message: 'REFERRAL_INVALID_OR_DECIDED' } };
        }
        const src = tables.cases.find((c) => c.id === ref.source_case_id);
        if (!src || src.athlete_id !== args.p_athlete_id) {
          return { data: null, error: { message: 'FORBIDDEN_CASE_ACCESS' } };
        }
        const completedAppts = tables.appointments.filter(
          (a) => a.case_id === src.id && a.proposal_status === 'completed'
        ).length;
        if (ref.referral_type === 'handoff_transfer' && (src.medical_record_updated || completedAppts > 0)) {
          return { data: null, error: { message: 'CONSULTATION_ALREADY_PERFORMED' } };
        }
        const targetDoc = tables.doctor_profiles.find((d) => d.user_id === ref.to_doctor_id);
        const nowIso = new Date().toISOString();
        const newCaseId = crypto.randomUUID();
        const isHandoff = ref.referral_type === 'handoff_transfer';
        tables.cases.push({
          id: newCaseId,
          reference: args.p_new_case_ref,
          athlete_id: src.athlete_id,
          doctor_id: ref.to_doctor_id,
          specialty_id: targetDoc?.specialty_id || src.specialty_id,
          mode: src.mode,
          status: 'open',
          body_part: src.body_part,
          sport_context: src.sport_context,
          initial_reason_enc: args.p_new_summary_enc,
          head_trauma_flagged: src.head_trauma_flagged,
          share_training_trends: src.share_training_trends,
          payment_unlocked: isHandoff,
          medical_record_updated: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
        if (isHandoff) {
          src.status = 'transferred';
          src.updated_at = nowIso;
          for (const p of tables.payments) {
            if (p.case_id === src.id && p.status === 'succeeded') {
              p.doctor_id = ref.to_doctor_id;
              p.case_id = newCaseId;
              p.transfer_referral_id = ref.id;
              p.transferred_at = nowIso;
              p.updated_at = nowIso;
            }
          }
        }
        ref.status = 'accepted';
        ref.target_case_id = newCaseId;
        ref.decided_at = nowIso;
        return {
          data: {
            target_case_id: newCaseId,
            referral_type: ref.referral_type,
            payment_reallocated: isHandoff,
          },
          error: null,
        };
      }
      if (fnName === 'rpc_complete_case_with_record') {
        const c = tables.cases.find((x) => x.id === args.p_case_id);
        if (!c || c.doctor_id !== args.p_doctor_id) {
          return { data: null, error: { message: 'FORBIDDEN_CASE_ACCESS' } };
        }
        const nowIso = new Date().toISOString();
        tables.athlete_medical_entries.push({
          id: crypto.randomUUID(),
          athlete_id: c.athlete_id,
          case_id: c.id,
          doctor_id: args.p_doctor_id,
          entry_summary_enc: args.p_entry_summary_enc,
          recommendations_enc: args.p_recommendations_enc,
          fitness_status: args.p_fitness_status,
          next_followup_at: args.p_next_followup_at,
          created_at: nowIso,
        });
        const existingRec = tables.athlete_medical_records.find((r) => r.athlete_id === c.athlete_id);
        const recPayload = {
          athlete_id: c.athlete_id,
          last_updated_by_doctor_id: args.p_doctor_id,
          clinical_summary_enc: args.p_clinical_summary_enc,
          contraindications_enc: args.p_contraindications_enc,
          fitness_guidance_enc: args.p_fitness_guidance_enc,
          next_followup_at: args.p_next_followup_at,
          updated_at: nowIso,
        };
        if (existingRec) Object.assign(existingRec, recPayload);
        else tables.athlete_medical_records.push(recPayload);
        c.status = 'completed';
        c.medical_record_updated = true;
        c.completed_at = nowIso;
        c.updated_at = nowIso;
        return { data: { status: 'completed', completed_at: nowIso }, error: null };
      }
      return { data: null, error: { message: `Unknown RPC ${fnName}` } };
    },
  };

  return {
    tables,
    storage,
    adminClient,
    specSportId,
    specKineId,
    setAuthUser(userId: string | null) {
      activeAuthUserId = userId;
    },
    getAuthUser() {
      return activeAuthUserId;
    },
  };
}

let ctx = makeStore();

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ctx.adminClient,
  createSignedUploadUrl: (bucket: 'doctor-evidence' | 'case-media', path: string) =>
    ctx.adminClient.storage.from(bucket).createSignedUploadUrl(path).then((r) => r.data),
  createSignedDownloadUrl: (bucket: 'doctor-evidence' | 'case-media', path: string) =>
    ctx.adminClient.storage.from(bucket).createSignedUrl(path).then((r) => r.data.signedUrl),
  readStorageFileHeader: async (bucket: 'doctor-evidence' | 'case-media', path: string) => {
    const res = await ctx.adminClient.storage.from(bucket).download(path);
    if (!res.data) throw new Error('FILE_NOT_FOUND_IN_STORAGE');
    const ab = await res.data.arrayBuffer();
    const buf = Buffer.from(ab);
    return { headerBytes: buf.subarray(0, 64), totalBytes: buf.length };
  },
  deleteStorageObject: async (bucket: 'doctor-evidence' | 'case-media', path: string) => {
    await ctx.adminClient.storage.from(bucket).remove([path]);
  },
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      async getUser() {
        const uid = ctx.getAuthUser();
        if (!uid) return { data: { user: null }, error: { message: 'No session' } };
        return { data: { user: { id: uid } }, error: null };
      },
      async signInWithPassword({ email }: { email: string }) {
        const prof = ctx.tables.profiles.find(
          (p) => p.email === email || `sportif_${String(p.phone).replace(/[^0-9]/g, '')}@phone.terrainplus.local` === email
        );
        if (!prof) return { error: { message: 'Invalid credentials' } };
        ctx.setAuthUser(String(prof.id));
        return { error: null };
      },
      async signOut() {
        ctx.setAuthUser(null);
      },
    },
  }),
}));

// Import route handlers AFTER mocks
import { POST as registerPost } from '@/app/api/auth/register/route';
import { POST as verifyOtpPost } from '@/app/api/auth/verify-otp/route';
import { POST as resendOtpPost } from '@/app/api/auth/resend-otp/route';
import { POST as onboardingPost } from '@/app/api/athlete/onboarding/route';
import { GET as publicDoctorsGet } from '@/app/api/public/doctors/route';
import { POST as trainingLogPost } from '@/app/api/athlete/training-logs/route';
import { POST as createCasePost } from '@/app/api/athlete/cases/route';
import { GET as caseDetailGet, PATCH as caseConsentPatch } from '@/app/api/cases/[id]/route';
import { POST as caseMessagePost } from '@/app/api/cases/[id]/messages/route';
import { POST as attachPreparePost } from '@/app/api/cases/[id]/attachments/prepare/route';
import { POST as attachCommitPost } from '@/app/api/cases/[id]/attachments/commit/route';
import { POST as checkoutPost } from '@/app/api/payments/checkout/route';
import { POST as webhookPost } from '@/app/api/payments/webhook/route';
import { POST as completeCasePost } from '@/app/api/cases/[id]/complete/route';
import { POST as createReferralPost } from '@/app/api/cases/[id]/referrals/route';
import { POST as respondReferralPost } from '@/app/api/cases/[id]/referrals/[refId]/respond/route';
import { POST as createReviewPost } from '@/app/api/cases/[id]/reviews/route';
import { GET as forumGet, POST as forumPost } from '@/app/api/doctor/community/forum/topics/route';
import { POST as dmStartPost } from '@/app/api/doctor/community/messages/route';
import { POST as adminVerifyDecisionPost } from '@/app/api/admin/verifications/[doctorId]/decision/route';
import { POST as adminAuditPost } from '@/app/api/admin/audit-logs/route';

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('End-to-End Platform Workflows & Security Contracts', () => {
  beforeEach(() => {
    ctx = makeStore();
  });

  it('executes full lifecycle: 18+ gate, OTP lock, onboarding, verification, 10k payment, media validation, handoff transfer, longitudinal record & admin isolation', async () => {
    // 1. Seed an Admin account directly in store
    const adminId = crypto.randomUUID();
    ctx.tables.profiles.push({
      id: adminId,
      role: 'admin',
      first_name: 'Admin',
      last_name: 'Terrain',
      full_name: 'Admin Terrain',
      phone: '+221770000001',
      email: 'admin@terrainplus.sn',
      address: 'Dakar',
      city: 'Dakar',
      birth_date: '1988-01-01',
      phone_verified: true,
      onboarding_completed: true,
      status: 'active',
    });

    // 2. Reject minors and public admin signup
    const minorRes = await registerPost(
      jsonReq('http://localhost/api/auth/register', 'POST', {
        role: 'athlete',
        firstName: 'Jeune',
        lastName: 'Sportif',
        phone: '771112233',
        address: 'Plateau',
        city: 'Dakar',
        birthDate: '2011-08-15',
        password: 'Password123!',
        acceptTerms: true,
      })
    );
    expect(minorRes.status).toBe(400);
    expect((await minorRes.json()).error.code).toBe('UNDERAGE_FORBIDDEN');

    const adminSignupRes = await registerPost(
      jsonReq('http://localhost/api/auth/register', 'POST', {
        role: 'admin',
        firstName: 'Hack',
        lastName: 'Admin',
        phone: '771112234',
        address: 'Dakar',
        city: 'Dakar',
        birthDate: '1990-01-01',
        password: 'Password123!',
        acceptTerms: true,
      })
    );
    expect(adminSignupRes.status).toBe(403);

    // 3. Register Adult Athlete
    const athleteRegRes = await registerPost(
      jsonReq('http://localhost/api/auth/register', 'POST', {
        role: 'athlete',
        firstName: 'Mamadou',
        lastName: 'Ndiaye',
        phone: '772223344',
        address: 'Almadies',
        city: 'Dakar',
        birthDate: '1998-03-10',
        password: 'Password123!',
        acceptTerms: true,
      })
    );
    expect(athleteRegRes.status).toBe(201);
    const athleteRegJson = await athleteRegRes.json();
    const athleteId = athleteRegJson.user.id as string;
    const otp1 = athleteRegJson.sandboxOtpCode as string;
    expect(otp1).toMatch(/^\d{6}$/);

    // Simulate logged-in unverified athlete attempting onboarding before OTP -> blocked
    ctx.setAuthUser(athleteId);
    const blockedOnb = await onboardingPost(
      jsonReq('http://localhost/api/athlete/onboarding', 'POST', {
        sports: ['basketball'],
        primarySport: 'basketball',
        practiceLevel: 'club',
        weeklyFrequency: '4 séances / semaine',
        medicalGoal: 'regular_followup',
        healthDataConsentAccepted: true,
      })
    );
    expect(blockedOnb.status).toBe(403);
    expect((await blockedOnb.json()).error.code).toBe('PHONE_OTP_REQUIRED');

    // Wrong OTP 5 times -> hits 429 lockout
    for (let i = 0; i < 5; i++) {
      const badOtp = await verifyOtpPost(
        jsonReq('http://localhost/api/auth/verify-otp', 'POST', { code: '000000' })
      );
      expect(badOtp.status).toBe(400);
    }
    const lockedOtp = await verifyOtpPost(
      jsonReq('http://localhost/api/auth/verify-otp', 'POST', { code: otp1 })
    );
    expect(lockedOtp.status).toBe(429);

    // Resend OTP and verify cleanly
    const resendRes = await resendOtpPost();
    const resendJson = await resendRes.json();
    const okOtp = await verifyOtpPost(
      jsonReq('http://localhost/api/auth/verify-otp', 'POST', { code: resendJson.sandboxOtpCode })
    );
    expect(okOtp.status).toBe(200);

    // 4. Register 2 doctors (Doctor 1 Sport Med, Doctor 2 Kiné) & keep them pending initially
    const doc1Reg = await (
      await registerPost(
        jsonReq('http://localhost/api/auth/register', 'POST', {
          role: 'doctor',
          firstName: 'Awa',
          lastName: 'Fall',
          phone: '773334455',
          email: 'awa.fall@terrainplus.sn',
          address: 'Mermoz',
          city: 'Dakar',
          birthDate: '1985-04-04',
          password: 'Password123!',
          acceptTerms: true,
          specialtyId: ctx.specSportId,
          orderNumber: 'ORD-SN-101',
          facilityName: 'Centre Mermoz',
        })
      )
    ).json();
    const doc1Id = doc1Reg.user.id as string;
    ctx.tables.profiles.find((p) => p.id === doc1Id)!.phone_verified = true;

    const doc2Reg = await (
      await registerPost(
        jsonReq('http://localhost/api/auth/register', 'POST', {
          role: 'doctor',
          firstName: 'Cheikh',
          lastName: 'Sarr',
          phone: '774445566',
          email: 'cheikh.sarr@terrainplus.sn',
          address: 'Point E',
          city: 'Dakar',
          birthDate: '1987-09-12',
          password: 'Password123!',
          acceptTerms: true,
          specialtyId: ctx.specKineId,
          orderNumber: 'ORD-SN-202',
          facilityName: 'Kiné Point E',
        })
      )
    ).json();
    const doc2Id = doc2Reg.user.id as string;
    ctx.tables.profiles.find((p) => p.id === doc2Id)!.phone_verified = true;

    // Pending doctor cannot access forum or peer DM; public directory must return 0 doctors
    ctx.setAuthUser(doc1Id);
    expect((await forumGet(new Request('http://localhost/api/doctor/community/forum/topics'))).status).toBe(403);
    expect(
      (
        await dmStartPost(
          jsonReq('http://localhost/api/doctor/community/messages', 'POST', { peerDoctorId: doc2Id })
        )
      ).status
    ).toBe(403);
    const emptyDir = await (await publicDoctorsGet(new Request('http://localhost/api/public/doctors'))).json();
    expect(emptyDir.doctors).toHaveLength(0);

    // Admin verifies both doctors
    ctx.setAuthUser(adminId);
    expect(
      (
        await adminVerifyDecisionPost(
          jsonReq(`http://localhost/api/admin/verifications/${doc1Id}/decision`, 'POST', {
            decision: 'verified',
          }),
          { params: Promise.resolve({ doctorId: doc1Id }) }
        )
      ).status
    ).toBe(200);
    expect(
      (
        await adminVerifyDecisionPost(
          jsonReq(`http://localhost/api/admin/verifications/${doc2Id}/decision`, 'POST', {
            decision: 'verified',
          }),
          { params: Promise.resolve({ doctorId: doc2Id }) }
        )
      ).status
    ).toBe(200);

    const verifiedDir = await (await publicDoctorsGet(new Request('http://localhost/api/public/doctors'))).json();
    expect(verifiedDir.doctors).toHaveLength(2);

    // Verified Doctor 1 can post to medical forum & start DM with verified Doctor 2; athlete gets 403
    ctx.setAuthUser(doc1Id);
    const topicRes = await forumPost(
      jsonReq('http://localhost/api/doctor/community/forum/topics', 'POST', {
        category: 'clinical_case_anon',
        title: 'Protocole tendinopathie rotulienne joueur 24 ans',
        body: 'Échange anonyme sur le dosage excentrique en période de compétition.',
      })
    );
    expect(topicRes.status).toBe(201);
    const dmRes = await dmStartPost(
      jsonReq('http://localhost/api/doctor/community/messages', 'POST', { peerDoctorId: doc2Id })
    );
    expect(dmRes.status).toBe(201);

    // 5. Athlete Onboarding gate & training & prevention logging
    ctx.setAuthUser(athleteId);
    const blockedCase = await createCasePost(
      jsonReq('http://localhost/api/athlete/cases', 'POST', {
        doctorId: doc1Id,
        mode: 'video',
        initialReason: 'Douleur genou droit depuis deux matchs de basket.',
        healthDataConsentAccepted: true,
      })
    );
    expect(blockedCase.status).toBe(403);
    expect((await blockedCase.json()).error.code).toBe('ONBOARDING_REQUIRED');

    // Athlete completes onboarding
    const onbRes = await onboardingPost(
      jsonReq('http://localhost/api/athlete/onboarding', 'POST', {
        sports: ['basketball'],
        primarySport: 'basketball',
        practiceLevel: 'club',
        weeklyFrequency: '4 séances / semaine',
        heightCm: 192,
        weightKg: 86,
        medicalGoal: 'regular_followup',
        priorInjuries: 'Entorse cheville 2024',
        healthDataConsentAccepted: true,
      })
    );
    expect(onbRes.status).toBe(200);

    // Log 2 basketball sessions with knee discomfort -> generates non-diagnostic signal
    await trainingLogPost(
      jsonReq('http://localhost/api/athlete/training-logs', 'POST', {
        sessionDate: '2026-06-12',
        sport: 'basketball',
        sessionType: 'training',
        durationMinutes: 90,
        rpeIntensity: 8,
        fatigueScore: 4,
        sleepScore: 3,
        recoveryScore: 2,
        hasDiscomfort: true,
        discomfortLevel: 4,
        bodyPart: 'genou',
      })
    );
    const log2Json = await (
      await trainingLogPost(
        jsonReq('http://localhost/api/athlete/training-logs', 'POST', {
          sessionDate: '2026-06-14',
          sport: 'basketball',
          sessionType: 'match',
          durationMinutes: 75,
          rpeIntensity: 9,
          fatigueScore: 5,
          sleepScore: 2,
          recoveryScore: 2,
          hasDiscomfort: true,
          discomfortLevel: 5,
          bodyPart: 'genou',
        })
      )
    ).json();
    expect(log2Json.signals.length).toBeGreaterThanOrEqual(1);

    // 6. Athlete creates Case 1 (Doctor 1) WITHOUT sharing training trends initially
    const case1Res = await createCasePost(
      jsonReq('http://localhost/api/athlete/cases', 'POST', {
        doctorId: doc1Id,
        mode: 'video',
        bodyPart: 'genou',
        sportContext: 'Basketball club',
        initialReason: 'Gêne persistante au tendon rotulien après réception de saut.',
        shareTrainingTrends: false,
        healthDataConsentAccepted: true,
      })
    );
    expect(case1Res.status).toBe(201);
    const case1Id = (await case1Res.json()).case.id as string;

    // Messaging before payment must fail 403
    expect(
      (
        await caseMessagePost(
          jsonReq(`http://localhost/api/cases/${case1Id}/messages`, 'POST', { body: 'Bonjour' }),
          { params: Promise.resolve({ id: case1Id }) }
        )
      ).status
    ).toBe(403);

    // Checkout 10 000 FCFA & test invalid + idempotent webhook
    const payJson = await (
      await checkoutPost(
        jsonReq('http://localhost/api/payments/checkout', 'POST', {
          caseId: case1Id,
          paymentChannel: 'wave_sandbox',
          idempotencyKey: 'idem-case-1',
        })
      )
    ).json();
    expect(payJson.payment.gross_amount_fcfa).toBe(10000);
    expect(payJson.payment.doctor_net_fcfa).toBe(9000);
    const paymentId = payJson.payment.id as string;

    const webhookPayload = { eventId: 'evt_ok_1', paymentId, outcome: 'succeeded' };
    const { rawPayload, signature } = signSandboxWebhook(
      webhookPayload,
      'dev-webhook-secret-change-in-production'
    );

    const badSigRes = await webhookPost(
      new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'x-sandbox-signature': 'deadbeef' },
        body: rawPayload,
      })
    );
    expect(badSigRes.status).toBe(401);

    const okWebhookRes = await webhookPost(
      new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'x-sandbox-signature': signature },
        body: rawPayload,
      })
    );
    expect(okWebhookRes.status).toBe(200);
    expect((await okWebhookRes.json()).idempotentReplay).toBe(false);

    const replayWebhookRes = await webhookPost(
      new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'x-sandbox-signature': signature },
        body: rawPayload,
      })
    );
    expect((await replayWebhookRes.json()).idempotentReplay).toBe(true);

    // 7. Attachment upload rejects spoofed EXE (.png extension) and accepts real JPEG
    const badPrep = await (
      await attachPreparePost(
        jsonReq(`http://localhost/api/cases/${case1Id}/attachments/prepare`, 'POST', {
          filename: 'irm.png',
          mediaKind: 'image',
          byteSize: 100,
        }),
        { params: Promise.resolve({ id: case1Id }) }
      )
    ).json();
    ctx.storage.set(`case-media:${badPrep.storagePath}`, Buffer.from('MZ\x90\x00NotAPngFileAtAll'));
    const badCommit = await attachCommitPost(
      jsonReq(`http://localhost/api/cases/${case1Id}/attachments/commit`, 'POST', {
        storagePath: badPrep.storagePath,
        originalName: 'irm.png',
      }),
      { params: Promise.resolve({ id: case1Id }) }
    );
    expect(badCommit.status).toBe(400);
    expect(ctx.storage.has(`case-media:${badPrep.storagePath}`)).toBe(false);

    const goodPrep = await (
      await attachPreparePost(
        jsonReq(`http://localhost/api/cases/${case1Id}/attachments/prepare`, 'POST', {
          filename: 'echo.jpg',
          mediaKind: 'image',
          byteSize: 100,
        }),
        { params: Promise.resolve({ id: case1Id }) }
      )
    ).json();
    ctx.storage.set(
      `case-media:${goodPrep.storagePath}`,
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    );
    const goodCommit = await attachCommitPost(
      jsonReq(`http://localhost/api/cases/${case1Id}/attachments/commit`, 'POST', {
        storagePath: goodPrep.storagePath,
        originalName: 'echo.jpg',
      }),
      { params: Promise.resolve({ id: case1Id }) }
    );
    expect(goodCommit.status).toBe(201);

    // 8. Selective training sharing: hidden until athlete enables consent
    ctx.setAuthUser(doc1Id);
    const docViewBefore = await (
      await caseDetailGet(new Request(`http://localhost/api/cases/${case1Id}`), {
        params: Promise.resolve({ id: case1Id }),
      })
    ).json();
    expect(docViewBefore.sharedTrainingData).toBeNull();

    ctx.setAuthUser(athleteId);
    await caseConsentPatch(
      jsonReq(`http://localhost/api/cases/${case1Id}`, 'PATCH', { shareTrainingTrends: true }),
      { params: Promise.resolve({ id: case1Id }) }
    );

    ctx.setAuthUser(doc1Id);
    const docViewAfter = await (
      await caseDetailGet(new Request(`http://localhost/api/cases/${case1Id}`), {
        params: Promise.resolve({ id: case1Id }),
      })
    ).json();
    expect(docViewAfter.sharedTrainingData?.logs).toHaveLength(2);

    // 9. Doctor 1 transfers case BEFORE performing consultation -> 10k FCFA moves to Doctor 2
    const refRes = await createReferralPost(
      jsonReq(`http://localhost/api/cases/${case1Id}/referrals`, 'POST', {
        toDoctorId: doc2Id,
        referralType: 'handoff_transfer',
        reason: 'Prise en charge prioritaire en kinésithérapie du sport recommandée avant avis médical.',
        sharedFields: ['initial_complaint', 'medical_record', 'training_trends'],
      }),
      { params: Promise.resolve({ id: case1Id }) }
    );
    expect(refRes.status).toBe(201);
    const refId = (await refRes.json()).referral.id as string;

    ctx.setAuthUser(athleteId);
    const acceptRefJson = await (
      await respondReferralPost(
        jsonReq(`http://localhost/api/cases/${case1Id}/referrals/${refId}/respond`, 'POST', {
          decision: 'accepted',
        }),
        { params: Promise.resolve({ id: case1Id, refId }) }
      )
    ).json();
    expect(acceptRefJson.paymentReallocated).toBe(true);
    const case2Id = acceptRefJson.targetCaseId as string;
    expect(ctx.tables.cases.find((c) => c.id === case1Id)!.status).toBe('transferred');
    expect(ctx.tables.payments.find((p) => p.id === paymentId)!.doctor_id).toBe(doc2Id);

    // 10. Doctor 2 cannot close Case 2 without medical record, then closes properly -> unlocks 1 review + longitudinal continuity
    ctx.setAuthUser(doc2Id);
    const badClose = await completeCasePost(
      jsonReq(`http://localhost/api/cases/${case2Id}/complete`, 'POST', {
        entrySummary: 'Trop court',
        recommendations: 'Repos',
        clinicalSummary: 'Court',
      }),
      { params: Promise.resolve({ id: case2Id }) }
    );
    expect(badClose.status).toBe(400);

    const okClose = await completeCasePost(
      jsonReq(`http://localhost/api/cases/${case2Id}/complete`, 'POST', {
        entrySummary: 'Bilan kiné complet : tendinopathie rotulienne légère sans rupture.',
        recommendations: 'Protocole excentrique progressif sur 3 semaines + glaçage post-séance.',
        clinicalSummary: 'Tendinopathie rotulienne droite modérée traitée par rééducation excentrique.',
        contraindications: 'Éviter pliométrie maximale pendant 14 jours.',
        fitnessGuidance: 'Course en ligne autorisée sans douleur < 3/10.',
        fitnessStatus: 'reprise_progressive',
      }),
      { params: Promise.resolve({ id: case2Id }) }
    );
    expect(okClose.status).toBe(200);

    // Chat is now read-only
    const postCloseMsg = await caseMessagePost(
      jsonReq(`http://localhost/api/cases/${case2Id}/messages`, 'POST', { body: 'Question supplémentaire' }),
      { params: Promise.resolve({ id: case2Id }) }
    );
    expect(postCloseMsg.status).toBe(403);
    expect((await postCloseMsg.json()).error.code).toBe('CASE_READ_ONLY');

    // Athlete rates Doctor 2 once (second attempt -> 409)
    ctx.setAuthUser(athleteId);
    const review1 = await createReviewPost(
      jsonReq(`http://localhost/api/cases/${case2Id}/reviews`, 'POST', {
        rating: 5,
        comment: 'Très pédagogue et protocole clair.',
      }),
      { params: Promise.resolve({ id: case2Id }) }
    );
    expect(review1.status).toBe(201);
    const review2 = await createReviewPost(
      jsonReq(`http://localhost/api/cases/${case2Id}/reviews`, 'POST', {
        rating: 4,
        comment: 'Doublon interdit.',
      }),
      { params: Promise.resolve({ id: case2Id }) }
    );
    expect(review2.status).toBe(409);

    // Athlete creates a new consultation with Doctor 1 -> Doctor 1 automatically sees Doctor 2's longitudinal medical record!
    const case3Json = await (
      await createCasePost(
        jsonReq('http://localhost/api/athlete/cases', 'POST', {
          doctorId: doc1Id,
          mode: 'video',
          initialReason: 'Contrôle médical après 3 semaines de protocole kiné.',
          healthDataConsentAccepted: true,
        })
      )
    ).json();
    const case3Id = case3Json.case.id as string;
    const pay3 = await (
      await checkoutPost(
        jsonReq('http://localhost/api/payments/checkout', 'POST', {
          caseId: case3Id,
          idempotencyKey: 'idem-case-3',
        })
      )
    ).json();
    const wh3 = signSandboxWebhook(
      { eventId: 'evt_ok_3', paymentId: pay3.payment.id, outcome: 'succeeded' },
      'dev-webhook-secret-change-in-production'
    );
    await webhookPost(
      new Request('http://localhost/api/payments/webhook', {
        method: 'POST',
        headers: { 'x-sandbox-signature': wh3.signature },
        body: wh3.rawPayload,
      })
    );

    ctx.setAuthUser(doc1Id);
    const case3DocView = await (
      await caseDetailGet(new Request(`http://localhost/api/cases/${case3Id}`), {
        params: Promise.resolve({ id: case3Id }),
      })
    ).json();
    expect(case3DocView.longitudinalRecord.clinicalSummary).toContain('Tendinopathie rotulienne');
    expect(case3DocView.medicalEntries).toHaveLength(1);

    // 11. Admin default isolation & 15-min exceptional grant audit
    ctx.setAuthUser(adminId);
    const adminBlockedCase = await caseDetailGet(
      new Request(`http://localhost/api/cases/${case3Id}`),
      { params: Promise.resolve({ id: case3Id }) }
    );
    expect(adminBlockedCase.status).toBe(403);

    const grantRes = await adminAuditPost(
      jsonReq('http://localhost/api/admin/audit-logs', 'POST', {
        caseId: case3Id,
        reason: 'Vérification technique suite à un incident de facturation signalé.',
      })
    );
    expect(grantRes.status).toBe(201);

    const adminAllowedCase = await caseDetailGet(
      new Request(`http://localhost/api/cases/${case3Id}`),
      { params: Promise.resolve({ id: case3Id }) }
    );
    expect(adminAllowedCase.status).toBe(200);
    expect((await adminAllowedCase.json()).accessType).toBe('admin_exceptional_grant');
  });
});
