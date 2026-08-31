import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { X, ZoomIn } from 'lucide-react';
import { resolveMockAsset, isMockAssetRef } from '../../services/mockAssetRepository';
import 'katex/dist/katex.min.css';

interface QuestionOptionContentProps {
  text: string;
  image?: string;
  baseDir?: string;
}

/** Renders one option's content — an image (reasoning figure-choice questions), Markdown text, or both. Shared by the test shell and the solutions review so option rendering never needs to be reimplemented per screen. */
export function QuestionOptionContent({ text, image, baseDir }: QuestionOptionContentProps) {
  const resolvedImage = image ? (isMockAssetRef(image) ? resolveMockAsset(baseDir, image) : image) : undefined;
  return (
    <span className="inline-block align-middle">
      {resolvedImage && (
        <img src={resolvedImage} alt={text || 'Option'} className="max-w-[160px] max-h-24 rounded-lg border object-contain inline-block mb-1" style={{ borderColor: 'var(--border)' }} />
      )}
      {text && (
        <span className="question-markdown-inline">
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]} components={{ p: ({ children }) => <>{children}</> }}>{text}</ReactMarkdown>
        </span>
      )}
    </span>
  );
}

interface QuestionMarkdownRendererProps {
  content: string;
  /** Needed to resolve `asset:filename.png` references — undefined for questions with no folder-based mock behind them (they simply won't have asset: refs to resolve). */
  baseDir?: string;
  className?: string;
}

/**
 * The one Markdown renderer for question/option/explanation content —
 * MockTestShellPage and the solutions review both go through this rather
 * than each rolling their own react-markdown setup. Built on the same
 * react-markdown + remark-gfm stack as the existing reader MarkdownRenderer
 * (not a second Markdown engine), extended with math (KaTeX) and the
 * asset: image scheme mock content needs — concerns the reader never has.
 */
export function QuestionMarkdownRenderer({ content, baseDir, className }: QuestionMarkdownRendererProps) {
  const [fullscreenSrc, setFullscreenSrc] = useState<{ src: string; alt: string } | null>(null);

  return (
    <div className={`question-markdown ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          img: ({ src, alt }) => {
            if (!src) return null;
            const resolved = isMockAssetRef(src) ? resolveMockAsset(baseDir, src) : src;
            if (!resolved) {
              return (
                <span className="inline-block text-xs px-3 py-2 rounded-lg border border-dashed" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                  Image unavailable{alt ? `: ${alt}` : ''}
                </span>
              );
            }
            return (
              <span className="block my-3 text-center">
                <button
                  type="button"
                  onClick={() => setFullscreenSrc({ src: resolved, alt: alt ?? '' })}
                  className="relative inline-block group max-w-full"
                  aria-label={alt ? `View larger: ${alt}` : 'View larger image'}
                >
                  <img
                    src={resolved}
                    alt={alt ?? ''}
                    className="max-w-full max-h-72 rounded-xl border object-contain mx-auto"
                    style={{ borderColor: 'var(--border)' }}
                    loading="lazy"
                  />
                  <span className="absolute bottom-1.5 right-1.5 p-1 rounded-md opacity-70 group-hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.55)' }}>
                    <ZoomIn size={12} className="text-white" />
                  </span>
                </button>
              </span>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto -mx-1 px-1">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>

      {fullscreenSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.9)' }}
          onClick={() => setFullscreenSrc(null)}
        >
          <button
            onClick={() => setFullscreenSrc(null)}
            className="absolute top-4 right-4 p-2 rounded-full"
            style={{ background: 'rgba(255,255,255,0.15)' }}
            aria-label="Close image preview"
          >
            <X size={20} className="text-white" />
          </button>
          {/* Native pinch-to-zoom/pan works on the image itself once it's the only thing on screen; touchAction left to the browser default rather than reimplementing pan/zoom gesture handling. */}
          <img
            src={fullscreenSrc.src}
            alt={fullscreenSrc.alt}
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
