import React from 'react';
import { TranscriptionResult } from '../types';
import { AlertTriangle, FileText, CheckCircle2, Copy } from 'lucide-react';

interface TranscriptionResultProps {
  result: TranscriptionResult;
}

export function TranscriptionOutput({ result }: TranscriptionResultProps) {
  if (result.isLoading) {
    return (
      <div className="card-modern p-8 text-center fade-in">
        <div className="loading-spinner mx-auto mb-4"></div>
        <p className="text-text-secondary">
          Transkription wird erstellt...
        </p>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="card-modern p-6 border-2 border-error/10 bg-error/5 slide-up">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-full bg-error/10">
            <AlertTriangle className="h-5 w-5 text-error" />
          </div>
          <div>
            <h3 className="font-medium text-error mb-1">
              Fehler bei der Transkription
            </h3>
            <p className="text-error/80">{result.error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!result.text) {
    return null;
  }

  return (
    <div className="slide-up">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-text">Transkription</h2>
      </div>
      <div className="card-modern p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <span className="text-sm text-text-secondary">
              Transkription erfolgreich
            </span>
          </div>
          <button 
            onClick={() => navigator.clipboard.writeText(result.text)}
            className="text-primary hover:text-primary-dark transition-colors flex items-center gap-1 text-sm"
          >
            <Copy className="h-4 w-4" />
            Kopieren
          </button>
        </div>
        <div className="border-t border-border pt-4">
          <p className="whitespace-pre-wrap text-text">{result.text}</p>
        </div>
      </div>
    </div>
  );
}
