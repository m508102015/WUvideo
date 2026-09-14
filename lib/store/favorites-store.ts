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
                            savedEpisodeCount: 1, 
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

                // 🍎 帶有 Console.log 探照燈的除錯版本
                checkUpdates: async () => {
                    const { favorites } = get();
                    if (favorites.length === 0) return;

                    set({ isCheckingUpdates: true });
                    const updatedFavorites = [...favorites];

                    let historyItems: any[] = [];
                    try {
                        if (typeof window !== 'undefined') {
                            for (let i = 0; i < localStorage.length; i++) {
                                const key = localStorage.key(i);
                                if (key && key.includes('history-store')) {
                                    const data = JSON.parse(localStorage.getItem(key) || '{}');
                                    const items = data?.state?.items || data?.state?.history || data?.state?.historyItems || [];
                                    if (Array.isArray(items) && items.length > 0) {
                                        historyItems = [...historyItems, ...items];
                                    }
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to fetch history for updates', e);
                    }

                    console.log("🔍 開始檢查更新... 總共收藏數量:", updatedFavorites.length);
                    console.log("📂 抓取到的歷史紀錄數量:", historyItems.length);

                    for (let i = 0; i < updatedFavorites.length; i++) {
                        const fav = updatedFavorites[i];
                        console.log(`\n⏳ 正在檢查: 【${fav.title}】...`);
                        
                        try {
                            const res = await fetch(`/api/search?keyword=${encodeURIComponent(fav.title)}`);
                            if (res.ok) {
                                const data = await res.json();
                                console.log(`📡 API 回傳結果:`, data);

                                const currentVideo = data?.list?.find(
                                    (v: any) => String(v.vod_id) === String(fav.videoId) && v.source === fav.source
                                );
                                
                                if (currentVideo) {
                                    console.log(`🎯 成功比對到影片:`, currentVideo);
                                    let fetchedEpisodeCount = 0;

                                    if (currentVideo.vod_play_url) {
                                        fetchedEpisodeCount = currentVideo.vod_play_url.split('#').length;
                                        console.log(`🔢 從播放連結算出總集數:`, fetchedEpisodeCount);
                                    } else if (currentVideo.vod_remarks) {
                                        const match = currentVideo.vod_remarks.match(/\d+/);
                                        if (match) {
                                            fetchedEpisodeCount = parseInt(match[0], 10);
                                            console.log(`🔢 從備註 (${currentVideo.vod_remarks}) 算出總集數:`, fetchedEpisodeCount);
                                        }
                                    }

                                    const historyMatch = historyItems.find(h => String(h.videoId) === String(fav.videoId) && h.source === fav.source);
                                    const actualWatchedCount = historyMatch ? (historyMatch.episodeIndex + 1) : (fav.savedEpisodeCount || 1);
                                    console.log(`👁️ 使用者實際觀看進度: 第 ${actualWatchedCount} 集`);

                                    if (fetchedEpisodeCount > 0 && fetchedEpisodeCount > actualWatchedCount) {
                                        console.log(`✨ 結論：【有更新！】 (${actualWatchedCount} -> ${fetchedEpisodeCount})`);
                                        updatedFavorites[i] = {
                                            ...fav,
                                            latestEpisodeCount: fetchedEpisodeCount,
                                            savedEpisodeCount: actualWatchedCount,
                                            hasUpdate: true,
                                            remarks: currentVideo.vod_remarks || `更新至第 ${fetchedEpisodeCount} 集`
                                        };
                                    } else {
                                        console.log(`😴 結論：沒有新集數。`);
                                        updatedFavorites[i] = {
                                            ...fav,
                                            savedEpisodeCount: actualWatchedCount,
                                            hasUpdate: false
                                        };
                                    }
                                } else {
                                    console.warn(`⚠️ 找不到對應的影片 ID 或 Source。`);
                                }
                            }
                        } catch (error) {
                            console.error(`❌ 檢查 ${fav.title} 更新失敗:`, error);
                        }

                        await new Promise(resolve => setTimeout(resolve, 600));
                    }

                    console.log("✅ 更新檢查流程結束。");
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
