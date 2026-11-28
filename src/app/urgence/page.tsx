'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { AppShell } from '@/components/AppShell';
import { apiFetch } from '@/lib/apiClient';

interface EmergencyData {
  title: string;
  banner: string;
  guidance: string[];
  emergencyContacts: Array<{ label: string; value: string }>;
  disclaimer: string;
}

export default function EmergencySafetyPage() {
  const [data, setData] = useState<EmergencyData | null>(null);

  useEffect(() => {
    apiFetch<EmergencyData>('/api/public/emergency-safety').then(setData).catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto">
        {data && (
          <section className="bg-red-50 border border-red-300 border-l-4 border-l-red-700 rounded-xl p-6 space-y-5">
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold bg-red-700 text-white px-3 py-1 rounded-full">
              <ShieldAlert className="w-4 h-4" />
              {data.banner}
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold text-red-950">{data.title}</h1>
            <ul className="space-y-3 list-disc pl-5 text-sm text-red-950 leading-relaxed">
              {data.guidance.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
            <div className="bg-white rounded-2xl p-5 border border-red-200 space-y-2">
              <h2 className="font-bold text-base text-red-950">Contacts d’urgence</h2>
              {data.emergencyContacts.map((c) => (
                <p key={c.label} className="text-sm">
                  <strong>{c.label} :</strong> {c.value}
                </p>
              ))}
              <p className="text-xs text-[#475E52] pt-2">{data.disclaimer}</p>
            </div>
            <Link href="/" className="inline-block px-5 py-2.5 rounded-full bg-white border border-[#D5E2DA] hover:bg-[#F1F6F3] text-[#063725] text-sm font-semibold transition">
              Retour à l’accueil
            </Link>
          </section>
        )}
      </div>
    </AppShell>
  );
}
