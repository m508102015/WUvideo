'use client';

import React from 'react';
import { useFavoritesStore, usePremiumFavoritesStore } from '@/lib/store/favorites-store';

interface FavoritesItemProps {
  item: {
    id: string;
    title: string;
    cover?: string;
    totalEpisodes?: number;
    episodesCount?: number;
    [key: string]: any;
  };
  onSelect?: (id: string) => void;
  isPremium?: boolean;
}

export const FavoritesItem: React.FC<FavoritesItemProps> = ({
  item,
  onSelect,
  isPremium = false,
}) => {
  // 依 premium 選擇正確的 store
  const useStore = isPremium ? usePremiumFavoritesStore : useFavoritesStore;

  // 從 favorites-store 找到對應的收藏資料（以 videoId 匹配）
  const favorite = useStore((state) =>
    state.favorites.find((f) => String(f.videoId) === String(item.id))
  );

  // 追劇進度（1-based）
  const watchedEpisode =
    favorite?.watchedEpisode ?? favorite?.savedEpisodeCount ?? 0;

  // 最新集數：優先使用 store 中檢查過的資料，其次才用 item 帶進來的值
  const latestEpisodeCount =
    favorite?.latestEpisodeCount ??
    item.totalEpisodes ??
    item.episodesCount ??
    0;

  // 是否有未看集數（NEW 徽章）
  const hasNewEpisodes = favorite?.hasUpdate ?? false;

  return (
    <div
      className="relative group cursor-pointer bg-card rounded-lg overflow-hidden border border-border p-2 transition-all hover:shadow-md"
      onClick={() => onSelect?.(item.id)}
    >
      {/* 封面圖片區域 */}
      <div className="aspect-[16/9] w-full bg-muted relative rounded overflow-hidden">
        {item.cover && (
          <img
            src={item.cover}
            alt={item.title}
            className="object-cover w-full h-full"
          />
        )}

        {/* 動態狀態標籤 */}
        {hasNewEpisodes ? (
          <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            有新集數 (已看 {watchedEpisode}/{latestEpisodeCount})
          </span>
        ) : (
          <span className="absolute top-2 right-2 bg-secondary text-secondary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            已追到最新
          </span>
        )}
      </div>

      {/* 標題與進度 */}
      <div className="mt-2.5">
        <h3 className="font-semibold text-sm truncate">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          觀看進度：第 {watchedEpisode} 集 / 共 {latestEpisodeCount} 集
        </p>
      </div>
    </div>
  );
};

export default FavoritesItem;
