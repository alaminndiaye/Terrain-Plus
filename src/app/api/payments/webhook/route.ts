import { jsonError, jsonOk } from '@/lib/http/errors';
import { processVerifiedPaymentWebhook } from '@/lib/payments/processWebhook';

export async function POST(req: Request) {
  try {
    const rawPayload = await req.text();
    const signature = req.headers.get('x-sandbox-signature') || '';
    const result = await processVerifiedPaymentWebhook(rawPayload, signature);
    return jsonOk(result);
  } catch (err) {
    return jsonError(err);
  }
}
