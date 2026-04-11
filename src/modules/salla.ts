import crypto from 'crypto';
import { prisma } from '../infra/prisma.js';

const SALLA_AUTH_BASE = 'https://accounts.salla.sa/oauth2/auth';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const SALLA_API_BASE = 'https://api.salla.dev/admin/v2';

const clientId = process.env.SALLA_CLIENT_ID || '';
const clientSecret = process.env.SALLA_CLIENT_SECRET || '';
const redirectUri = process.env.SALLA_REDIRECT_URI || '';

const buildState = () => crypto.randomBytes(16).toString('hex');

export const getSallaAuthUrl = async () => {
  const state = buildState();

  await prisma.appSetting.upsert({
    where: { key: 'salla_oauth_state' },
    update: { value: state },
    create: { key: 'salla_oauth_state', value: state }
  });

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: 'offline_access orders.read',
    state
  });

  return `${SALLA_AUTH_BASE}?${params.toString()}`;
};

export const getSavedSallaState = async () => {
  const row = await prisma.appSetting.findUnique({
    where: { key: 'salla_oauth_state' }
  });

  return row?.value || '';
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
    create: {
      key: 'salla_access_token',
      value: tokenData.access_token
    }
  });

  if (tokenData.refresh_token) {
    await prisma.appSetting.upsert({
      where: { key: 'salla_refresh_token' },
      update: { value: tokenData.refresh_token },
      create: {
        key: 'salla_refresh_token',
        value: tokenData.refresh_token
      }
    });
  }
};

export const getSallaAccessToken = async () => {
  const token = await prisma.appSetting.findUnique({
    where: { key: 'salla_access_token' }
  });

  if (!token?.value) {
    throw new Error('Salla access token is not saved yet');
  }

  return token.value;
};

export const fetchSallaOrderByReference = async (referenceId: string) => {
  const accessToken = await getSallaAccessToken();

  const url = `${SALLA_API_BASE}/orders?reference_id=${encodeURIComponent(referenceId)}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Salla orders lookup failed: ${text}`);
  }

  return response.json();
};