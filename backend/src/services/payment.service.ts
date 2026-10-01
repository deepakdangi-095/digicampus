import crypto from 'crypto';

/**
 * Payment gateway seam. The default provider settles instantly so the whole fee flow (pay -> receipt) works
 * end-to-end in demos. To go live, implement `charge` against Razorpay/Paytm/Stripe (create order, verify the
 * signed webhook) and keep the return shape; no route needs to change.
 */
export interface PaymentResult { ok: boolean; transactionId: string }

export async function charge(_params: { feeId: string; amount: number; payerId: string }): Promise<PaymentResult> {
  return { ok: true, transactionId: `MOCK-${crypto.randomBytes(5).toString('hex').toUpperCase()}` };
}

export function newReceiptNumber(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RCP-${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}
