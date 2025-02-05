import React, { useState } from 'react';
import { DropZone } from './components/DropZone';
import { InstagramInput } from './components/InstagramInput';
import { TranscriptionOutput } from './components/TranscriptionResult';
import { Background } from './components/Background';
import { processFile } from './utils/fileProcessor';
import { downloadInstagramReel } from './utils/instagramDownloader';
import { TranscriptionResult } from './types';
import { Headphones, Waves } from 'lucide-react';
import './styles/theme.css';

function App() {
  const [result, setResult] = useState<TranscriptionResult>({
    text: '',
    isLoading: false,
    error: null,
  });

  const handleFileAccepted = async (file: File) => {
    setResult({ text: '', isLoading: true, error: null });

    try {
      const transcription = await processFile(file);
      setResult({ text: transcription, isLoading: false, error: null });
    } catch (error) {
      setResult({
        text: '',
        isLoading: false,
        error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
      });
    }
  };

  const handleReelSubmit = async (url: string) => {
    setResult({ text: '', isLoading: true, error: null });

    try {
      const videoFile = await downloadInstagramReel(url);
      const transcription = await processFile(videoFile);
      setResult({ text: transcription, isLoading: false, error: null });
    } catch (error) {
      setResult({
        text: '',
        isLoading: false,
        error: error instanceof Error ? error.message : 'Ein unbekannter Fehler ist aufgetreten',
      });
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      <Background />
      <div className="max-w-3xl mx-auto relative">
        <div className="text-center mb-16 slide-up">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="relative">
              <div className="absolute inset-0 animate-pulse-slow blur-xl bg-primary/30" />
              <Headphones className="h-14 w-14 text-primary relative" />
            </div>
            <div className="relative">
              <div className="absolute inset-0 animate-pulse-slow blur-xl bg-secondary/30" />
              <Waves className="h-12 w-12 text-secondary relative animate-pulse" />
            </div>
          </div>
          <h1 className="mt-4 text-5xl font-bold">
            <span className="bg-gradient-to-r from-primary via-secondary to-primary bg-clip-text text-transparent bg-300% animate-gradient">
              Audio & Video Transkription
            </span>
          </h1>
          <p className="mt-6 text-text-secondary text-lg max-w-2xl mx-auto">
            Laden Sie eine Audio- oder Videodatei hoch oder geben Sie einen Instagram Reel Link ein
          </p>
        </div>

        <div className="space-y-8 fade-in relative">
          <div className="card-modern p-6">
            <InstagramInput 
              onReelSubmit={handleReelSubmit}
              isLoading={result.isLoading}
            />
          </div>

          <div className="card-modern p-6">
            <DropZone 
              onFileAccepted={handleFileAccepted}
              isLoading={result.isLoading}
            />
          </div>

          <TranscriptionOutput result={result} />
        </div>
      </div>
    </div>
  );
}

export default App;
