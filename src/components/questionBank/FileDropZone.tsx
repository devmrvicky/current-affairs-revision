import { useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { UploadCloud } from 'lucide-react';

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  /** Accessible name for the file input, e.g. "Choose question JSON files". */
  label: string;
  multiple?: boolean;
  hint?: string;
}

/** Pick or drag-and-drop JSON files. Keyboard-operable; the real file input is always reachable for screen readers and tests. */
export function FileDropZone({ onFiles, disabled, label, multiple = true, hint }: FileDropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const take = (list: FileList | null) => { const files = Array.from(list ?? []); if (files.length > 0) onFiles(files); };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (!disabled) take(e.dataTransfer.files); };
  const onKey = (e: KeyboardEvent) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); input.current?.click(); } };

  return (
    <div
      role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`${label} — click or drop files here`} data-testid="drop-zone"
      onClick={() => !disabled && input.current?.click()} onKeyDown={onKey}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop}
      className={`rounded-2xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors min-h-[8rem] flex flex-col items-center justify-center gap-2 ${over ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={over ? undefined : { borderColor: 'var(--border)' }}
    >
      <UploadCloud size={28} className="text-brand-500" aria-hidden />
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Drop JSON files here, or tap to choose</p>
      {hint && <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
      <input ref={input} type="file" accept=".json,application/json" multiple={multiple} hidden aria-label={label} data-testid="file-input" disabled={disabled}
        onClick={(e) => e.stopPropagation()} onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
