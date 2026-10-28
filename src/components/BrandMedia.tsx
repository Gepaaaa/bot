import { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import sampleCatImg from '../assets/images/sample_sticker_cat_1793095457845.jpg';
import { resolveBackendMediaUrl } from '../lib/apiBase.ts';

export const SAMPLE_CAT_IMAGE_URL = sampleCatImg;

export function ResilientImage({
  src,
  alt,
  className = '',
  fallbackLabel = 'Media Pratinjau',
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}) {
  const resolvedSrc = resolveBackendMediaUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  if (failed || !resolvedSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 dark:text-zinc-400 p-4 text-center ${className}`}
      >
        <ImageIcon className="w-5 h-5" />
        <span className="text-xs">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
