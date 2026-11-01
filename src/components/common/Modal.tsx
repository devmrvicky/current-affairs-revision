import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional line under the title. */
  description?: string;
  children: ReactNode;
  /** 'dialog' is centred; 'sheet' is a bottom sheet on phones and a centred dialog from `sm` up. */
  variant?: 'dialog' | 'sheet';
  /** role="alertdialog" for confirmations that need an explicit answer. */
  alert?: boolean;
  /** 'lg' for list-heavy dialogs (topic picker, visibility manager). */
  size?: 'md' | 'lg';
  /** Extra classes for the panel. */
  panelClassName?: string;
  /** Hide the header close button (confirmations have explicit Cancel buttons). */
  hideCloseButton?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: portalled to <body> (so it escapes any transformed ancestor),
 * focus moves in on open and returns to the opener on close, Tab is trapped,
 * Escape and backdrop click close it, and page scroll is locked while open.
 * Keyboard events inside it are marked data-exam-keys="off" so the test's arrow-key
 * navigation never fires underneath a dialog.
 */
export function Modal({ open, onClose, title, description, children, variant = 'dialog', alert = false, size = 'md', panelClassName = '', hideCloseButton = false }: ModalProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first focusable control (skipping the header close button when something better exists).
    const panel = panelRef.current;
    const focusables = () => (panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    const initial = panel?.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? panel;
    initial?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = focusables();
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const isSheet = variant === 'sheet';
  return createPortal(
    <div
      className={`fixed inset-0 z-[150] flex justify-center ${isSheet ? 'items-end sm:items-center' : 'items-center'} p-0 ${isSheet ? 'sm:p-4' : 'p-4'}`}
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-exam-keys="off"
    >
      <div
        ref={panelRef}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${size === 'lg' ? (isSheet ? 'sm:max-w-2xl' : 'max-w-2xl') : isSheet ? 'sm:max-w-md' : 'max-w-md'} ${isSheet ? 'rounded-t-2xl sm:rounded-2xl' : 'rounded-2xl'} flex flex-col outline-none ${panelClassName}`}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          maxHeight: 'min(88dvh, 720px)',
          paddingBottom: isSheet ? 'env(safe-area-inset-bottom, 0px)' : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2 flex-shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="font-display font-bold text-base" style={{ color: 'var(--text-primary)' }}>{title}</h2>
            {description && <p id={descId} className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{description}</p>}
          </div>
          {!hideCloseButton && (
            <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 -mr-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 flex-shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
              <X size={16} style={{ color: 'var(--text-secondary)' }} />
            </button>
          )}
        </div>
        <div className="px-5 pb-5 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>,
    document.body
  );
}
