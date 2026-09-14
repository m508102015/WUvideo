/**
 * Favorites Store - Manages user's favorite videos
 * Uses Zustand with localStorage persistence
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FavoriteItem } from '@/lib/types';
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
    
    checkUpdates: () => Promise<void>; 
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
                            savedEpisodeCount: 0, 
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

                // 🎯 核心直覺邏輯：抓 API 最新集數 vs 對應歷史觀看集數
                checkUpdates: async () => {
                    const { favorites } = get();
                    if (favorites.length === 0) return;

                    set({ isCheckingUpdates: true });
                    const updatedFavorites = [...favorites];

                    // 1. 從 LocalStorage 撈出使用者的觀看歷史紀錄
                    let historyItems: any[] = [];
                    try {
                        if (typeof window !== 'undefined') {
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                if (key && key.includes('history-store')) {
                                    const data = JSON.parse(localStorage.getItem(key) || '{}');
                                    const items = data?.state?.items || data?.state?.history || data?.state?.historyItems || [];
                                    if (Array.isArray(items)) historyItems.push(...items);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('讀取歷史紀錄失敗', e);
                    }

                    console.log("🚀 開始執行一鍵更新檢查...");

                    // 2. 逐一檢查每一個收藏的影片
                    for (let i = 0; i < updatedFavorites.length; i++) {
                        const fav = updatedFavorites[i];
                        
                        try {
                            const res = await fetch('/api/search-parallel', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ keyword: fav.title })
                            });
                            
                            if (res.ok) {
                                const data = await res.json();
                                const list = Array.isArray(data) ? data : data?.list || [];
                                const currentVideo = list.find(
                                    (v: any) => String(v.vod_id) === String(fav.videoId) && v.source === fav.source
                                );
                                
                                if (currentVideo) {
                                    // 計算 API 回傳的最新總集數
                                    let latestCount = 0;
                                    if (currentVideo.vod_play_url) {
                                        latestCount = currentVideo.vod_play_url.split('#').length;
                                    } else if (currentVideo.vod_remarks) {
                                        const match = currentVideo.vod_remarks.match(/\d+/);
                                        if (match) latestCount = parseInt(match[0], 10);
                                    }

                                    // 找出歷史紀錄中這部片的目前進度 (episodeIndex 從 0 開始，故 +1)
                                    const historyMatch = historyItems.find(
                                        h => String(h.videoId) === String(fav.videoId) && h.source === fav.source
                                    );
                                    const watchedCount = historyMatch ? (historyMatch.episodeIndex + 1) : 0;

                                    console.log(`📺 【${fav.title}】 -> 最新總集數: ${latestCount}集 | 歷史看到: 第${watchedCount}集`);

                                    // 3. 判斷邏輯：最新總集數 > 歷史觀看集數，代表有新集數！
                                    if (latestCount > 0 && latestCount > watchedCount) {
                                        console.log(`✨ 發現新集數！`);
                                        updatedFavorites[i] = {
                                            ...fav,
                                            latestEpisodeCount: latestCount,
                                            savedEpisodeCount: watchedCount,
                                            hasUpdate: true,
                                            remarks: currentVideo.vod_remarks || `更新至第 ${latestCount} 集`
                                        };
                                    } else {
                                        updatedFavorites[i] = {
                                            ...fav,
                                            savedEpisodeCount: watchedCount,
                                            hasUpdate: false
                                        };
                                    }
                                }
                            }
                        } catch (err) {
                            console.error(`檢查 ${fav.title} 失敗:`, err);
                        }

                        await new Promise(r => setTimeout(r, 400));
                    }

                    console.log("🏁 檢查更新完畢！");
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
