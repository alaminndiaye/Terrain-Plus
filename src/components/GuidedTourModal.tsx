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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl obsidian-card-glow p-6 shadow-2xl text-[#F5F7F1]">
        <div className="flex items-center justify-between text-xs text-[#9AA491]">
          <div className="flex items-center gap-2">
            <img
              src="/brand/terrain-mark.png"
              alt="Terrain+"
              referrerPolicy="no-referrer"
              className="h-6 w-6 rounded-md object-contain"
            />
            <span className="font-medium text-[#D6DDD0]">Terrain+ · Visite guidée</span>
          </div>
          <span className="font-mono tabular-nums text-[#C8F62D]">Étape {step + 1} / 3</span>
        </div>

        <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#C8F62D]/15 border border-[#C8F62D]/25 text-[#C8F62D]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>

        <h2 className="mt-4 text-xl font-semibold text-[#F5F7F1]">{current.title}</h2>
        <p className="mt-2 text-sm text-[#B4BCA9] leading-relaxed">{current.body}</p>

        <div className="mt-6 flex items-center justify-between gap-3">
          {step < 2 ? (
            <>
              <button
                type="button"
                onClick={() => onFinish(false)}
                className="text-sm text-[#9AA491] hover:text-[#F5F7F1] min-h-[44px] px-2"
              >
                Passer
              </button>
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="inline-flex items-center gap-2 rounded-full bg-[#C8F62D] px-5 py-2.5 text-sm font-semibold text-[#080A07] hover:bg-[#D7FA59] min-h-[44px]"
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
                className="flex-1 rounded-full border border-white/15 bg-[#161B13] px-4 py-2.5 text-sm font-medium text-[#D6DDD0] hover:bg-[#1E251A] min-h-[44px]"
              >
                Voir mon Dashboard
              </button>
              <button
                type="button"
                onClick={() => onFinish(true)}
                className="flex-1 rounded-full bg-[#C8F62D] px-4 py-2.5 text-sm font-semibold text-[#080A07] hover:bg-[#D7FA59] min-h-[44px]"
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
