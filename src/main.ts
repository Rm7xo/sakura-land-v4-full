import 'dotenv/config';
import express from 'express';
import { bot } from './bot/index.js';
import {
  getSallaAuthUrl,
  exchangeSallaCode,
  saveSallaTokens,
  getSavedSallaState
} from './modules/salla.js';

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Sakura Land V4 Full is running');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/install', async (_req, res) => {
  try {
    const authUrl = await getSallaAuthUrl();
    return res.redirect(authUrl);
  } catch (error) {
    console.error(error);
    return res.status(500).send('Failed to generate Salla auth URL');
  }
});

app.get('/callback', async (req, res) => {
  try {
    const error = String(req.query.error || '');
    const errorDescription = String(req.query.error_description || '');

    if (error) {
      return res
        .status(400)
        .send(`Salla OAuth error: ${error} ${errorDescription}`);
    }

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');

    if (!code) {
      return res.status(400).send('Missing code');
    }

    const savedState = await getSavedSallaState();

    if (!state || !savedState || state !== savedState) {
      return res.status(400).send('Invalid state');
    }

    const tokenData = await exchangeSallaCode(code);
    await saveSallaTokens(tokenData);

    return res.send('Salla connected successfully');
  } catch (error) {
    console.error(error);
    return res.status(500).send('Salla callback failed');
  }
});

const port = Number(process.env.PORT || 3000);

app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  await bot.launch();
  console.log('Telegram bot launched');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));