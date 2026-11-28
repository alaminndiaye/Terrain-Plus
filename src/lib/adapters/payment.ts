import {
  CONSULTATION_PRICE_FCFA,
  DOCTOR_NET_FCFA,
  PLATFORM_COMMISSION_FCFA,
} from '../config';
import { AppError } from '../http/errors';
import { signHmacHex, verifyHmacHex } from '../security/crypto';

export type PaymentChannel = 'wave_sandbox' | 'orange_money_sandbox' | 'card_sandbox';

export interface FixedConsultationBreakdown {
  grossAmountFcfa: number;
  platformCommissionFcfa: number;
  doctorNetFcfa: number;
  commissionRatePercent: number;
  description: string;
}

export function getFixedConsultationBreakdown(): FixedConsultationBreakdown {
  return {
    grossAmountFcfa: CONSULTATION_PRICE_FCFA,
    platformCommissionFcfa: PLATFORM_COMMISSION_FCFA,
    doctorNetFcfa: DOCTOR_NET_FCFA,
    commissionRatePercent: 10,
    description: 'Consultation unique tout compris (chat temps réel, médias, visio ou cabinet)',
  };
}

export function signSandboxWebhook(payloadObject: Record<string, unknown>, webhookSecret: string) {
  const rawPayload = JSON.stringify(payloadObject);
  const signature = signHmacHex(rawPayload, webhookSecret);
  return { rawPayload, signature };
}

export function verifyWebhookSignature(
  rawPayload: string,
  signatureHeader: string,
  webhookSecret: string
) {
  if (!verifyHmacHex(rawPayload, signatureHeader, webhookSecret)) {
    throw new AppError(401, 'INVALID_WEBHOOK_SIGNATURE', 'Signature webhook de paiement invalide.');
  }
}
