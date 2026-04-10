import { prisma } from '../infra/prisma.js';

const SALLA_AUTH_BASE = 'https://accounts.salla.sa/oauth2/auth';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';

const clientId = process.env.SALLA_CLIENT_ID || '';
const clientSecret = process.env.SALLA_CLIENT_SECRET || '';
const redirectUri = process.env.SALLA_REDIRECT_URI || '';

export const getSallaAuthUrl = () => {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'offline_access orders.read'
  });

  return `${SALLA_AUTH_BASE}?${params.toString()}`;
};

export const exchangeSallaCode = async (code: string) => {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });

  const response = await fetch(SALLA_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Salla token exchange failed: ${text}`);
  }

  return response.json();
};

export const saveSallaTokens = async (tokenData: {
  access_token: string;
  refresh_token?: string;
}) => {
  await prisma.appSetting.upsert({
    where: { key: 'salla_access_token' },
    update: { value: tokenData.access_token },
    create: { key: 'salla_access_token', value: tokenData.access_token }
  });

  if (tokenData.refresh_token) {
    await prisma.appSetting.upsert({
      where: { key: 'salla_refresh_token' },
      update: { value: tokenData.refresh_token },
      create: { key: 'salla_refresh_token', value: tokenData.refresh_token }
    });
  }
};