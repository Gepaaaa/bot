import { useState } from 'react';
import { ImageIcon } from 'lucide-react';
import sampleCatImg from '../assets/images/sample_sticker_cat_1793095457845.jpg';

export const SAMPLE_CAT_IMAGE_URL = sampleCatImg;

export function GepaCreatorAvatar({ className = 'w-14 h-14' }: { className?: string }) {
  return (
    <div
      className={`${className} rounded-2xl bg-[#F2EFE9] dark:bg-zinc-800 border border-zinc-200/90 dark:border-zinc-700/80 flex items-center justify-center overflow-hidden shrink-0 select-none`}
      aria-label="Avatar Gepa Personal Corner"
    >
      <svg
        viewBox="0 0 96 96"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <rect width="96" height="96" fill="currentColor" className="text-[#F2EFE9] dark:text-zinc-800" />
        {/* Shoulders / monochrome crewneck */}
        <path
          d="M18 96C18 76.5 31.2 66 48 66C64.8 66 78 76.5 78 96H18Z"
          fill="#27272A"
        />
        <path
          d="M37 66.5C40.2 70 43.9 71.8 48 71.8C52.1 71.8 55.8 70 59 66.5"
          stroke="#52525B"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        {/* Neck & Head */}
        <rect x="42" y="54" width="12" height="14" rx="5" fill="#E6B89C" />
        <rect x="30" y="24" width="36" height="36" rx="16" fill="#F1C7AC" />
        {/* Hair */}
        <path
          d="M29 38C29 25.5 37 18 48.5 18C60 18 67 25.5 67 37C64.5 31.5 59.5 28.5 52 28.5C43.5 28.5 35 31 29 38Z"
          fill="#18181B"
        />
        {/* Round minimalist glasses */}
        <circle cx="40.5" cy="41.5" r="5.5" stroke="#18181B" strokeWidth="2.2" fill="#FFFFFF" fillOpacity="0.35" />
        <circle cx="55.5" cy="41.5" r="5.5" stroke="#18181B" strokeWidth="2.2" fill="#FFFFFF" fillOpacity="0.35" />
        <path d="M46 41.5H50" stroke="#18181B" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="40.5" cy="41.5" r="1.6" fill="#18181B" />
        <circle cx="55.5" cy="41.5" r="1.6" fill="#18181B" />
        {/* Calm friendly smile */}
        <path
          d="M43.5 50.5C45 52.2 46.5 52.8 48 52.8C49.5 52.8 51 52.2 52.5 50.5"
          stroke="#18181B"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

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
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
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
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
