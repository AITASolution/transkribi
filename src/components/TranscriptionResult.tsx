import React from 'react';
import { TranscriptionResult } from '../types';

interface TranscriptionResultProps {
  result: TranscriptionResult;
}

export function TranscriptionOutput({ result }: TranscriptionResultProps) {
  if (result.isLoading) {
    return (
      <div className="mt-6 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-500 border-t-transparent"></div>
        <p className="mt-2 text-gray-600">Transkription wird erstellt...</p>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">{result.error}</p>
      </div>
    );
  }

  if (!result.text) {
    return null;
  }

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-3">Transkription:</h2>
      <div className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm">
        <p className="whitespace-pre-wrap">{result.text}</p>
      </div>
    </div>
  );
}