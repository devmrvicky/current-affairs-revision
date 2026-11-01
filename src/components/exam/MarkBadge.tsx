import { getMarkPurposeInfo, type MarkPurpose } from '../../types/questionMark';

/** The small corner badge on a palette cell for a marked question — colour and glyph identify the purpose. */
export function MarkBadge({ purpose, className = '' }: { purpose: MarkPurpose | undefined; className?: string }) {
  const info = getMarkPurposeInfo(purpose);
  if (!info) return null;
  return (
    <span
      aria-hidden
      className={`absolute -top-1.5 -left-1.5 w-3.5 h-3.5 rounded-full text-[8px] leading-none font-bold flex items-center justify-center text-white shadow ${className}`}
      style={{ background: info.color }}
      title={info.label}
    >
      {info.badge}
    </span>
  );
}
