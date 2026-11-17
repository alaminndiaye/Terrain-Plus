import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Compass,
  Download,
  Landmark,
  LogOut,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError, apiRequest, clearSessionToken } from '../lib/api';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import type { MinisterOverviewPayload } from '../types';

export type MinisterSection = 'synthese' | 'territoires' | 'prevention' | 'perspectives';

interface MinisterOverviewContentProps {
  data: MinisterOverviewPayload;
  section: MinisterSection;
  onSelectSection: (section: MinisterSection) => void;
  embeddedInAdmin?: boolean;
}

export const MinisterOverviewContent: React.FC<MinisterOverviewContentProps> = ({
  data,
  section,
  onSelectSection,
  embeddedInAdmin = false,
}) => {
  const handleExportBrief = () => {
    const payload = {
      document: 'Note de synthèse institutionnelle — Terrain+',
      confidentialite: 'Données strictement agrégées, sans identifiant individuel ni donnée médicale.',
      ...data,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `terrain-plus-observatoire-national-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sportChartData = data.bySport.map((s) => ({
    sport: SPORTS_CONFIG[s.sport_code].nom,
    athletes: s.athletesCount,
    seancesRealisees: s.completedSessionsCount,
    seancesValidees: s.validatedSessionsCount,
    scoreMoyen: s.avgEvalScore ?? 0,
  }));

  const sectionTabs: Array<{
    id: MinisterSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'synthese', label: 'Vue générale', icon: BarChart3 },
    { id: 'territoires', label: 'Territoires & Collectifs', icon: MapPin },
    { id: 'prevention', label: 'Prévention & Conformité', icon: ShieldCheck },
    { id: 'perspectives', label: 'Perspectives & Feuille de route', icon: Compass },
  ];

  return (
    <div className="space-y-6">
      {/* Institutional Header */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-emerald-800">
            <Landmark className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Observatoire National Sport-Santé & Jeunesse · Vue Ministérielle</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-neutral-900">
            Pilotage agrégé et perspectives de déploiement Terrain+
          </h1>
          <p className="text-xs sm:text-sm text-neutral-600 leading-relaxed">
            Indicateurs nationaux consolidés en temps réel (zéro donnée personnelle, zéro dossier médical individuel, zéro classement individuel public).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-right">
            <div className="text-[11px] text-neutral-500">Indice de maturité pilote</div>
            <div className="font-mono text-lg font-bold tabular-nums text-neutral-900">
              {data.perspectives.readinessScorePct}%
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportBrief}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-neutral-800 min-h-[44px]"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Exporter note (JSON)</span>
          </button>
        </div>
      </div>

      {/* Section Sub-Nav (always visible inside Admin embed, and on desktop inside Minister workspace) */}
      <div
        className={`${
          embeddedInAdmin ? 'flex' : 'hidden md:flex'
        } flex-wrap items-center gap-1.5 rounded-2xl border border-neutral-200 bg-white p-1.5`}
      >
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors min-h-[40px] ${
                active
                  ? 'bg-neutral-900 text-white'
                  : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* ---------------- SECTION 1: SYNTHESE NATIONALE ---------------- */}
      {section === 'synthese' && (
        <div className="space-y-6">
          {/* 4 Top National KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs font-medium text-neutral-500">Sportifs actifs suivis</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.kpis.totalAthletes}
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.kpis.activeFollowUpAthletes} en suivi actif · {data.kpis.verifiedAthletes} vérifiés
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs font-medium text-neutral-500">Encadrement technique</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.kpis.totalCoaches} coach(s)
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                Ratio national {data.kpis.coachAthleteRatio} · {data.kpis.minorProtectedCount} mineur(s) protégé(s)
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs font-medium text-neutral-500">Assiduité & Progression</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.kpis.avgWeeklyCompletionPct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.kpis.completedSessionsTotal}/{data.kpis.plannedTrainingSessionsTotal} séances · Score moy.{' '}
                {data.kpis.avgGlobalEvalScore !== null ? `${data.kpis.avgGlobalEvalScore}/100` : '—'}
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs font-medium text-neutral-500">Réseau & Contenus validés</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.kpis.totalPartners} structures
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.kpis.validatedSessionsCount} séances validées · {data.kpis.totalGroups} collectifs
              </div>
            </div>
          </div>

          {/* Chart + Sport Breakdown Table */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 min-w-0">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Répartition par discipline
                </h2>
                <p className="text-xs text-neutral-500">
                  Comparaison des athlètes actifs, séances réalisées et protocoles validés par sport.
                </p>
              </div>
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sportChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis dataKey="sport" tick={{ fontSize: 12, fill: '#4B5563' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} />
                    <Tooltip />
                    <Bar dataKey="athletes" name="Sportifs" fill="#14532D" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="seancesRealisees" name="Séances faites" fill="#B45309" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="seancesValidees" name="Bibliothèque validée" fill="#1F2937" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-6 rounded-2xl border border-neutral-200 bg-white p-5 space-y-4 min-w-0">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Synthèse opérationnelle par sport
                </h2>
                <p className="text-xs text-neutral-500">
                  Indicateurs consolidés pour Football, Basket et Handball (sans matériel obligatoire).
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Discipline</th>
                      <th className="px-3 py-2.5 font-medium text-right">Sportifs</th>
                      <th className="px-3 py-2.5 font-medium text-right">Séances validées</th>
                      <th className="px-3 py-2.5 font-medium text-right">Bilans</th>
                      <th className="px-3 py-2.5 font-medium text-right">Score moy.</th>
                      <th className="px-3 py-2.5 font-medium text-right">Collectifs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {data.bySport.map((row) => (
                      <tr key={row.sport_code} className="hover:bg-neutral-50">
                        <td className="px-3 py-3 font-semibold text-neutral-900">
                          {SPORTS_CONFIG[row.sport_code].nom}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{row.athletesCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{row.validatedSessionsCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{row.evaluationsCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-semibold">
                          {row.avgEvalScore !== null ? `${row.avgEvalScore}/100` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums">{row.groupsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3.5 text-xs text-neutral-600 leading-relaxed">
                Les évaluations physiques alimentent uniquement la progression individuelle de l’athlète et l’ajustement par son coach affecté. Aucun classement public des sportifs n’est généré.
              </div>
            </div>
          </div>

          {/* Collective Challenges Snapshot */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Dynamique des défis collectifs nationaux
                </h2>
                <p className="text-xs text-neutral-500">
                  Participation agrégée par Campus, ASC et Ligues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectSection('perspectives')}
                className="text-xs font-semibold text-neutral-900 underline min-h-[36px]"
              >
                Voir les perspectives de déploiement
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.challenges.map((c) => (
                <div key={c.id} className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-neutral-500">
                    <span className="truncate">{c.partner_type} · {c.zone}</span>
                    <span className="font-mono font-bold tabular-nums text-neutral-900">{c.pct}%</span>
                  </div>
                  <div className="text-sm font-semibold text-neutral-900">{c.titre}</div>
                  <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                    <div className="h-full bg-emerald-800" style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="font-mono text-xs tabular-nums text-neutral-600">
                    {c.current_sessions}/{c.target_sessions} · {c.partner_nom}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SECTION 2: TERRITOIRES & COLLECTIFS ---------------- */}
      {section === 'territoires' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1">
              <div className="text-xs text-neutral-500">Zones territoriales actives</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.byZone.length}
              </div>
              <div className="text-xs text-neutral-600">
                {data.kpis.totalPartners} structures (ASC, Campus, Ligues)
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1">
              <div className="text-xs text-neutral-500">Adhésions aux collectifs</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.kpis.totalGroupMemberships}
              </div>
              <div className="text-xs text-neutral-600">
                Réparties sur {data.kpis.totalGroups} collectifs encadrés
              </div>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1">
              <div className="text-xs text-neutral-500">Demandes d’intégration en cours</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.partnerRequestsSummary.nouvelle + data.partnerRequestsSummary.enEtude}
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.partnerRequestsSummary.total} total · {data.partnerRequestsSummary.validee} validée(s)
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-neutral-900">
                Couverture territoriale par zone géographique
              </h2>
              <p className="text-xs text-neutral-500">
                Suivi de l’implantation régionale et de l’engagement collectif des structures partenaires.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-neutral-200 bg-neutral-50 text-xs text-neutral-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Zone / Pôle</th>
                    <th className="px-4 py-3 font-medium">Types de structures</th>
                    <th className="px-4 py-3 font-medium text-right">Partenaires</th>
                    <th className="px-4 py-3 font-medium text-right">Collectifs</th>
                    <th className="px-4 py-3 font-medium text-right">Membres agrégés</th>
                    <th className="px-4 py-3 font-medium text-right">Avancement défis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {data.byZone.map((z) => (
                    <tr key={z.zone} className="hover:bg-neutral-50">
                      <td className="px-4 py-3.5 font-semibold text-neutral-900">{z.zone}</td>
                      <td className="px-4 py-3.5 text-xs text-neutral-600">
                        {z.partnerTypes.join(' · ')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">{z.partnersCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">{z.groupsCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums">{z.membersCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-emerald-800">
                        {z.challengeCompletionPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SECTION 3: PREVENTION & GOUVERNANCE ---------------- */}
      {section === 'prevention' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs text-neutral-500">Traitement alertes douleur</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.preventionAndSafety.painResolutionRatePct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.preventionAndSafety.resolvedPainAlerts} traitée(s) · {data.preventionAndSafety.openPainAlerts} ouverte(s)
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs text-neutral-500">Protection des mineurs</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.preventionAndSafety.parentalConsentCompliancePct}%
              </div>
              <div className="text-xs text-neutral-600">
                Accord responsable légal vérifié ({data.kpis.minorProtectedCount} mineurs)
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs text-neutral-500">Relecture STAPS / Santé</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.preventionAndSafety.reviewCompliancePct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                {data.kpis.validatedSessionsCount} validée(s) · {data.kpis.pendingReviewSessionsCount} en attente
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-1.5">
              <div className="text-xs text-neutral-500">Traçabilité & Audit</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-neutral-900">
                {data.preventionAndSafety.auditEventsCount}
              </div>
              <div className="text-xs font-mono tabular-nums text-neutral-600">
                événements journalisés · {data.preventionAndSafety.coachCommentsCount} avis coach
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Garde-fous éthiques et réglementaires actifs
              </h2>
              <ul className="space-y-2.5 text-xs sm:text-sm text-neutral-700 leading-relaxed">
                <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="font-semibold text-neutral-900">Positionnement non médical strict :</span>{' '}
                  {data.preventionAndSafety.nonMedicalConsentCount} consentement(s) explicite(s) signé(s) rappelant que la plateforme ne remplace ni un médecin ni un coach diplômé.
                </li>
                <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="font-semibold text-neutral-900">Circuit alerte douleur immédiat :</span>{' '}
                  Tout signalement de douleur déclenche une alerte prioritaire vers le préparateur affecté avec recommandation de mise au repos et d’orientation médicale.
                </li>
                <li className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                  <span className="font-semibold text-neutral-900">Contrôle d’accès par rôle (RBAC) :</span>{' '}
                  Les comptes ministériels et partenaires accèdent exclusivement à des indicateurs agrégés, sans accès aux poids, fiches individuelles ni coordonnées personnelles.
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-5 space-y-3">
              <h2 className="text-base font-semibold text-neutral-900">
                Qualité scientifique et validation des contenus
              </h2>
              <p className="text-xs text-neutral-600 leading-relaxed">
                Avant diffusion sur les téléphones des athlètes, chaque proposition de séance est bloquée en statut « EN_RELECTURE » jusqu’à validation nominative par un préparateur STAPS ou un médecin du sport.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="rounded-xl border border-neutral-200 p-3.5">
                  <div className="text-xs text-neutral-500">Séances publiées</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-800">
                    {data.kpis.validatedSessionsCount}
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3.5">
                  <div className="text-xs text-neutral-500">En file de relecture</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-700">
                    {data.kpis.pendingReviewSessionsCount}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SECTION 4: PERSPECTIVES & FEUILLE DE ROUTE ---------------- */}
      {section === 'perspectives' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-neutral-900">
                  Trajectoire nationale de montée en charge (2026 – 2027)
                </h2>
                <p className="text-xs text-neutral-600">
                  Feuille de route structurée pour passer du pilote Campus/ASC à une couverture régionale complète.
                </p>
              </div>
              <span className="font-mono text-xs font-semibold tabular-nums text-emerald-800">
                Maturité actuelle : {data.perspectives.readinessScorePct}%
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {data.perspectives.phases.map((phase) => (
                <div
                  key={phase.code}
                  className="rounded-2xl border border-neutral-200 bg-neutral-50/70 p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-neutral-900">
                        {phase.code} · {phase.horizon}
                      </span>
                      <span
                        className={`font-semibold ${
                          phase.statut === 'EN_COURS'
                            ? 'text-emerald-800'
                            : phase.statut === 'PLANIFIEE'
                              ? 'text-amber-700'
                              : 'text-neutral-600'
                        }`}
                      >
                        {phase.statut === 'EN_COURS'
                          ? 'En cours'
                          : phase.statut === 'PLANIFIEE'
                            ? 'Planifiée'
                            : 'Cible'}
                      </span>
                    </div>

                    <h3 className="text-sm font-semibold text-neutral-900">{phase.titre}</h3>
                    <p className="text-xs text-neutral-600 leading-relaxed">{phase.resume}</p>

                    <ul className="space-y-1.5 pt-1 text-xs text-neutral-700">
                      {phase.livrables.map((liv) => (
                        <li key={liv} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-neutral-900 shrink-0" />
                          <span>{liv}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-neutral-200">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-neutral-500">Avancement</span>
                      <span className="font-semibold text-neutral-900">{phase.progressionPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-neutral-200 overflow-hidden">
                      <div
                        className="h-full bg-neutral-900"
                        style={{ width: `${phase.progressionPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-neutral-700" aria-hidden="true" />
              <h2 className="text-base font-semibold text-neutral-900">
                4 axes stratégiques de pérennisation publique
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.perspectives.axes.map((axe) => (
                <div key={axe.id} className="rounded-xl border border-neutral-200 p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-neutral-900">{axe.titre}</h3>
                    <span className="font-mono text-xs font-semibold text-emerald-800">
                      {axe.indicateurActuel}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 leading-relaxed">{axe.orientation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const MinisterWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [section, setSection] = useState<MinisterSection>('synthese');
  const [data, setData] = useState<MinisterOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMinister = useCallback(async () => {
    try {
      const res = await apiRequest<MinisterOverviewPayload>('/api/minister/overview');
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onSessionExpired();
        return;
      }
      setError(err instanceof Error ? err.message : 'Impossible de charger la vue ministérielle.');
    } finally {
      setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    loadMinister();
  }, [loadMinister]);

  const handleLogout = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearSessionToken();
    onLoggedOut();
  };

  const navItems: Array<{
    id: MinisterSection;
    label: string;
    mobileLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'synthese', label: 'Vue générale', mobileLabel: 'Synthèse', icon: BarChart3 },
    { id: 'territoires', label: 'Territoires & Réseau', mobileLabel: 'Territoires', icon: MapPin },
    { id: 'prevention', label: 'Prévention & Conformité', mobileLabel: 'Prévention', icon: ShieldCheck },
    { id: 'perspectives', label: 'Perspectives nationales', mobileLabel: 'Perspectives', icon: Compass },
  ];

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-[#F7F7F5] flex items-center justify-center p-6 text-sm text-neutral-600">
        Chargement de l’Observatoire National Terrain+...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7F5] text-neutral-900 flex flex-col md:flex-row">
      {/* Detached Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-neutral-200 bg-white">
        <div className="p-5 border-b border-neutral-200">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <div className="mt-2 text-xs font-semibold text-emerald-800">
            Ministères & Tutelle sportive
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] text-left ${
                  active ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-neutral-200 space-y-3">
          <p className="text-xs text-neutral-500 leading-relaxed">
            Accès strictement agrégé. Aucune donnée personnelle ni fiche médicale individuelle n’est accessible.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Header (No nav tabs at top) */}
        <header className="md:hidden flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 h-[52px]">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-md object-contain shrink-0"
            />
            <span className="font-display text-sm font-bold text-neutral-900 truncate">
              Observatoire National
            </span>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="p-2 text-neutral-600 hover:text-neutral-900 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
            aria-label="Déconnexion"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}
            {data && (
              <MinisterOverviewContent
                data={data}
                section={section}
                onSelectSection={setSection}
              />
            )}
          </div>
        </main>
      </div>

      {/* Fixed Bottom Navigation Bar on Mobile */}
      <nav
        aria-label="Navigation mobile observatoire"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-md pb-safe"
      >
        <div className="grid grid-cols-4 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium px-1 ${
                  active ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
