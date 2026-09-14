'use client';

import React from 'react';
import type { FavoriteItem } from '@/lib/types';

interface FavoritesItemProps {
  item: FavoriteItem;
  onSelect?: (videoId: string | number, source: string) => void;
  onRemove?: () => void;
  isPremium?: boolean;
}

export const FavoritesItem: React.FC<FavoritesItemProps> = ({
  item,
  onSelect,
  onRemove,
  isPremium = false,
}) => {
  // 追劇進度（1-based）
  const watchedEpisode =
    item.watchedEpisode ?? item.savedEpisodeCount ?? 0;

  const latestEpisodeCount = item.latestEpisodeCount ?? 0;

  // NEW 徽章由 store 的 checkUpdates() 決定
  const hasNewEpisodes = item.hasUpdate ?? false;

  const unwatchedEpisodeCount = item.unwatchedEpisodeCount ?? 0;

  const handleClick = () => {
    onSelect?.(item.videoId, item.source);
  };

  return (
    <div
      className="relative group cursor-pointer bg-card rounded-lg overflow-hidden border border-border p-2 transition-all hover:shadow-md"
      onClick={handleClick}
    >
      {/* 封面圖片區域 */}
      <div className="aspect-[16/9] w-full bg-muted relative rounded overflow-hidden">
        {item.poster && (
          <img
            src={item.poster}
            alt={item.title}
            className="object-cover w-full h-full"
          />
        )}

        {/* 動態狀態標籤 */}
        {hasNewEpisodes ? (
          <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            有新集數 · 未看 {unwatchedEpisodeCount} 集
          </span>
        ) : (
          <span className="absolute top-2 right-2 bg-secondary text-secondary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            已追到最新
          </span>
        )}

        {/* 移除按鈕（若父層有傳 onRemove 才顯示） */}
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-xs px-2 py-1 rounded transition-colors"
            aria-label="移除收藏"
          >
            移除
          </button>
        )}
      </div>

      {/* 標題與進度 */}
      <div className="mt-2.5">
        <h3 className="font-semibold text-sm truncate">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          {latestEpisodeCount > 0
            ? `觀看進度：第 ${watchedEpisode} 集 / 共 ${latestEpisodeCount} 集`
            : `尚未檢查更新`}
        </p>
      </div>
    </div>
  );
};

export default FavoritesItem;
