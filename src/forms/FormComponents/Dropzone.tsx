import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, FileText, X } from 'lucide-react';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface DropzoneProps {
  onFileSelect?: (file: File | null) => void;
}

function formatFileSize(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function Dropzone({ onFileSelect = () => {} }: DropzoneProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateAndSetFile = (file: File | undefined | null) => {
    if (!file) return;

    const isCsv = file.name.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      setError(t('dropzone.invalidType') || 'Please upload a .csv file.');
      setSelectedFile(null);
      onFileSelect(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(
        t('dropzone.tooLarge', { size: formatFileSize(MAX_FILE_SIZE_BYTES) }) ||
          `File is too large — max size is ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`
      );
      setSelectedFile(null);
      onFileSelect(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
    onFileSelect(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    validateAndSetFile(e.target.files?.[0]);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    validateAndSetFile(e.dataTransfer.files?.[0]);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center">
      <label
        htmlFor="dropzone-file"
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className={`flex flex-col w-full min-h-[92px] items-center justify-center border-2 border-dashed rounded-lg cursor-pointer bg-surface-2/60 hover:bg-surface-2 hover:border-accent-cyan/50 transition-colors ${
          error ? 'border-danger' : 'border-line'
        }`}
      >
        {selectedFile ? (
          <div className="flex flex-row items-center gap-3 px-4 py-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-md bg-accent-cyan/10 text-accent-cyan shrink-0">
              <FileText className="w-[18px] h-[18px]" />
            </div>
            <div className="text-left">
              <div className="text-sm text-ink-0 font-medium truncate max-w-[280px]">
                {selectedFile.name}
              </div>
              <div className="text-xs text-ink-2">{formatFileSize(selectedFile.size)}</div>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              aria-label={t('dropzone.remove') || 'Remove file'}
              className="ml-2 text-ink-2 hover:text-danger transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="flex flex-row items-center gap-4 py-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-cyan/10 text-accent-cyan shrink-0">
              <UploadCloud className="w-5 h-5" />
            </div>

            {/* Text Content */}
            <div className="text-left">
              <p className="text-sm text-ink-1">
                <span className="font-semibold text-ink-0">{t('dropzone.clickToUpload')}</span>{' '}
                {t('dropzone.orDragAndDrop')}
              </p>
              <p className="text-xs text-ink-2 mt-0.5">
                {t('dropzone.fileTypes', { size: formatFileSize(MAX_FILE_SIZE_BYTES) }) ||
                  `CSV file only (max. ${formatFileSize(MAX_FILE_SIZE_BYTES)})`}
              </p>
            </div>
          </div>
        )}
        <input
          id="dropzone-file"
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleChange}
        />
      </label>
      {error && <p className="mt-1 w-full text-xs text-danger">{error}</p>}
    </div>
  );
}

export default Dropzone;
