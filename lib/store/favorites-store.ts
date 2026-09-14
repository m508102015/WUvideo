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
    isCheckingUpdates: boolean; // 新增：是否正在檢查更新中
}

interface FavoritesActions {
    addFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => void;
    removeFavorite: (videoId: string | number, source: string) => void;
    toggleFavorite: (item: Omit<FavoriteItem, 'addedAt'>) => boolean;
    isFavorite: (videoId: string | number, source: string) => boolean;
    clearFavorites: () => void;
    importFavorites: (favorites: FavoriteItem[]) => void;
    
    // 🍎 新增的 Actions
    checkUpdates: () => Promise<void>; 
    clearUpdateBadge: (videoId: string | number, source: string) => void;
}

interface FavoritesStore extends FavoritesState, FavoritesActions { }

/**
 * Generate unique identifier for a favorite item
 */
function generateFavoriteId(
    videoId: string | number,
    source: string
): string {
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

                        if (exists) {
                            return state;
                        }

                        // 解析 remarks (如："更新至第 10 集" 或 "全 12 集") 來嘗試當作初始集數，若無則設為 0
                        let initialCount = 0;
                        if (item.remarks) {
                            const match = item.remarks.match(/\d+/);
                            if (match) initialCount = parseInt(match[0], 10);
                        }

                        const newFavorite: FavoriteItem = {
                            ...item,
                            savedEpisodeCount: initialCount, 
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

                clearFavorites: () => {
                    set({ favorites: [] });
                },

                importFavorites: (favorites) => {
                    set({ favorites });
                },

                // 🍎 實作：清除特定影片的「更新 (NEW)」標記，並更新已儲存的集數
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

                // 🍎 實作：一鍵檢查所有收藏影片的更新
                checkUpdates: async () => {
                    const { favorites } = get();
                    if (favorites.length === 0) return;

                    set({ isCheckingUpdates: true });
                    const updatedFavorites = [...favorites];

                    for (let i = 0; i < updatedFavorites.length; i++) {
                        const fav = updatedFavorites[i];
                        
                        try {
                            // 這裡透過搜尋 API 來檢查最新狀態
                            const res = await fetch(`/api/search?keyword=${encodeURIComponent(fav.title)}`);
                            
                            if (res.ok) {
                                const data = await res.json();
                                
                                // 找到同源且 ID 相同的影片
                                const currentVideo = data?.list?.find(
                                    (v: any) => String(v.vod_id) === String(fav.videoId) && v.source === fav.source
                                );
                                
                                if (currentVideo && currentVideo.vod_remarks) {
                                    // 從 vod_remarks 萃取集數數字 (例如："更新至 15 集" -> 15)
                                    const match = currentVideo.vod_remarks.match(/\d+/);
                                    if (match) {
                                        const fetchedEpisodeCount = parseInt(match[0], 10);
                                        const savedCount = fav.savedEpisodeCount || 0;

                                        if (fetchedEpisodeCount > savedCount) {
                                            updatedFavorites[i] = {
                                                ...fav,
                                                latestEpisodeCount: fetchedEpisodeCount,
                                                hasUpdate: true,
                                                remarks: currentVideo.vod_remarks // 順便更新畫面上顯示的備註
                                            };
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            console.error(`檢查 ${fav.title} 更新失敗:`, error);
                        }

                        // 每次請求間隔 600ms，防止被片源 API 阻擋
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

/**
 * Helper hook to get the appropriate favorites store
 */
export function useFavorites(isPremium = false) {
    const normalStore = useFavoritesStore();
    const premiumStore = usePremiumFavoritesStore();
    return isPremium ? premiumStore : normalStore;
}
