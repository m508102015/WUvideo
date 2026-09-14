/**
 * Favorites Store - Manages user's favorite videos
 * Uses Zustand with localStorage persistence.
 *
 * 追劇更新檢查：
 * 1. 以觀看歷史中的 showIdentifier / title 對應收藏。
 * 2. 透過現有 /api/detail 取得該收藏目前可取得的 episodes。
 * 3. 比較「目前觀看集數」與「最新集數」。
 *
 * 注意：不要使用 /api/search-parallel 做更新檢查。
 * 該 API 是 SSE 搜尋介面，不能拿來當影片 detail API。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FavoriteItem, VideoHistoryItem, VideoSource } from '@/lib/types';
import { profiledKey } from '@/lib/utils/profile-storage';
import { settingsStore } from './settings-store';

const MAX_FAVORITES = 100;
const UPDATE_CHECK_CONCURRENCY = 4;

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

function normalizeTitle(title: unknown): string {
    return String(title || '').toLowerCase().trim();
}

function getHistoryFromLocalStorage(): VideoHistoryItem[] {
    if (typeof window === 'undefined') return [];

    const result: VideoHistoryItem[] = [];

    try {
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key || !key.includes('kvideo-history-store')) continue;

            const raw = localStorage.getItem(key);
            if (!raw) continue;

            const parsed = JSON.parse(raw);
            const items = parsed?.state?.viewingHistory;

            if (Array.isArray(items)) {
                result.push(...items);
            }
        }
    } catch (error) {
        console.warn('[Favorites] 讀取觀看歷史失敗:', error);
    }

    return result;
}

function findHistoryForFavorite(
    favorite: FavoriteItem,
    historyItems: VideoHistoryItem[]
): VideoHistoryItem | undefined {
    const title = normalizeTitle(favorite.title);

    const byTitle = historyItems
        .filter(item => normalizeTitle(item.title) === title)
        .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (byTitle) return byTitle;

    const bySourceAndId = historyItems
        .filter(item =>
            String(item.videoId) === String(favorite.videoId) &&
            item.source === favorite.source
        )
        .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (bySourceAndId) return bySourceAndId;

    const sourceMapEntry = favorite.sourceMap?.[favorite.source];
    if (sourceMapEntry !== undefined) {
        return historyItems
            .filter(item =>
                String(item.videoId) === String(sourceMapEntry) &&
                (item.source === favorite.source || item.sourceMap?.[favorite.source] !== undefined)
            )
            .sort((a, b) => b.timestamp - a.timestamp)[0];
    }

    return undefined;
}

function getSourceConfig(sourceId: string): VideoSource | undefined {
    const settings = settingsStore.getSettings();

    return [
        ...settings.sources,
        ...settings.premiumSources,
    ].find(source => source.id === sourceId);
}

async function fetchEpisodeCount(
    favorite: FavoriteItem,
    signal?: AbortSignal
): Promise<{ count: number; poster?: string; remarks?: string } | null> {
    const sourceConfig = getSourceConfig(favorite.source);

    if (!sourceConfig) {
        console.warn(`[Favorites] 找不到來源設定: ${favorite.source}`);
        return null;
    }

    try {
        const response = await fetch('/api/detail', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: favorite.videoId,
                source: sourceConfig,
            }),
            signal,
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (!data?.success || !data?.data) return null;

        const detail = data.data;
        const episodes = Array.isArray(detail.episodes) ? detail.episodes : [];

        return {
            count: episodes.length,
            poster: detail.vod_pic || undefined,
            remarks: detail.vod_remarks || undefined,
        };
    } catch (error) {
        console.warn(`[Favorites] 檢查「${favorite.title}」失敗:`, error);
        return null;
    }
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
                            fav => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                        );
                        if (exists) return state;

                        const newFavorite: FavoriteItem = {
                            ...item,
                            savedEpisodeCount: 0,
                            watchedEpisode: 0,
                            latestEpisodeCount: undefined,
                            unwatchedEpisodeCount: 0,
                            hasUpdate: false,
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
                    set(state => ({
                        favorites: state.favorites.filter(
                            fav => generateFavoriteId(fav.videoId, fav.source) !== favoriteId
                        ),
                    }));
                },

                toggleFavorite: (item) => {
                    const state = get();
                    const favoriteId = generateFavoriteId(item.videoId, item.source);
                    const exists = state.favorites.some(
                        fav => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                    );

                    if (exists) {
                        state.removeFavorite(item.videoId, item.source);
                        return false;
                    }

                    state.addFavorite(item);
                    return true;
                },

                isFavorite: (videoId, source) => {
                    const state = get();
                    const favoriteId = generateFavoriteId(videoId, source);
                    return state.favorites.some(
                        fav => generateFavoriteId(fav.videoId, fav.source) === favoriteId
                    );
                },

                clearFavorites: () => set({ favorites: [] }),

                importFavorites: (favorites) => set({ favorites }),

                clearUpdateBadge: (videoId, source) => {
                    const favoriteId = generateFavoriteId(videoId, source);

                    set(state => ({
                        favorites: state.favorites.map(fav => {
                            if (generateFavoriteId(fav.videoId, fav.source) !== favoriteId) {
                                return fav;
                            }

                            return {
                                ...fav,
                                hasUpdate: false,
                                unwatchedEpisodeCount: 0,
                                savedEpisodeCount: fav.watchedEpisode ?? fav.savedEpisodeCount ?? 0,
                            };
                        }),
                    }));
                },

                checkUpdates: async () => {
                    const favorites = get().favorites;
                    if (favorites.length === 0) return;

                    set({ isCheckingUpdates: true });

                    const historyItems = getHistoryFromLocalStorage();
                    const updatedFavorites = [...favorites];

                    let cursor = 0;

                    const worker = async () => {
                        while (true) {
                            const index = cursor++;
                            if (index >= updatedFavorites.length) return;

                            const favorite = updatedFavorites[index];
                            const history = findHistoryForFavorite(favorite, historyItems);

                            const watchedEpisode = history
                                ? Math.max(0, Number(history.episodeIndex) + 1)
                                : 0;

                            const detail = await fetchEpisodeCount(favorite);

                            if (!detail) {
                                updatedFavorites[index] = {
                                    ...favorite,
                                    watchedEpisode,
                                };
                                continue;
                            }

                            const latestEpisodeCount = detail.count;
                            const isSeries = latestEpisodeCount > 1;

                            const unwatchedEpisodeCount = isSeries
                                ? Math.max(0, latestEpisodeCount - watchedEpisode)
                                : 0;

                            const hasUpdate = isSeries && unwatchedEpisodeCount > 0;

                            updatedFavorites[index] = {
                                ...favorite,
                                watchedEpisode,
                                savedEpisodeCount: watchedEpisode,
                                latestEpisodeCount,
                                nextEpisodeIndex: hasUpdate
                                    ? Math.min(watchedEpisode, latestEpisodeCount - 1)
                                    : undefined,
                                unwatchedEpisodeCount,
                                hasUpdate,
                                updateCheckedAt: Date.now(),
                                poster: detail.poster || favorite.poster,
                                remarks: detail.remarks || favorite.remarks,
                            };
                        }
                    };

                    try {
                        const workers = Array.from(
                            { length: Math.min(UPDATE_CHECK_CONCURRENCY, favorites.length) },
                            () => worker()
                        );

                        await Promise.all(workers);

                        set({
                            favorites: updatedFavorites,
                            isCheckingUpdates: false,
                        });
                    } catch (error) {
                        console.error('[Favorites] 更新檢查失敗:', error);
                        set({ isCheckingUpdates: false });
                    }
                },
            }),
            {
                name,
                version: 2,
                migrate: (persistedState: any) => {
                    const oldFavorites = Array.isArray(persistedState?.favorites)
                        ? persistedState.favorites
                        : [];

                    return {
                        ...persistedState,
                        favorites: oldFavorites.map((favorite: FavoriteItem) => ({
                            ...favorite,
                            watchedEpisode: favorite.watchedEpisode ?? favorite.savedEpisodeCount ?? 0,
                            unwatchedEpisodeCount: favorite.unwatchedEpisodeCount ?? 0,
                            hasUpdate: favorite.hasUpdate ?? false,
                        })),
                    };
                },
            }
        )
    );

export const useFavoritesStore = createFavoritesStore(
    profiledKey('kvideo-favorites-store')
);

export const usePremiumFavoritesStore = createFavoritesStore(
    profiledKey('kvideo-premium-favorites-store')
);

export function useFavorites(isPremium = false) {
    const normalStore = useFavoritesStore();
    const premiumStore = usePremiumFavoritesStore();
    return isPremium ? premiumStore : normalStore;
}
