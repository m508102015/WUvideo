import React from 'react';
import { useHistoryStore } from '@/lib/store/history-store';
import { checkVideoUpdateStatus } from '@/lib/utils/video';

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
}

export const FavoritesItem: React.FC<FavoritesItemProps> = ({ item, onSelect }) => {
  // 從 history-store 中尋找該影片的觀看歷史紀錄
  const historyRecord = useHistoryStore((state) => {
    // 兼容不同的歷史紀錄資料結構（陣列或物件）
    if (Array.isArray(state.history)) {
      return state.history.find((h: any) => h.id === item.id || h.videoId === item.id);
    }
    return null;
  });

  // 計算目前觀看進度、已看集數與是否有新集數
  const progressInfo = checkVideoUpdateStatus(item, historyRecord);

  return (
    <div 
      className="relative group cursor-pointer bg-card rounded-lg overflow-hidden border border-border p-2 transition-all hover:shadow-md"
      onClick={() => onSelect?.(item.id)}
    >
      {/* 封面圖片區域 */}
      <div className="aspect-[16/9] w-full bg-muted relative rounded overflow-hidden">
        {item.cover && (
          <img src={item.cover} alt={item.title} className="object-cover w-full h-full" />
        )}
        
        {/* 動態狀態標籤：根據是否有新集數顯示不同提示 */}
        {progressInfo.hasNewEpisodes ? (
          <span className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            有新集數 (已看 {progressInfo.watchedEpisode}/{progressInfo.totalEpisodes})
          </span>
        ) : (
          <span className="absolute top-2 right-2 bg-secondary text-secondary-foreground text-xs px-2.5 py-1 rounded-full font-medium shadow-sm">
            已追到最新
          </span>
        )}
      </div>

      {/* 標題與詳細進度資訊 */}
      <div className="mt-2.5">
        <h3 className="font-semibold text-sm truncate">{item.title}</h3>
        <p className="text-xs text-muted-foreground mt-1">
          觀看進度：第 {progressInfo.watchedEpisode} 集 / 共 {progressInfo.totalEpisodes} 集
        </p>
      </div>
    </div>
  );
};

export default FavoritesItem;
