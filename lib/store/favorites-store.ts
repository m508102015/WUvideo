/**
 * Favorites Store - Manages user's favorite videos
 * Uses Zustand with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FavoriteItem, VideoHistoryItem } from '@/lib/types';
import { profiledKey } from '@/lib/utils/profile-storage';

const MAX_FAVORITES = 100;

interface FavoritesState {
    favorites: FavoriteItem[];
    isCheckingUpdates: boolean;
}

interface FavoritesActions {
    addFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void;
    removeFavorite: (videoId: string | number, source: string) => void;
    toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => boolean;
    isFavorite: (videoId: string | number, source: string) => boolean;
    clearFavorites: () => void;
    importFavorites: (favorites: FavoriteItem[]) => void;
    
    // 🍎 修改：傳入歷史紀錄作為比對基準
    checkUpdates: (historyItems: VideoHistoryItem[]) => Promise<void>; 
    clearUpdateBadge: (videoId: string | number, source: string) => void;
}

interface FavoritesStore extends FavoritesState, FavoritesActions { }

function generateFavoriteId(videoId: string | number, source: string): string {
    return `${source}:${videoId}`;
}

const createFavoritesStore = (name: string) =>
    create<FavoritesStore>()(
        persist(
            (set, get) => ({
                favorites: [],
                isCheckingUpdates: false,

                addFavorite: (item) => {
                    const favoriteId = generateFavoriteId(item.videoId, item.source);

                    set((state) => {
                        const exists = state.favorites.some(
                            (fav) => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                        );
                        if (exists) return state;

                        const newFavorite: FavoriteItem = {
                            ...item,
                            savedEpisodeCount: 1, // 預設收藏時當作第 1 集
                            addedAt: Date.now(),
                        };

                        let newFavorites = [newFavorite, ...state.favorites];
                        if (newFavorites.length > MAX_FAVORITES) {
                            newFavorites = newFavorites.slice(0, MAX_FAVORITES);
                        }

                        return { favorites: newFavorites };
                    });
                },

                removeFavorite: (videoId, source) => {
                    const favoriteId = generateFavoriteId(videoId, source);
                    set((state) => ({
                        favorites: state.favorites.filter(
                            (fav) => generateFavoriteId(fav.videoId, fav.source) !== favoriteId
                        ),
                    }));
                },

                toggleFavorite: (item) => {
                    const state = get();
                    const favoriteId = generateFavoriteId(item.videoId, item.source);
                    const exists = state.favorites.some(
                        (fav) => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                    );

                    if (exists) {
                        state.removeFavorite(item.videoId, item.source);
                        return false;
                    } else {
                        state.addFavorite(item);
                        return true;
                    }
                },

                isFavorite: (videoId, source) => {
                    const state = get();
                    const favoriteId = generateFavoriteId(videoId, source);
                    return state.favorites.some(
                        (fav) => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                    );
                },

                clearFavorites: () => set({ favorites: [] }),
                importFavorites: (favorites) => set({ favorites }),

                clearUpdateBadge: (videoId, source) => {
                    const favoriteId = generateFavoriteId(videoId, source);
                    set((state) => ({
                        favorites: state.favorites.map((fav) => {
                            if (generateFavoriteId(fav.videoId, fav.source) === favoriteId) {
                                return { 
                                    ...fav, 
                                    hasUpdate: false,
                                    savedEpisodeCount: fav.latestEpisodeCount || fav.savedEpisodeCount
                                };
                            }
                            return fav;
                        })
                    }));
                },

                // 🍎 終極完美版：結合觀看歷史，並使用雙重驗證算集數
                checkUpdates: async (historyItems) => {
                    const { favorites } = get();
                    if (favorites.length === 0) return;

                    set({ isCheckingUpdates: true });
                    const updatedFavorites = [...favorites];

                    for (let i = 0; i < updatedFavorites.length; i++) {
                        const fav = updatedFavorites[i];
                        
                        try {
                            // 去搜尋這部影片
                            const res = await fetch(`/api/search?keyword=${encodeURIComponent(fav.title)}`);
                            if (res.ok) {
                                const data = await res.json();
                                const currentVideo = data?.list?.find(
                                    (v: any) => String(v.vod_id) === String(fav.videoId) && v.source === fav.source
                                );
                                
                                if (currentVideo) {
                                    let fetchedEpisodeCount = 0;

                                    // 【精準算法】如果 API 有回傳播放網址 (vod_play_url)，通常是用 # 隔開每一集
                                    if (currentVideo.vod_play_url) {
                                        fetchedEpisodeCount = currentVideo.vod_play_url.split('#').length;
                                    } 
                                    // 備案：嘗試從 vod_remarks 萃取數字
                                    else if (currentVideo.vod_remarks) {
                                        const match = currentVideo.vod_remarks.match(/\d+/);
                                        if (match) fetchedEpisodeCount = parseInt(match[0], 10);
                                    }

                                    // 🍎【核心邏輯】去歷史紀錄撈取這部片真實的觀看進度 (episodeIndex 是從 0 開始，所以要 +1)
                                    const historyMatch = historyItems.find(h => String(h.videoId) === String(fav.videoId) && h.source === fav.source);
                                    const actualWatchedCount = historyMatch ? (historyMatch.episodeIndex + 1) : (fav.savedEpisodeCount || 1);

                                    // 如果最新集數 > 用戶實際看過的集數，就判定為有更新！
                                    if (fetchedEpisodeCount > 0 && fetchedEpisodeCount > actualWatchedCount) {
                                        updatedFavorites[i] = {
                                            ...fav,
                                            latestEpisodeCount: fetchedEpisodeCount,
                                            savedEpisodeCount: actualWatchedCount, // 同步最新的歷史進度到最愛
                                            hasUpdate: true,
                                            remarks: currentVideo.vod_remarks || `更新至第 ${fetchedEpisodeCount} 集`
                                        };
                                    } else {
                                        // 沒更新也把歷史進度同步過來，保持資料最新
                                        updatedFavorites[i] = {
                                            ...fav,
                                            savedEpisodeCount: actualWatchedCount,
                                            hasUpdate: false
                                        };
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`檢查 ${fav.title} 更新失敗:`, error);
                        }

                        // 每次請求間隔 600ms，防止被 Ban
                        await new Promise(resolve => setTimeout(resolve, 600));
                    }

                    set({ favorites: updatedFavorites, isCheckingUpdates: false });
                }
            }),
            {
                name,
            }
        )
    );

export const useFavoritesStore = createFavoritesStore(profiledKey('kvideo-favorites-store'));
export const usePremiumFavoritesStore = createFavoritesStore(profiledKey('kvideo-premium-favorites-store'));

export function useFavorites(isPremium = false) {
    const normalStore = useFavoritesStore();
    const premiumStore = usePremiumFavoritesStore();
    return isPremium ? premiumStore : normalStore;
}
