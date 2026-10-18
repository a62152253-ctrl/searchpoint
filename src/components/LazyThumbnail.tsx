import React, { useState, useEffect, useRef } from 'react';
import { 
  FileCode, 
  FileText, 
  FileArchive, 
  Image as ImageIcon, 
  Film, 
  Music
} from 'lucide-react';

import { FileItem } from '../types';

interface LazyThumbnailProps {
  path?: string;
  name?: string;
  extension?: string;
  category?: string;
  file?: FileItem;
  className?: string;
  onClick?: () => void;
  aspectRatio?: 'square' | 'video' | 'portrait';
}

export const LazyThumbnail: React.FC<LazyThumbnailProps> = ({
  path: propPath,
  name: propName,
  extension: propExtension,
  category: propCategory,
  file,
  className = '',
  onClick,
  aspectRatio = 'square'
}) => {
  const path = propPath || file?.path || '';
  const name = propName || file?.name || '';
  const extension = propExtension || file?.extension || '';
  const category = propCategory || file?.category;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const ext = (extension || '').toLowerCase().replace('.', '');
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext);
  const isCode = ['tsx', 'ts', 'jsx', 'js', 'json', 'py', 'rs', 'cpp', 'html', 'css', 'sql', 'md'].includes(ext) || category === 'DEV';
  const isDoc = ['pdf', 'docx', 'doc', 'txt', 'csv', 'xlsx'].includes(ext) || category === 'DOCS';
  const isArchive = ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || category === 'ARCHIVES';

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [path, file?.blobUrl]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isImage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(el);
          }
        });
      },
      { rootMargin: '350px 0px 350px 0px', threshold: 0.01 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [isImage, path]);

  const renderFallbackIcon = () => {
    if (isCode) return <FileCode className="w-8 h-8 text-blue-400 opacity-90 group-hover:scale-110 transition-transform" />;
    if (isDoc) return <FileText className="w-8 h-8 text-amber-400 opacity-90 group-hover:scale-110 transition-transform" />;
    if (isArchive) return <FileArchive className="w-8 h-8 text-yellow-400 opacity-90 group-hover:scale-110 transition-transform" />;
    if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext)) {
      return <Film className="w-8 h-8 text-purple-400 opacity-90 group-hover:scale-110 transition-transform" />;
    }
    if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) {
      return <Music className="w-8 h-8 text-pink-400 opacity-90 group-hover:scale-110 transition-transform" />;
    }
    return <ImageIcon className="w-8 h-8 text-purple-400/70 opacity-80 group-hover:scale-110 transition-transform" />;
  };

  const fallbackBg = isCode
    ? 'bg-gradient-to-br from-blue-950/30 via-[#14141d] to-[#111116]'
    : isArchive
    ? 'bg-gradient-to-br from-yellow-950/25 via-[#161512] to-[#111116]'
    : isDoc
    ? 'bg-gradient-to-br from-amber-950/25 via-[#161412] to-[#111116]'
    : 'bg-gradient-to-br from-purple-950/25 via-[#15141c] to-[#111116]';

  const isFsaWithoutBlob = path.startsWith('[FSA]/') && !file?.blobUrl;
  const canDisplayThumbnail = isImage && isVisible && !hasError && !isFsaWithoutBlob;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={onClick ? `Podgląd miniatury: ${name || 'plik'}` : undefined}
      onKeyDown={onClick ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
      className={`relative overflow-hidden rounded-xl ${fallbackBg} border border-white/8 flex items-center justify-center select-none ${
        aspectRatio === 'square' ? 'aspect-square' : aspectRatio === 'portrait' ? 'aspect-[3/4]' : 'aspect-video'
      } ${className}`}
    >
      {canDisplayThumbnail ? (
        <>
          <img
            src={file?.blobUrl || `/api/thumbnail?path=${encodeURIComponent(path)}`}
            alt={name}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => setHasError(true)}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
          {!isLoaded && (
            <div className="absolute inset-0 bg-[#1a1a22] animate-pulse flex items-center justify-center">
              <span className="text-[10px] font-mono text-[#71717a]">...</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center justify-center p-2 text-center space-y-1.5">
          {renderFallbackIcon()}
          <span className="px-1.5 py-0.5 rounded-md bg-black/40 border border-white/8 text-[9px] font-mono font-bold text-[#a1a1aa] uppercase truncate max-w-[85%]">
            .{ext || 'FILE'}
          </span>
        </div>
      )}
    </div>
  );
};
