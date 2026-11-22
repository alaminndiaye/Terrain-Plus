import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Compass,
  Download,
  Landmark,
  LogOut,
  MapPin,
  Menu,
  ShieldCheck,
  X,
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
import {
  ApiError,
  apiRequest,
  clearAllWorkspaceCaches,
  clearSessionToken,
  readJsonCache,
  writeJsonCache,
} from '../lib/api';
import { SPORTS_CONFIG } from '../data/sportsConfig';
import { LegalFooter } from './LegalFooter';
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
      <div className="obsidian-card-glow rounded-3xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#0D6E46]">
            <Landmark className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Observatoire National Sport-Santé & Jeunesse · Vue Ministérielle</span>
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#063725]">
            Pilotage agrégé et perspectives de déploiement Terrain+
          </h1>
          <p className="text-xs sm:text-sm text-[#475E52] leading-relaxed">
            Indicateurs nationaux consolidés en temps réel (zéro donnée personnelle, zéro dossier médical individuel, zéro classement individuel public).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <div className="obsidian-inset rounded-2xl px-4 py-2 text-right">
            <div className="text-[11px] text-[#5B7064]">Indice de maturité opérationnelle</div>
            <div className="font-mono text-lg font-bold tabular-nums text-[#0D6E46]">
              {data.perspectives.readinessScorePct}%
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportBrief}
            className="inline-flex items-center gap-2 rounded-full bg-[#0D6E46] px-5 py-2.5 text-xs font-bold text-white hover:bg-[#095637] transition-colors min-h-[44px] whitespace-nowrap shadow-sm"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Exporter note (JSON)</span>
          </button>
        </div>
      </div>

      {/* Section Sub-Nav */}
      <div
        className={`${
          embeddedInAdmin ? 'flex' : 'hidden md:flex'
        } flex-wrap items-center gap-1.5 rounded-2xl border border-[#D5E2DA] bg-white p-1.5`}
      >
        {sectionTabs.map((item) => {
          const Icon = item.icon;
          const active = section === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors min-h-[40px] whitespace-nowrap ${
                active
                  ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                  : 'text-[#475E52] hover:bg-[#F1F6F3] hover:text-[#063725]'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs font-medium text-[#5B7064]">Sportifs actifs suivis</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.kpis.totalAthletes}
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.kpis.activeFollowUpAthletes} en suivi actif · {data.kpis.verifiedAthletes} vérifiés
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs font-medium text-[#5B7064]">Encadrement technique</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.kpis.totalCoaches} coach(s)
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                Ratio national {data.kpis.coachAthleteRatio} · {data.kpis.minorProtectedCount} mineur(s) protégé(s)
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs font-medium text-[#5B7064]">Assiduité & Progression</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#0D6E46]">
                {data.kpis.avgWeeklyCompletionPct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.kpis.completedSessionsTotal}/{data.kpis.plannedTrainingSessionsTotal} séances · Score moy.{' '}
                {data.kpis.avgGlobalEvalScore !== null ? `${data.kpis.avgGlobalEvalScore}/100` : '—'}
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs font-medium text-[#5B7064]">Réseau & Contenus validés</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.kpis.totalPartners} structures
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.kpis.validatedSessionsCount} séances validées · {data.kpis.totalGroups} collectifs
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-6 obsidian-card rounded-2xl p-5 space-y-4 min-w-0">
              <div>
                <h2 className="text-base font-bold text-[#063725]">
                  Répartition par discipline
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Comparaison des athlètes actifs, séances réalisées et protocoles validés par sport.
                </p>
              </div>
              <div className="h-64 w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sportChartData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2EBE5" vertical={false} />
                    <XAxis
                      dataKey="sport"
                      tick={{ fontSize: 12, fill: '#5B7064' }}
                      axisLine={{ stroke: '#D5E2DA' }}
                      tickLine={{ stroke: '#D5E2DA' }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: '#5B7064' }}
                      axisLine={{ stroke: '#D5E2DA' }}
                      tickLine={{ stroke: '#D5E2DA' }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        borderColor: '#D5E2DA',
                        borderRadius: 12,
                        color: '#063725',
                      }}
                      itemStyle={{ color: '#063725' }}
                      labelStyle={{ color: '#0D6E46', fontWeight: 700 }}
                    />
                    <Bar dataKey="athletes" name="Sportifs" fill="#0D6E46" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="seancesRealisees" name="Séances faites" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="seancesValidees" name="Bibliothèque validée" fill="#64748B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-6 obsidian-card rounded-2xl p-5 space-y-4 min-w-0">
              <div>
                <h2 className="text-base font-bold text-[#063725]">
                  Synthèse opérationnelle par sport
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Indicateurs consolidés pour les 6 disciplines (Football, Basket, Handball, Volleyball, Athlétisme & Fitness).
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-[#5B7064]">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Discipline</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Sportifs</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Séances validées</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Bilans</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Score moy.</th>
                      <th className="px-3 py-2.5 font-semibold text-right">Collectifs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2EBE5]">
                    {data.bySport.map((row) => (
                      <tr key={row.sport_code} className="hover:bg-[#F6F8F5]">
                        <td className="px-3 py-3 font-bold text-[#063725]">
                          {SPORTS_CONFIG[row.sport_code].nom}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#3D5246]">{row.athletesCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#3D5246]">{row.validatedSessionsCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#3D5246]">{row.evaluationsCount}</td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums font-bold text-[#0D6E46]">
                          {row.avgEvalScore !== null ? `${row.avgEvalScore}/100` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right font-mono tabular-nums text-[#3D5246]">{row.groupsCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="obsidian-inset rounded-xl p-3.5 text-xs text-[#475E52] leading-relaxed">
                Les évaluations physiques alimentent uniquement la progression individuelle de l’athlète et l’ajustement par son coach affecté. Aucun classement public des sportifs n’est généré.
              </div>
            </div>
          </div>

          {/* Collective Challenges Snapshot */}
          <div className="obsidian-card rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#063725]">
                  Dynamique des défis collectifs nationaux
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Participation agrégée par Campus, ASC et Ligues.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectSection('perspectives')}
                className="text-xs font-bold text-[#0D6E46] underline hover:text-[#095637] min-h-[36px]"
              >
                Voir les perspectives de déploiement
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.challenges.map((c) => (
                <div key={c.id} className="obsidian-inset rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs text-[#5B7064]">
                    <span className="truncate">{c.partner_type} · {c.zone}</span>
                    <span className="font-mono font-bold tabular-nums text-[#0D6E46]">{c.pct}%</span>
                  </div>
                  <div className="text-sm font-bold text-[#063725]">{c.titre}</div>
                  <div className="h-1.5 w-full rounded-full bg-[#DCE6DF] overflow-hidden">
                    <div className="h-full bg-[#0D6E46]" style={{ width: `${c.pct}%` }} />
                  </div>
                  <div className="font-mono text-xs tabular-nums text-[#475E52]">
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
            <div className="obsidian-card rounded-2xl p-5 space-y-1">
              <div className="text-xs text-[#5B7064]">Zones territoriales actives</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.byZone.length}
              </div>
              <div className="text-xs text-[#475E52]">
                {data.kpis.totalPartners} structures (ASC, Campus, Ligues)
              </div>
            </div>
            <div className="obsidian-card rounded-2xl p-5 space-y-1">
              <div className="text-xs text-[#5B7064]">Adhésions aux collectifs</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#0D6E46]">
                {data.kpis.totalGroupMemberships}
              </div>
              <div className="text-xs text-[#475E52]">
                Réparties sur {data.kpis.totalGroups} collectifs encadrés
              </div>
            </div>
            <div className="obsidian-card rounded-2xl p-5 space-y-1">
              <div className="text-xs text-[#5B7064]">Demandes d’intégration en cours</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.partnerRequestsSummary.nouvelle + data.partnerRequestsSummary.enEtude}
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.partnerRequestsSummary.total} total · {data.partnerRequestsSummary.validee} validée(s)
              </div>
            </div>
          </div>

          <div className="obsidian-card rounded-2xl p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-[#063725]">
                Couverture territoriale par zone géographique
              </h2>
              <p className="text-xs text-[#5B7064]">
                Suivi de l’implantation régionale et de l’engagement collectif des structures partenaires.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="border-b border-[#E2EBE5] bg-[#F1F6F3] text-xs text-[#5B7064]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Zone / Pôle</th>
                    <th className="px-4 py-3 font-semibold">Types de structures</th>
                    <th className="px-4 py-3 font-semibold text-right">Partenaires</th>
                    <th className="px-4 py-3 font-semibold text-right">Collectifs</th>
                    <th className="px-4 py-3 font-semibold text-right">Membres agrégés</th>
                    <th className="px-4 py-3 font-semibold text-right">Avancement défis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2EBE5]">
                  {data.byZone.map((z) => (
                    <tr key={z.zone} className="hover:bg-[#F6F8F5]">
                      <td className="px-4 py-3.5 font-bold text-[#063725]">{z.zone}</td>
                      <td className="px-4 py-3.5 text-xs text-[#475E52]">
                        {z.partnerTypes.join(' · ')}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#3D5246]">{z.partnersCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#3D5246]">{z.groupsCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-[#3D5246]">{z.membersCount}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-bold text-[#0D6E46]">
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
            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs text-[#5B7064]">Traitement alertes douleur</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#0D6E46]">
                {data.preventionAndSafety.painResolutionRatePct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.preventionAndSafety.resolvedPainAlerts} traitée(s) · {data.preventionAndSafety.openPainAlerts} ouverte(s)
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs text-[#5B7064]">Protection des mineurs</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.preventionAndSafety.parentalConsentCompliancePct}%
              </div>
              <div className="text-xs text-[#475E52]">
                Accord responsable légal vérifié ({data.kpis.minorProtectedCount} mineurs)
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs text-[#5B7064]">Relecture technique / Santé</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.preventionAndSafety.reviewCompliancePct}%
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                {data.kpis.validatedSessionsCount} validée(s) · {data.kpis.pendingReviewSessionsCount} en attente
              </div>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-1.5">
              <div className="text-xs text-[#5B7064]">Traçabilité & Audit</div>
              <div className="font-mono text-3xl font-bold tabular-nums text-[#063725]">
                {data.preventionAndSafety.auditEventsCount}
              </div>
              <div className="text-xs font-mono tabular-nums text-[#475E52]">
                événements journalisés · {data.preventionAndSafety.coachCommentsCount} avis coach
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="obsidian-card rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-bold text-[#063725]">
                Garde-fous éthiques et réglementaires actifs
              </h2>
              <ul className="space-y-2.5 text-xs sm:text-sm text-[#475E52] leading-relaxed">
                <li className="obsidian-inset rounded-xl p-3">
                  <span className="font-bold text-[#063725]">Positionnement non médical strict :</span>{' '}
                  {data.preventionAndSafety.nonMedicalConsentCount} consentement(s) explicite(s) signé(s) rappelant que la plateforme ne remplace ni un médecin ni un coach diplômé.
                </li>
                <li className="obsidian-inset rounded-xl p-3">
                  <span className="font-bold text-[#063725]">Circuit alerte douleur immédiat :</span>{' '}
                  Tout signalement de douleur déclenche une alerte prioritaire vers le préparateur affecté avec recommandation de mise au repos et d’orientation médicale.
                </li>
                <li className="obsidian-inset rounded-xl p-3">
                  <span className="font-bold text-[#063725]">Contrôle d’accès par rôle (RBAC) :</span>{' '}
                  Les comptes ministériels et partenaires accèdent exclusivement à des indicateurs agrégés, sans accès aux poids, fiches individuelles ni coordonnées personnelles.
                </li>
              </ul>
            </div>

            <div className="obsidian-card rounded-2xl p-5 space-y-3">
              <h2 className="text-base font-bold text-[#063725]">
                Qualité scientifique et validation des contenus
              </h2>
              <p className="text-xs text-[#475E52] leading-relaxed">
                Avant diffusion sur les téléphones des athlètes, chaque proposition de séance est bloquée en statut « EN_RELECTURE » jusqu’à validation nominative par un préparateur physique ou un médecin du sport.
              </p>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="obsidian-inset rounded-xl p-3.5">
                  <div className="text-xs text-[#5B7064]">Séances publiées</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#0D6E46]">
                    {data.kpis.validatedSessionsCount}
                  </div>
                </div>
                <div className="obsidian-inset rounded-xl p-3.5">
                  <div className="text-xs text-[#5B7064]">En file de relecture</div>
                  <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-[#B45309]">
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
          <div className="obsidian-card rounded-2xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#063725]">
                  Trajectoire nationale de montée en charge (2026 – 2027)
                </h2>
                <p className="text-xs text-[#5B7064]">
                  Feuille de route structurée pour étendre le socle Campus/ASC vers une couverture régionale complète.
                </p>
              </div>
              <span className="font-mono text-xs font-bold tabular-nums text-[#0D6E46]">
                Maturité actuelle : {data.perspectives.readinessScorePct}%
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {data.perspectives.phases.map((phase) => (
                <div
                  key={phase.code}
                  className="obsidian-inset rounded-2xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-mono font-bold text-[#063725]">
                        {phase.code} · {phase.horizon}
                      </span>
                      <span
                        className={`font-bold ${
                          phase.statut === 'EN_COURS'
                            ? 'text-[#0D6E46]'
                            : phase.statut === 'PLANIFIEE'
                              ? 'text-[#B45309]'
                              : 'text-[#5B7064]'
                        }`}
                      >
                        {phase.statut === 'EN_COURS'
                          ? 'En cours'
                          : phase.statut === 'PLANIFIEE'
                            ? 'Planifiée'
                            : 'Cible'}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold text-[#063725]">{phase.titre}</h3>
                    <p className="text-xs text-[#475E52] leading-relaxed">{phase.resume}</p>

                    <ul className="space-y-1.5 pt-1 text-xs text-[#3D5246]">
                      {phase.livrables.map((liv) => (
                        <li key={liv} className="flex items-start gap-2">
                          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0D6E46] shrink-0" />
                          <span>{liv}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5 pt-3 border-t border-[#DCE6DF]">
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                      <span className="text-[#5B7064]">Avancement</span>
                      <span className="font-bold text-[#063725]">{phase.progressionPct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#DCE6DF] overflow-hidden">
                      <div
                        className="h-full bg-[#0D6E46]"
                        style={{ width: `${phase.progressionPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="obsidian-card rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#0D6E46]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#063725]">
                4 axes stratégiques de pérennisation publique
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.perspectives.axes.map((axe) => (
                <div key={axe.id} className="obsidian-inset rounded-xl p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-[#063725]">{axe.titre}</h3>
                    <span className="font-mono text-xs font-bold text-[#0D6E46]">
                      {axe.indicateurActuel}
                    </span>
                  </div>
                  <p className="text-xs text-[#475E52] leading-relaxed">{axe.orientation}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const MINISTER_OVERVIEW_CACHE_KEY = 'terrain_plus_minister_overview_v1';

export const MinisterWorkspace: React.FC<{
  onLoggedOut: () => void;
  onSessionExpired: () => void;
}> = ({ onLoggedOut, onSessionExpired }) => {
  const [section, setSection] = useState<MinisterSection>('synthese');
  const [data, setData] = useState<MinisterOverviewPayload | null>(() =>
    readJsonCache<MinisterOverviewPayload>(
      MINISTER_OVERVIEW_CACHE_KEY,
      (v): v is MinisterOverviewPayload =>
        Boolean(v && typeof v === 'object' && typeof (v as MinisterOverviewPayload).kpis?.totalAthletes === 'number' && Array.isArray((v as MinisterOverviewPayload).bySport))
    )
  );
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadMinister = useCallback(async () => {
    try {
      const res = await apiRequest<MinisterOverviewPayload>('/api/minister/overview');
      setData(res);
      writeJsonCache(MINISTER_OVERVIEW_CACHE_KEY, res);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        clearAllWorkspaceCaches();
        onSessionExpired();
        return;
      }
      const cached = readJsonCache<MinisterOverviewPayload>(MINISTER_OVERVIEW_CACHE_KEY);
      if (cached) {
        setData(cached);
        setError('Connexion instable ou hors ligne : affichage des dernières données synchronisées.');
      } else {
        setError(err instanceof Error ? err.message : 'Impossible de charger la vue ministérielle.');
      }
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
    clearAllWorkspaceCaches();
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
      <div className="min-h-screen obsidian-ambient flex items-center justify-center p-6 text-sm text-[#475E52]">
        Chargement de l’Observatoire National Terrain+...
      </div>
    );
  }

  return (
    <div className="min-h-screen obsidian-ambient text-[#063725] flex flex-col md:flex-row">
      {/* Crisp White Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:sticky md:top-0 md:h-screen md:overflow-y-auto border-r border-[#D5E2DA] bg-white">
        <div className="p-5 border-b border-[#E2EBE5]">
          <img
            src="/brand/terrain-logo.png"
            alt="Terrain+"
            decoding="async"
            referrerPolicy="no-referrer"
            className="h-8 w-auto object-contain"
          />
          <div className="mt-2.5 text-xs font-bold text-[#0D6E46]">
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
                className={`w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium min-h-[44px] text-left transition-colors ${
                  active
                    ? 'bg-[#0D6E46] text-white font-bold shadow-sm'
                    : 'text-[#3D5246] hover:bg-[#F1F6F3] hover:text-[#063725]'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#E2EBE5] space-y-3">
          <p className="text-xs text-[#5B7064] leading-relaxed">
            Accès strictement agrégé. Aucune donnée personnelle ni fiche médicale individuelle n’est accessible.
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-[#C3D6CA] bg-[#F6F8F5] px-3 py-2 text-xs font-semibold text-[#063725] hover:bg-[#E7F1EC] min-h-[40px]"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Compact Mobile Header with Hamburger Drawer */}
        <header className="md:hidden border-b border-[#D5E2DA] bg-white">
          <div className="flex items-center justify-between gap-3 px-4 h-[54px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={mobileMenuOpen}
                className="p-2 rounded-xl border border-[#C3D6CA] bg-white text-[#063725] hover:bg-[#F1F6F3] min-h-[38px] min-w-[38px] flex items-center justify-center shrink-0"
              >
                {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
              </button>
              <img
                src="/brand/terrain-logo.png"
                alt="Terrain+"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-7 w-auto object-contain shrink-0"
              />
              <span className="text-xs font-bold text-[#0D6E46] truncate">
                Observatoire
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-[#475E52] hover:text-[#063725] min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
              aria-label="Déconnexion"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          {mobileMenuOpen && (
            <nav aria-label="Menu observatoire mobile" className="border-t border-[#E2EBE5] bg-white px-4 py-3 space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = section === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold min-h-[40px] ${
                      active ? 'bg-[#0D6E46] text-white' : 'bg-[#F6F8F5] text-[#063725]'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 rounded-xl border border-[#D5E2DA] px-3.5 py-2.5 text-xs font-semibold text-[#3D5246] min-h-[40px]"
              >
                <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Déconnexion</span>
              </button>
            </nav>
          )}
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 pb-24 md:pb-10">
          <div className="mx-auto max-w-6xl space-y-6">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
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
            <LegalFooter />
          </div>
        </main>
      </div>

      {/* Floating Crisp White Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Navigation mobile observatoire"
        className="md:hidden fixed bottom-3 left-3 right-3 z-40 rounded-2xl border border-[#D5E2DA] bg-white/95 backdrop-blur-md p-1.5 shadow-xl"
      >
        <div className="grid grid-cols-4 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 rounded-xl py-2 px-1 text-[11px] transition-colors ${
                  active
                    ? 'bg-[#0D6E46] text-white font-bold'
                    : 'text-[#5B7064] hover:text-[#063725] font-medium'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{item.mobileLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
