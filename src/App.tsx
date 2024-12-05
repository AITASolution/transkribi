import React, { useState } from 'react';
import { DropZone } from './components/DropZone';
import { InstagramInput } from './components/InstagramInput';
import { TranscriptionOutput } from './components/TranscriptionResult';
import { processFile } from './utils/fileProcessor';
import { downloadInstagramReel } from './utils/instagramDownloader';
import { TranscriptionResult } from './types';
import { Headphones } from 'lucide-react';

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
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <Headphones className="mx-auto h-12 w-12 text-blue-500" />
          <h1 className="mt-4 text-3xl font-bold text-gray-900">
            Audio & Video Transkription
          </h1>
          <p className="mt-2 text-gray-600">
            Laden Sie eine Audio- oder Videodatei hoch oder geben Sie einen Instagram Reel Link ein
          </p>
        </div>

        <InstagramInput 
          onReelSubmit={handleReelSubmit}
          isLoading={result.isLoading}
        />

        <DropZone 
          onFileAccepted={handleFileAccepted}
          isLoading={result.isLoading}
        />

        <TranscriptionOutput result={result} />
      </div>
    </div>
  );
}

export default App;