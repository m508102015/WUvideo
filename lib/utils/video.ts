/**
 * Parses a video title to extract quality tags (e.g., [HD], [TS])
 * and return a cleaned title.
 */
export function parseVideoTitle(title: string): { cleanTitle: string, quality?: string } {
    // Regex to match tags in brackets at the start of the title
    // Example: "[HD] 利刃出鞘3" -> quality: "HD", cleanTitle: "利刃出鞘3"
    // Example: "利刃出鞘3 [HD]" -> quality: "HD", cleanTitle: "利刃出鞘3"

    const bracketRegex = /\[([^\]]+)\]/g;
    let quality: string | undefined;
    let cleanTitle = title;

    const matches = [...title.matchAll(bracketRegex)];

    if (matches.length > 0) {
        // Take the first bracket content as quality (usually what we want)
        quality = matches[0][1];
        // Remove all brackets and their content from the title
        cleanTitle = title.replace(bracketRegex, '').trim();
    }

    return {
        cleanTitle: cleanTitle || title,
        quality
    };
}

/**
 * Numeric resolution keywords only.
 * Qualitative labels such as "蓝光" or "高清" are intentionally excluded because
 * they are not real numeric resolutions.
 */
const NUMERIC_RESOLUTION_PATTERNS: { pattern: RegExp; label: string; color: string }[] = [
    { pattern: /(?:^|[^\d])(4320p?|8k)(?:[^\d]|$)/i, label: '8K', color: 'bg-rose-500' },
    { pattern: /(?:^|[^\d])(2160p?|4k|uhd)(?:[^\d]|$)/i, label: '4K', color: 'bg-amber-500' },
    { pattern: /(?:^|[^\d])(1440p?|2k|qhd)(?:[^\d]|$)/i, label: '2K', color: 'bg-emerald-500' },
    { pattern: /(?:^|[^\d])(1080p?|1080i|full\s*hd|fhd)(?:[^\d]|$)/i, label: '1080P', color: 'bg-green-500' },
    { pattern: /(?:^|[^\d])720p?(?:[^\d]|$)|hd720/i, label: '720P', color: 'bg-teal-500' },
    { pattern: /(?:^|[^\d])540p?(?:[^\d]|$)/i, label: '540P', color: 'bg-cyan-500' },
    { pattern: /(?:^|[^\d])480p?(?:[^\d]|$)/i, label: '480P', color: 'bg-sky-500' },
    { pattern: /(?:^|[^\d])360p?(?:[^\d]|$)/i, label: '360P', color: 'bg-gray-500' },
    { pattern: /(?:^|[^\d])240p?(?:[^\d]|$)/i, label: '240P', color: 'bg-gray-500' },
    { pattern: /(?:^|[^\d])144p?(?:[^\d]|$)/i, label: '144P', color: 'bg-gray-500' },
];

/**
 * Extracts a numeric playback resolution from video remarks or title.
 * Non-numeric labels are intentionally ignored.
 */
export function extractNumericResolutionLabel(
    remarks?: string,
    quality?: string
): { label: string; color: string } | null {
    const text = `${remarks || ''} ${quality || ''}`;
    if (!text.trim()) return null;

    for (const { pattern, label, color } of NUMERIC_RESOLUTION_PATTERNS) {
        if (pattern.test(text)) {
            return { label, color };
        }
    }

    return null;
}

export function extractPlaybackQualityLabel(
    remarks?: string,
    quality?: string
): { label: string; color: string } | null {
    return extractNumericResolutionLabel(remarks, quality);
}

export function extractQualityLabel(remarks?: string, quality?: string): { label: string; color: string } | null {
    return extractNumericResolutionLabel(remarks, quality);
}

// ============================================================
// 追劇更新檢查（相容層）
// ------------------------------------------------------------
// 這個函式保留是為了讓舊元件（如 FavoritesItem.tsx）繼續運作。
// 新版邏輯全部集中在 favorites-store 的 checkUpdates()。
// ============================================================

import {
    useFavoritesStore,
    usePremiumFavoritesStore,
} from '@/lib/store/favorites-store';
import type { FavoriteItem } from '@/lib/types';

export interface VideoUpdateStatus {
    hasUpdate: boolean;
    watchedEpisode?: number;
    latestEpisodeCount?: number;
    unwatchedEpisodeCount?: number;
    nextEpisodeIndex?: number;
    updateCheckedAt?: number;
}

/**
 * 檢查單一收藏影片的追劇更新狀態。
 *
 * 注意：
 * - 會觸發整個收藏清單的 checkUpdates()（因為 store 是批次處理）。
 * - 若該影片不在收藏中，會直接回傳 hasUpdate: false。
 *
 * @param item 至少需要 videoId 與 source
 * @param options.isPremium 是否為 premium 收藏
 */
export async function checkVideoUpdateStatus(
    item: Pick<FavoriteItem, 'videoId' | 'source'> & Partial<FavoriteItem>,
    options?: { isPremium?: boolean }
): Promise<VideoUpdateStatus> {
    const isPremium = options?.isPremium ?? false;

    const getStore = () =>
        isPremium ? usePremiumFavoritesStore.getState() : useFavoritesStore.getState();

    const initialStore = getStore();
    const inFavorites = initialStore.favorites.some(
        fav =>
            String(fav.videoId) === String(item.videoId) &&
            fav.source === item.source
    );

    if (!inFavorites) {
        return { hasUpdate: false };
    }

    await initialStore.checkUpdates();

    const updatedStore = getStore();
    const updated = updatedStore.favorites.find(
        fav =>
            String(fav.videoId) === String(item.videoId) &&
            fav.source === item.source
    );

    if (!updated) {
        return { hasUpdate: false };
    }

    return {
        hasUpdate: updated.hasUpdate ?? false,
        watchedEpisode: updated.watchedEpisode,
        latestEpisodeCount: updated.latestEpisodeCount,
        unwatchedEpisodeCount: updated.unwatchedEpisodeCount,
        nextEpisodeIndex: updated.nextEpisodeIndex,
        updateCheckedAt: updated.updateCheckedAt,
    };
}
