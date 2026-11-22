import React, { useState } from 'react';
import { LEGAL_PLATFORM_META, type LegalDocTab } from '../data/legalDocs';
import { LegalModal } from './LegalModal';

interface LegalFooterProps {
  variant?: 'full' | 'compact';
  className?: string;
}

export const LegalFooter: React.FC<LegalFooterProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const [legalTab, setLegalTab] = useState<LegalDocTab | null>(null);

  const navLinks = (
    <nav
      aria-label="Liens légaux et conformité CDP Sénégal"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"
    >
      <button
        type="button"
        onClick={() => setLegalTab('cgu')}
        className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4 transition-colors"
      >
        Conditions Générales d’Utilisation (CGU)
      </button>
      <button
        type="button"
        onClick={() => setLegalTab('confidentialite')}
        className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4 transition-colors"
      >
        Politique de Confidentialité (CDP Sénégal · Loi 2008-12)
      </button>
      <button
        type="button"
        onClick={() => setLegalTab('cgv')}
        className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4 transition-colors"
      >
        CGV (Tarifs FCFA)
      </button>
      <button
        type="button"
        onClick={() => setLegalTab('mentions')}
        className="text-[#3D5246] hover:text-[#0D6E46] underline underline-offset-4 transition-colors"
      >
        Mentions Légales
      </button>
    </nav>
  );

  return (
    <>
      {variant === 'full' ? (
        <footer className={`border-t border-[#D5E2DA] bg-white py-7 ${className}`}>
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-[#475E52]">
              <div className="flex flex-wrap items-center gap-3">
                <img
                  src="/brand/terrain-logo.png"
                  alt="Terrain+"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="h-7 w-auto object-contain shrink-0"
                />
                <span>
                  {LEGAL_PLATFORM_META.founders} · {LEGAL_PLATFORM_META.institution}
                </span>
              </div>
              <span className="font-mono text-[#0D6E46] font-semibold">{LEGAL_PLATFORM_META.domain}</span>
            </div>

            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 border-t border-[#E2EBE5] pt-4">
              {navLinks}
              <span className="text-xs text-[#5B7064]">
                Suivi sportif encadré · Ne remplace pas un avis médical
              </span>
            </div>
          </div>
        </footer>
      ) : (
        <footer
          className={`border-t border-[#D5E2DA] pt-5 pb-2 flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 text-xs text-[#5B7064] ${className}`}
        >
          <span>
            {LEGAL_PLATFORM_META.domain} · Conformité {LEGAL_PLATFORM_META.legalFramework}
          </span>
          {navLinks}
        </footer>
      )}

      <LegalModal
        open={legalTab !== null}
        activeTab={legalTab || 'confidentialite'}
        onChangeTab={(next) => setLegalTab(next)}
        onClose={() => setLegalTab(null)}
      />
    </>
  );
};
