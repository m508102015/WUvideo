'use client';

import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { VideoCard } from '@/components/search/VideoCard';
import { FavoritesEmptyState } from './FavoritesEmptyState';
import type { FavoriteItem, Video } from '@/lib/types';

interface FavoritesGridProps {
  favorites: FavoriteItem[];
  isPremium?: boolean;
}

// 收藏卡片額外需要的追劇狀態
type ExtendedVideo = Video & {
  _hasUpdate?: boolean;
  _watchedEpisode?: number;
  _latestEpisodeCount?: number;
  _unwatchedEpisodeCount?: number;
  _nextEpisodeIndex?: number;
};

export const FavoritesGrid = memo(function FavoritesGrid({
  favorites,
  isPremium = false
}: FavoritesGridProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // Convert FavoriteItem to Video format
  const videos: ExtendedVideo[] = useMemo(
    () =>
      favorites.map((favorite) => ({
        vod_id: favorite.videoId,
        vod_name: favorite.title,
        vod_pic: favorite.poster,
        vod_remarks: favorite.remarks,
        vod_year: favorite.year,
        type_name: favorite.type,
        source: favorite.source,
        sourceName: favorite.sourceName,
        _hasUpdate: favorite.hasUpdate,
        // 用 optional chaining 以防舊資料無此欄位
        _watchedEpisode: favorite.watchedEpisode ?? favorite.savedEpisodeCount ?? 0,
        _latestEpisodeCount: favorite.latestEpisodeCount,
        _unwatchedEpisodeCount: favorite.unwatchedEpisodeCount ?? 0,
        _nextEpisodeIndex: favorite.nextEpisodeIndex,
      })),
    [favorites]
  );

  // Setup intersection observer for infinite scroll
  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && visibleCount < videos.length) {
          setVisibleCount((prev) => Math.min(prev + 24, videos.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observerRef.current.observe(loadMoreRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [visibleCount, videos.length]);

  const handleCardClick = useCallback((
    e: React.MouseEvent,
    cardId: string,
    videoUrl: string
  ) => {
    setActiveCardId(cardId);
  }, []);

  if (videos.length === 0) {
    return <FavoritesEmptyState />;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6 gap-3 md:gap-4 lg:gap-6">
        {videos.slice(0, visibleCount).map((video) => {
          const cardId = `${video.source}:${video.vod_id}`;
          const episodeIndex = video._nextEpisodeIndex;
          const videoUrl = `/player?id=${video.vod_id}&source=${video.source}&title=${encodeURIComponent(video.vod_name)}${episodeIndex !== undefined ? `&episode=${episodeIndex}` : ''}${isPremium ? '&premium=1' : ''}`;
          const isActive = activeCardId === cardId;

          return (
            <div
              key={cardId}
              className="relative h-full w-full group"
            >
              <VideoCard
                video={video}
                videoUrl={videoUrl}
                cardId={cardId}
                isActive={isActive}
                onCardClick={handleCardClick}
                isPremium={isPremium}
              />

              {/* 🍎 NEW 徽章浮動渲染：疊加在 VideoCard 影片海報右上角 */}
              {video._hasUpdate && (
                <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded shadow-md z-20 animate-pulse border border-white/20 pointer-events-none">
                  NEW
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Load more trigger */}
      {visibleCount < videos.length && (
        <div
          ref={loadMoreRef}
          className="h-20 w-full flex items-center justify-center opacity-0 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </>
  );
});
