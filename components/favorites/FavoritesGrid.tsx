'use client';

import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react';
import { VideoCard } from '@/components/search/VideoCard';
import { FavoritesEmptyState } from './FavoritesEmptyState';
import type { FavoriteItem, Video } from '@/lib/types';
// 🍎 引入底層 Store，用來清除更新標記
import { useFavoritesStore, usePremiumFavoritesStore } from '@/lib/store/favorites-store';

interface FavoritesGridProps {
  favorites: FavoriteItem[];
  isPremium?: boolean;
}

// 擴充原有的 Video 型別，讓它能往下傳遞 hasUpdate 屬性
type ExtendedVideo = Video & { _hasUpdate?: boolean };

export const FavoritesGrid = memo(function FavoritesGrid({
  favorites,
  isPremium = false
}: FavoritesGridProps) {
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // 🍎 抓取清除標籤的函數
  const useStore = isPremium ? usePremiumFavoritesStore : useFavoritesStore;
  const clearUpdateBadge = useStore(state => state.clearUpdateBadge);

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
        _hasUpdate: favorite.hasUpdate, // 🍎 把更新標記綁定進來
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
          const videoUrl = `/player?id=${video.vod_id}&source=${video.source}&title=${encodeURIComponent(video.vod_name)}${isPremium ? '&premium=1' : ''}`;
          const isActive = activeCardId === cardId;

          return (
            <div 
              key={cardId} 
              className="relative h-full w-full group"
              // 🍎 攔截點擊事件：如果卡片有更新標記，就在點擊觀看時把它清除
              onClickCapture={() => {
                if (video._hasUpdate) {
                  clearUpdateBadge(video.vod_id, video.source);
                }
              }}
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
