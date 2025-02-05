import express, { Request, Response } from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import axios from 'axios';
import formidable from 'formidable';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Transcription endpoint
app.post('/api/transcribe', async (req: Request, res: Response) => {
  try {
    const form = formidable({
      keepExtensions: true,
      filter: (part) => {
        console.log('📝 Received file part:', {
          name: part.originalFilename,
          type: part.mimetype
        });
        return part.mimetype === 'audio/wav' || 
               part.originalFilename?.endsWith('.wav') || 
               false;
      }
    });
    
    const [, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    console.log('📝 Processing file:', {
      name: file.originalFilename,
      type: file.mimetype,
      size: file.size
    });

    // Verify file exists and is readable
    try {
      await fs.promises.access(file.filepath, fs.constants.R_OK);
    } catch (error) {
      console.error('❌ File access error:', error);
      res.status(500).json({ error: 'File access error' });
      return;
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Read file stats for verification
    const stats = await fs.promises.stat(file.filepath);
    console.log('📝 File stats:', {
      size: stats.size,
      path: file.filepath
    });

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(file.filepath),
      model: 'whisper-1',
      language: 'de',
    });

    console.log('✅ Transcription successful');
    res.status(200).json({ text: transcription.text });
  } catch (error) {
    console.error('❌ Transcription error:', error);
    if (error instanceof Error) {
      res.status(500).json({ 
        error: 'Transcription failed',
        details: error.message
      });
    } else {
      res.status(500).json({ error: 'Transcription failed' });
    }
  }
});

// Instagram endpoint
app.post('/api/instagram', async (req: Request, res: Response) => {
  const { url } = req.body;

  if (!url) {
    res.status(400).json({ error: 'URL is required' });
    return;
  }

  if (!process.env.RAPID_API_KEY) {
    res.status(500).json({ error: 'RapidAPI key is not configured' });
    return;
  }

  const RAPID_API_HOST = 'instagram-downloader-download-instagram-stories-videos4.p.rapidapi.com';

  try {
    const response = await axios.get(`https://${RAPID_API_HOST}/convert`, {
      params: { url },
      headers: {
        'X-RapidAPI-Key': process.env.RAPID_API_KEY,
        'X-RapidAPI-Host': RAPID_API_HOST,
      },
      maxRedirects: 5,
    });

    const data = response.data;
    
    if (!data?.media?.[0]?.url) {
      res.status(404).json({ error: 'No video URL found in response' });
      return;
    }

    const videoUrl = data.media[0].url;
    
    if (videoUrl.startsWith('https://kk.igdows.workers.dev/?url=')) {
      const decodedUrl = decodeURIComponent(videoUrl.split('?url=')[1]);
      res.status(200).json({ videoUrl: decodedUrl });
      return;
    }

    res.status(200).json({ videoUrl });
  } catch (error) {
    console.error('Instagram API error:', error);
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 429) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }
      if (error.response?.status === 404) {
        res.status(404).json({ error: 'Video not found' });
        return;
      }
    }
    res.status(500).json({ error: 'Failed to fetch Instagram data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
