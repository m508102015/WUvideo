import React from 'react';
import { FavoritesItem } from './FavoritesItem';

interface FavoritesGridProps {
  favorites: any[];
  onSelect?: (id: string) => void;
  [key: string]: any;
}

export const FavoritesGrid: React.FC<FavoritesGridProps> = ({ favorites, onSelect }) => {
  if (!favorites || favorites.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {favorites.map((favorite) => {
        // 修正型別問題：安全地對應屬性，避免 TypeScript 報錯
        const mappedItem = {
          ...favorite,
          sourceName: favorite.sourceName,
          _hasUpdate: favorite.hasUpdate,
          _watchedEpisode: (favorite as any).watchedEpisode ?? favorite.savedEpisodeCount ?? 0,
          _latestEpisodeCount: favorite.latestEpisodeCount,
          _unwatchedEpisodeCount: favorite.unwatchedEpisodeCount ?? 0,
          _nextEpisodeIndex: favorite.nextEpisodeIndex,
        };

        return (
          <FavoritesItem 
            key={favorite.id || favorite.url} 
            item={mappedItem} 
            onSelect={onSelect} 
          />
        );
      })}
    </div>
  );
};

export default FavoritesGrid;
