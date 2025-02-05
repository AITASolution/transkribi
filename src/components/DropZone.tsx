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
      className={`p-8 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 
        ${isDragActive 
          ? 'border-primary bg-primary/5 scale-102 shadow-lg' 
          : 'border-border hover:border-primary hover:shadow-md'
        }
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-text-secondary">
        <div className={`transition-transform duration-300 ${isDragActive ? 'scale-110' : ''}`}>
          <Upload 
            className={`w-12 h-12 mb-4 transition-colors duration-300
              ${isDragActive ? 'text-primary' : 'text-text-secondary'}`}
          />
        </div>
        {isDragActive ? (
          <p className="text-primary font-medium animate-bounce">
            Datei hier ablegen...
          </p>
        ) : (
          <div className="text-center space-y-2">
            <p className="font-medium">
              Drag & Drop eine Audio- oder Videodatei hier oder klicke zum Auswählen
            </p>
            <p className="text-sm opacity-75">
              Unterstützte Formate: {Object.values(SUPPORTED_FILE_TYPES).flat().join(', ')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
