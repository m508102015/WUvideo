/**
 * Core type definitions for KVideo platform
 */

// API Source Configuration
export interface VideoSource {
  id: string;
  name: string;
  baseUrl: string;
  searchPath: string;
  detailPath: string;
  headers?: Record<string, string>;
  enabled?: boolean;
  priority?: number;
  group?: 'normal' | 'premium';
}

// Source Subscription for auto-updating sources from a URL
export interface SourceSubscription {
  id: string;
  name: string;
  url: string;
  lastUpdated: number;
  autoRefresh: boolean;
}

// Video Search Result
export interface VideoItem {
  vod_id: number | string;
  vod_name: string;
  vod_pic?: string;
  type_name?: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_content?: string;
  vod_lang?: string;
  source: string;
  latency?: number;
}

export interface Video extends VideoItem {
  sourceName?: string;
  isNew?: boolean;
  relevanceScore?: number;
}

export interface SourceBadge {
  id: string;
  name: string;
  count: number;
  baseUrl?: string;
  typeName?: string;
}

export interface TypeBadge {
  type: string;
  count: number;
}

export interface LanguageBadge {
  lang: string;
  count: number;
}

// Episode Information
export interface Episode {
  name: string;
  url: string;
  index: number;
}

// Full Video Detail
export interface VideoDetail {
  vod_id: number | string;
  vod_name: string;
  vod_pic: string;
  vod_remarks?: string;
  vod_year?: string;
  vod_area?: string;
  vod_actor?: string;
  vod_director?: string;
  vod_content?: string;
  type_name?: string;
  vod_lang?: string;
  episodes: Episode[];
  source: string;
  source_code: string;
}

// History Entry
export interface VideoHistoryItem {
  videoId: string | number;
  title: string;
  url: string;
  episodeIndex: number;
  source: string;
  timestamp: number;
  playbackPosition: number;
  duration: number;
  poster?: string;
  episodes: Episode[];
  showIdentifier: string;
  sourceMap?: Record<string, string | number>;
  vod_actor?: string;
  type_name?: string;
  vod_area?: string;
}

// Favorite Entry
export interface FavoriteItem {
  videoId: string | number;
  title: string;
  poster?: string;
  source: string;
  sourceName?: string;
  addedAt: number;
  type?: string;
  year?: string;
  remarks?: string;
  sourceMap?: Record<string, string | number>;

  // 追劇進度 / 更新檢查（必要欄位，勿刪除）
  savedEpisodeCount?: number;
  latestEpisodeCount?: number;
  watchedEpisode?: number;
  nextEpisodeIndex?: number;
  unwatchedEpisodeCount?: number;
  hasUpdate?: boolean;
  updateCheckedAt?: number;
}

// API Response Structures
export interface ApiSearchResponse {
  code: number;
  msg?: string;
  page?: number;
  pagecount?: number;
  limit?: number;
  total?: number;
  list: VideoItem[];
}

export interface ApiDetailResponse {
  code: number;
  msg?: string;
  list: Array<{
    vod_id: number | string;
    vod_name: string;
    vod_pic: string;
    vod_remarks?: string;
    vod_year?: string;
    vod_area?: string;
    vod_actor?: string;
    vod_director?: string;
    vod_content?: string;
    type_name?: string;
    vod_lang?: string;
    vod_play_from?: string;
    vod_play_url?: string;
  }>;
}
