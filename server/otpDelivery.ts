export interface OtpDeliveryInput {
  email: string;
  telephone: string;
  prenom: string;
  code: string;
  purpose: 'VERIFICATION' | 'CONNEXION' | 'REINITIALISATION';
}

export interface OtpDeliveryResult {
  delivered: boolean;
  channel: 'email' | 'webhook' | null;
  error?: string;
}

export function isOtpDeliveryConfigured(): boolean {
  const hasResend = Boolean((process.env.RESEND_API_KEY || '').trim() && (process.env.OTP_FROM_EMAIL || '').trim());
  const hasWebhook = Boolean((process.env.OTP_WEBHOOK_URL || '').trim());
  return hasResend || hasWebhook;
}

function getPurposeLabel(purpose: OtpDeliveryInput['purpose']): { subject: string; actionText: string } {
  if (purpose === 'VERIFICATION') {
    return {
      subject: 'Terrain+ — Code de vérification de votre compte',
      actionText: 'valider votre inscription sur Terrain+',
    };
  }
  if (purpose === 'REINITIALISATION') {
    return {
      subject: 'Terrain+ — Réinitialisation de votre mot de passe',
      actionText: 'réinitialiser votre mot de passe Terrain+',
    };
  }
  return {
    subject: 'Terrain+ — Code de connexion à usage unique',
    actionText: 'vous connecter à votre espace Terrain+',
  };
}

export async function deliverOtpCode(input: OtpDeliveryInput): Promise<OtpDeliveryResult> {
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.OTP_FROM_EMAIL || '').trim();
  const webhookUrl = (process.env.OTP_WEBHOOK_URL || '').trim();
  const webhookToken = (process.env.OTP_WEBHOOK_TOKEN || '').trim();

  const { subject, actionText } = getPurposeLabel(input.purpose);

  if (resendApiKey && fromEmail && input.email) {
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [input.email],
          subject,
          text: `Bonjour ${input.prenom || 'Sportif'},\n\nVotre code de sécurité à 6 chiffres pour ${actionText} est : ${input.code}\n\nCe code est valable pendant 15 minutes. Ne le partagez avec personne.\n\nL'équipe Terrain+`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #080A07; color: #F5F7F1; border-radius: 16px;">
              <h2 style="margin: 0 0 12px; color: #C8F62D;">Terrain+</h2>
              <p style="margin: 0 0 16px; line-height: 1.5;">Bonjour ${input.prenom || ''},</p>
              <p style="margin: 0 0 16px; line-height: 1.5;">Voici votre code à usage unique pour ${actionText} :</p>
              <div style="font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 16px; text-align: center; background: #121610; border: 1px solid #C8F62D; border-radius: 12px; color: #C8F62D;">
                ${input.code}
              </div>
              <p style="margin: 16px 0 0; font-size: 12px; color: #B4BCA9;">Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
            </div>
          `,
        }),
      });
      if (response.ok) {
        return { delivered: true, channel: 'email' };
      }
      const errText = await response.text().catch(() => '');
      console.error('[OTP Email] Échec envoi Resend:', response.status, errText);
    } catch (err) {
      console.error('[OTP Email] Exception Resend:', err instanceof Error ? err.message : err);
    }
  }

  if (webhookUrl) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (webhookToken) {
        headers.Authorization = `Bearer ${webhookToken}`;
      }
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          toPhone: input.telephone,
          toEmail: input.email,
          prenom: input.prenom,
          code: input.code,
          purpose: input.purpose,
          message: `Terrain+ : votre code pour ${actionText} est ${input.code} (valable 15 min).`,
        }),
      });
      if (response.ok) {
        return { delivered: true, channel: 'webhook' };
      }
      const errText = await response.text().catch(() => '');
      console.error('[OTP Webhook] Échec envoi:', response.status, errText);
    } catch (err) {
      console.error('[OTP Webhook] Exception:', err instanceof Error ? err.message : err);
    }
  }

  return {
    delivered: false,
    channel: null,
    error: "Service d'envoi OTP indisponible pour le moment.",
  };
}
