import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';
import { SUPPORTED_FILE_TYPES } from '../utils/constants';

interface DropZoneProps {
  onFileAccepted: (file: File) => void;
  isLoading: boolean;
}

export function DropZone({ onFileAccepted, isLoading }: DropZoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onFileAccepted(acceptedFiles[0]);
    }
  }, [onFileAccepted]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: SUPPORTED_FILE_TYPES,
    disabled: isLoading,
    maxFiles: 1,
  });

  return (
    <div
      {...getRootProps()}
      className={`p-8 border-2 border-dashed rounded-lg cursor-pointer transition-colors
        ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-gray-600">
        <Upload className="w-12 h-12 mb-4" />
        {isDragActive ? (
          <p>Datei hier ablegen...</p>
        ) : (
          <div className="text-center">
            <p className="mb-2">Drag & Drop eine Audio- oder Videodatei hier oder klicke zum Auswählen</p>
            <p className="text-sm text-gray-500">
              Unterstützte Formate: {Object.values(SUPPORTED_FILE_TYPES).flat().join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}