import { Hono } from 'hono';
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';
import { z } from 'zod';

export const transcriptRouter = new Hono();

// YouTube video ID: exactly 11 chars, alphanumeric + - _
const videoIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{11}$/);

const manualParseSchema = z.object({
  text: z.string().min(1).max(200_000),
});

// ─── GET /api/transcript?videoId=XXX ────────────────────────────────

transcriptRouter.get('/transcript', async (c) => {
  const videoId = c.req.query('videoId');

  if (!videoId || !videoIdSchema.safeParse(videoId).success) {
    return c.json({ error: 'videoId query param is required (11-char YouTube ID)' }, 400);
  }

  try {
    const segments = await fetchYouTubeTranscript(videoId);

    if (!segments.length) {
      return c.json(
        { error: 'no_captions', message: 'No captions found for this video.' },
        404
      );
    }

    const fullText = segments.map((s) => s.text).join(' ');

    return c.json({
      transcript: {
        videoId,
        source: 'youtube_cc',
        language: 'en',
        segments,
        fullText,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[transcript] fetch failed for ${videoId}:`, message);

    return c.json(
      { error: 'no_captions', message: 'No captions available for this video.' },
      404
    );
  }
});

// ─── POST /api/transcript/parse — parse raw pasted text into segments ─

transcriptRouter.post('/transcript/parse', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const parsed = manualParseSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid body', details: parsed.error.flatten() }, 400);
  }

  const { text } = parsed.data;
  const segments = parseManualTranscript(text);

  return c.json({
    transcript: {
      source: 'user_paste',
      language: 'en',
      segments,
      fullText: text,
    },
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────

async function fetchYouTubeTranscript(
  videoId: string
): Promise<{ text: string; start: number; duration: number }[]> {
  const result = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });

  if (!result?.length) throw new Error('Empty transcript returned');

  return result.map((item) => {
    // youtube-transcript returns ms on some versions, seconds on others
    const isMs = item.offset > 500;
    const start = isMs ? item.offset / 1000 : item.offset;
    const duration = isMs ? item.duration / 1000 : item.duration;
    return {
      text: item.text,
      start: Math.round(start * 100) / 100,
      duration: Math.round(duration * 100) / 100,
    };
  });
}

function parseManualTranscript(
  text: string
): { text: string; start: number; duration: number }[] {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  const SECONDS_PER_WORD = 60 / 150; // 150 words/min

  let currentTime = 0;
  return sentences.map((sentence) => {
    const wordCount = sentence.split(/\s+/).length;
    const duration = wordCount * SECONDS_PER_WORD;
    const segment = {
      text: sentence.trim(),
      start: Math.round(currentTime * 100) / 100,
      duration: Math.round(duration * 100) / 100,
    };
    currentTime += duration;
    return segment;
  });
}
