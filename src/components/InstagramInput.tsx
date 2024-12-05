import React, { useState } from 'react';
import { Instagram } from 'lucide-react';

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
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex flex-col gap-2">
        <div className="flex-1">
          <label htmlFor="reelUrl" className="block text-sm font-medium text-gray-700 mb-1">
            Instagram Reel URL
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Instagram className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              id="reelUrl"
              className={`block w-full pl-10 pr-3 py-2 border rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 
                ${error ? 'border-red-300' : 'border-gray-300'}`}
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
            <p className="mt-1 text-sm text-red-600">{error}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || !reelUrl.trim()}
          className={`px-4 py-2 rounded-md text-white font-medium transition-colors
            ${isLoading || !reelUrl.trim()
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
            }`}
        >
          {isLoading ? 'Wird verarbeitet...' : 'Transkribieren'}
        </button>
      </div>
    </form>
  );
}