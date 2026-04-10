import crypto from 'crypto';

const STEAM_CHARS = '23456789BCDFGHJKMNPQRTVWXY';

export const generateSteamGuardCode = (sharedSecret: string) => {
  const secret = Buffer.from(sharedSecret, 'base64');
  const time = Math.floor(Date.now() / 1000 / 30);

  const buffer = Buffer.alloc(8);
  buffer.writeUInt32BE(0, 0);
  buffer.writeUInt32BE(time, 4);

  const hmac = crypto.createHmac('sha1', secret).update(buffer).digest();
  const offset = hmac[19] & 0x0f;

  let codePoint = hmac.readUInt32BE(offset) & 0x7fffffff;
  let code = '';

  for (let i = 0; i < 5; i++) {
    code += STEAM_CHARS[codePoint % STEAM_CHARS.length];
    codePoint = Math.floor(codePoint / STEAM_CHARS.length);
  }

  return code;
};