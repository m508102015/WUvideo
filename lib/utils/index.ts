export interface VideoProgressInfo {
  totalEpisodes: number;
  watchedEpisode: number;
  hasNewEpisodes: boolean;
}

/**
 * 透過我的最愛對應觀看歷史，計算目前觀看集數並判斷是否有新集數或未看集數
 */
export function checkVideoUpdateStatus(
  favoriteItem: { id?: string; totalEpisodes?: number; episodesCount?: number; [key: string]: any },
  historyRecord?: { episode?: number; progress?: number; lastEpisode?: number; [key: string]: any }
): VideoProgressInfo {
  // 取得影片總集數（支援不同格式的屬性命名）
  const total = favoriteItem.totalEpisodes || favoriteItem.episodesCount || 1;
  
  // 取得歷史紀錄中的已觀看集數
  const watched = historyRecord?.episode || historyRecord?.lastEpisode || 0;
  
  return {
    totalEpisodes: total,
    watchedEpisode: watched,
    hasNewEpisodes: total > watched,
  };
}
