import React, { useEffect } from 'react';
import { FileText, Globe, Lock, Scale, ShieldCheck, X } from 'lucide-react';
import {
  LEGAL_DOCUMENTS,
  LEGAL_PLATFORM_META,
  type LegalDocTab,
} from '../data/legalDocs';

interface LegalModalProps {
  open: boolean;
  activeTab: LegalDocTab;
  onChangeTab: (tab: LegalDocTab) => void;
  onClose: () => void;
}

const TAB_ICONS: Record<LegalDocTab, React.ComponentType<{ className?: string }>> = {
  confidentialite: Lock,
  cgu: ShieldCheck,
  cgv: Scale,
  mentions: FileText,
};

export const LegalModal: React.FC<LegalModalProps> = ({
  open,
  activeTab,
  onChangeTab,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const doc = LEGAL_DOCUMENTS[activeTab];
  const tabs: LegalDocTab[] = ['confidentialite', 'cgu', 'cgv', 'mentions'];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#063725]/45 backdrop-blur-sm p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-[#D5E2DA] bg-white text-[#063725] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E2EBE5] bg-[#F6F8F5] px-5 py-4 sm:px-6">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#0D6E46]">
              <span className="font-semibold">{doc.reference}</span>
              <span className="text-[#5B7064]">·</span>
              <span className="inline-flex items-center gap-1 text-[#475E52]">
                <Globe className="h-3 w-3 text-[#0D6E46]" aria-hidden="true" />
                {LEGAL_PLATFORM_META.domain}
              </span>
            </div>
            <h2 id="legal-modal-title" className="font-display text-lg sm:text-xl font-bold text-[#063725]">
              {doc.title}
            </h2>
            <p className="text-xs text-[#475E52] leading-relaxed">{doc.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer les informations légales"
            className="rounded-full border border-[#D5E2DA] bg-white p-2 text-[#475E52] hover:text-[#063725] hover:bg-[#F1F6F3] min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="border-b border-[#E2EBE5] bg-white px-4 py-2.5 sm:px-6 overflow-x-auto">
          <div className="flex items-center gap-2 min-w-max">
            {tabs.map((tabId) => {
              const Icon = TAB_ICONS[tabId];
              const isActive = tabId === activeTab;
              return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => onChangeTab(tabId)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors min-h-[36px] whitespace-nowrap ${
                    isActive
                      ? 'bg-[#0D6E46] text-white'
                      : 'border border-[#D5E2DA] bg-[#F6F8F5] text-[#3D5246] hover:text-[#063725] hover:border-[#0D6E46]/40'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{LEGAL_DOCUMENTS[tabId].tabLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6 space-y-5 bg-[#F6F8F5]">
          {doc.sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-2xl border border-[#D5E2DA] bg-white p-4 sm:p-5 space-y-2.5"
            >
              <h3 className="text-sm font-bold text-[#063725]">{section.heading}</h3>
              {section.paragraphs.map((p, idx) => (
                <p key={idx} className="text-xs sm:text-[13px] text-[#3D5246] leading-relaxed">
                  {p}
                </p>
              ))}
              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-1.5 pt-1">
                  {section.bullets.map((b, idx) => (
                    <li
                      key={idx}
                      className="flex items-start gap-2 text-xs sm:text-[13px] text-[#3D5246] leading-relaxed"
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0D6E46] shrink-0" aria-hidden="true" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E2EBE5] bg-white px-5 py-3.5 sm:px-6 text-xs text-[#5B7064]">
          <span>
            {doc.updatedAt} · Contact CDP : <strong className="text-[#063725]">{LEGAL_PLATFORM_META.dpoContact}</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-[#0D6E46] px-5 py-2 text-xs font-bold text-white hover:bg-[#095637] min-h-[38px]"
          >
            J’ai compris
          </button>
        </div>
      </div>
    </div>
  );
};
