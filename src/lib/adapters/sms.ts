import { getAppConfig } from '../config';

export interface SmsSendResult {
  delivered: boolean;
  provider: 'sandbox' | 'webhook';
  sandboxCode?: string;
}

/**
 * Send OTP code by SMS without ever exposing medical information.
 */
export async function sendOtpSms(params: {
  phone: string;
  code: string;
  purpose: 'signup_otp' | 'password_reset';
}): Promise<SmsSendResult> {
  const config = getAppConfig();
  const actionLabel =
    params.purpose === 'signup_otp'
      ? 'valider votre inscription Terrain+'
      : 'réinitialiser votre mot de passe Terrain+';
  const message = `Terrain+ : votre code de vérification est ${params.code} pour ${actionLabel}. Valable 10 min.`;

  if (config.smsAdapter === 'webhook' && config.smsWebhookUrl) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.smsWebhookToken) {
      headers.Authorization = `Bearer ${config.smsWebhookToken}`;
    }
    const res = await fetch(config.smsWebhookUrl, {
      method: 'POST',
      signal: AbortSignal.timeout(8000),
      headers,
      body: JSON.stringify({
        to: params.phone,
        code: params.code,
        purpose: params.purpose,
        message,
      }),
    });
    if (!res.ok) {
      throw new Error(`SMS provider error (${res.status})`);
    }
    return { delivered: true, provider: 'webhook' };
  }

  return {
    delivered: true,
    provider: 'sandbox',
    ...(config.demoMode ? { sandboxCode: params.code } : {}),
  };
}
