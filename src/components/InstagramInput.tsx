import React, { useState } from 'react';
import * as lucideReact from 'lucide-react';

interface InstagramInputProps {
  onReelSubmit: (url: string) => void;
  isLoading: boolean;
}

export function InstagramInput({ onReelSubmit, isLoading }: InstagramInputProps) {
  const [reelUrl, setReelUrl] = useState('');
  const [error, setError] = useState('');

  const validateInstagramUrl = (url: string): boolean => {
    const regex = /^https:\/\/(?:www\.)?instagram\.com\/reel\/[\w-]+/;
    return regex.test(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!reelUrl.trim()) {
      setError('Bitte geben Sie eine URL ein');
      return;
    }

    if (!validateInstagramUrl(reelUrl)) {
      setError('Bitte geben Sie eine gültige Instagram Reel URL ein');
      return;
    }

    onReelSubmit(reelUrl.trim());
    setReelUrl('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        <div>
          <label htmlFor="reelUrl" className="block text-sm font-medium text-text mb-2">
            Instagram Reel URL
          </label>
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors duration-200">
              <lucideReact.Instagram 
                className={`h-5 w-5 ${error ? 'text-error' : 'text-text-secondary group-hover:text-primary'}`} 
              />
            </div>
            <input
              type="url"
              id="reelUrl"
              className={`input-modern pl-10 ${
                error 
                  ? 'border-error focus:border-error focus:ring-error/10' 
                  : 'focus:border-primary focus:ring-primary/10'
              }`}
              placeholder="https://www.instagram.com/reel/..."
              value={reelUrl}
              onChange={(e) => {
                setReelUrl(e.target.value);
                setError('');
              }}
              disabled={isLoading}
            />
          </div>
          {error && (
            <p className="mt-2 text-sm text-error flex items-center gap-1">
              <lucideReact.AlertCircle className="h-4 w-4" />
              {error}
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !reelUrl.trim()}
          className={`button-modern w-full flex items-center justify-center gap-2
            ${isLoading || !reelUrl.trim()
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:translate-y-[-2px] active:translate-y-0'
            }`}
        >
          {isLoading ? (
            <>
              <div className="loading-spinner w-5 h-5" />
              Wird verarbeitet...
            </>
          ) : (
            <>
              <lucideReact.FileAudio className="h-5 w-5" />
              Transkribieren
            </>
          )}
        </button>
      </div>
    </form>
  );
}
