import { DateTime } from "luxon";

interface MpCredentials {
  clientId: string;
  clientSecret: string;
}

interface TokenCache {
  token: string;
  expiresAt: number;
}

// In-memory token cache per tenant — safe for single-process deployment
const tokenCache = new Map<number, TokenCache>();

async function getMpAccessToken(tenantId: number, creds: MpCredentials): Promise<string> {
  const cached = tokenCache.get(tenantId);
  // Refresh 60s before expiry to avoid edge cases
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'client_credentials',
  });

  const response = await fetch('https://api.mercadopago.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`MercadoPago OAuth failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { access_token: string; expires_in: number };

  if (!data.access_token) {
    throw new Error('MercadoPago OAuth: no access_token in response');
  }

  tokenCache.set(tenantId, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
}

export interface CreatePixPayload {
  amount: number;
  externalReference: string;
  email: string;
  description: string;
  idempotencyKey: string;
  dateOfExpiration: string; // ISO 8601 with -03:00 offset
}

export interface PixPaymentResponse {
  pixCopiaECola: string;
  transactionId: number;
  qrCodeBase64: string;
  expirationDate: string;
}

export async function createPixPayment(
  tenantId: number,
  creds: MpCredentials,
  payload: CreatePixPayload,
): Promise<PixPaymentResponse> {
  const token = await getMpAccessToken(tenantId, creds);

  const body = {
    transaction_amount: payload.amount,
    date_of_expiration: payload.dateOfExpiration,
    payment_method_id: 'pix',
    description: payload.description,
    external_reference: payload.externalReference,
    payer: {
      entity_type: 'individual',
      type: 'customer',
      email: payload.email,
    },
  };

  const response = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'X-Idempotency-Key': payload.idempotencyKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MercadoPago payment creation failed (${response.status}): ${errBody}`);
  }

  const data = await response.json() as {
    id: number;
    point_of_interaction: {
      transaction_data: {
        qr_code: string;
        transaction_id: number;
        qr_code_base64: string;
      };
    };
  };

  // Use data.id (main MP payment ID) — transaction_data.transaction_id can be null
  return {
    pixCopiaECola: data.point_of_interaction.transaction_data.qr_code,
    transactionId: data.id,
    qrCodeBase64: data.point_of_interaction.transaction_data.qr_code_base64,
    expirationDate: payload.dateOfExpiration,
  };
}

export interface MpPaymentDetail {
  id: number;
  status: string;
  date_approved: string | null;
  external_reference: string;
  transaction_amount: number;
}

export async function getMpPayment(
  tenantId: number,
  creds: MpCredentials,
  paymentId: string | number,
): Promise<MpPaymentDetail> {
  const token = await getMpAccessToken(tenantId, creds);

  const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`MercadoPago get payment failed (${response.status}): ${errBody}`);
  }

  return response.json() as Promise<MpPaymentDetail>;
}

export function invalidateTokenCache(tenantId: number): void {
  tokenCache.delete(tenantId);
}

/** Attempt OAuth to validate credentials without creating a payment */
export async function validateMpCredentials(creds: MpCredentials): Promise<boolean> {
  try {
    const params = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      grant_type: 'client_credentials',
    });
    const response = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function buildExpirationDate(): string {
  return DateTime.now()
    .setZone("America/Sao_Paulo")
    .plus({ minutes: 30 })
    .toISO({ suppressMilliseconds: true })
}
