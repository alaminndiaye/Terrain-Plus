import React, { useState } from 'react';
import { Activity, CalendarCheck, ShieldCheck, ArrowRight } from 'lucide-react';
import type { SportCode } from '../types';
import { SPORTS_CONFIG } from '../data/sportsConfig';

interface GuidedTourModalProps {
  sportCode: SportCode;
  prenom: string;
  onFinish: (goToEvaluation: boolean) => void;
}

export const GuidedTourModal: React.FC<GuidedTourModalProps> = ({
  sportCode,
  prenom,
  onFinish,
}) => {
  const [step, setStep] = useState(0);
  const sport = SPORTS_CONFIG[sportCode];

  const screens = [
    {
      icon: CalendarCheck,
      title: `Bienvenue ${prenom}, votre espace ${sport.nom} est prêt`,
      body: `Votre interface, vos séances sans matériel et vos repères de prévention (${sport.preventionZones.join(' et ')}) sont adaptés au ${sport.nom.toLowerCase()}.`,
    },
    {
      icon: Activity,
      title: 'Séances légères et mode hors ligne',
      body: 'Téléchargez vos séances de la semaine avant d’aller au terrain. Les consignes fonctionnent en français et en wolof sans consommation vidéo.',
    },
    {
      icon: ShieldCheck,
      title: 'Suivi encadré et sécurité avant tout',
      body: 'Commencez par votre auto-évaluation initiale (3 tests sans matériel) pour que votre coach adapte votre programme. En cas de douleur, arrêtez et signalez-le en un clic.',
    },
  ];

  const current = screens[step];
  const Icon = current.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-neutral-200 p-6 shadow-xl">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-md object-contain"
            />
            <span className="font-medium text-neutral-700">Terrain+ · Visite guidée</span>
          </div>
          <span className="font-mono tabular-nums">Étape {step + 1} / 3</span>
        </div>

        <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-neutral-900">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2 className="mt-4 text-xl font-semibold text-neutral-900">{current.title}</h2>
        <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          {step < 2 ? (
            <>
              <button
                type="button"
                onClick={() => onFinish(false)}
                className="text-sm text-neutral-500 hover:text-neutral-900 min-h-[44px] px-2"
              >
                Passer
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 min-h-[44px]"
              >
                <span>Suivant</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <div className="flex w-full flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => onFinish(false)}
                className="flex-1 rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 min-h-[44px]"
              >
                Voir mon Dashboard
              </button>
              <button
                type="button"
                onClick={() => onFinish(true)}
                className="flex-1 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 min-h-[44px]"
              >
                Faire l'évaluation initiale
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
