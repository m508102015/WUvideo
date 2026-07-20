'use client';

import { Suspense, useMemo } from 'react';
import { SearchForm } from '@/components/search/SearchForm';
import { NoResults } from '@/components/search/NoResults';
import { PopularFeatures } from '@/components/home/PopularFeatures';
import { WatchHistorySidebar } from '@/components/history/WatchHistorySidebar';
import { FavoritesSidebar } from '@/components/favorites/FavoritesSidebar';
import { Navbar } from '@/components/layout/Navbar';
import { SearchResults } from '@/components/home/SearchResults';
import { useHomePage } from '@/lib/hooks/useHomePage';
import { useLatencyPing } from '@/lib/hooks/useLatencyPing';
// 1. 引入 OpenCC
import * as OpenCC from 'opencc-js';

function HomePage() {
  const {
    query,
    hasSearched,
    loading,
    results,
    availableSources,
    completedSources,
    totalSources,
    handleSearch, // 這是原本的搜尋邏輯
    handleReset,
  } = useHomePage();

  // 2. 初始化繁簡轉換器 (HK -> CN)
  // 使用 useMemo 確保只會建立一次，節省效能
  const converter = useMemo(() => OpenCC.Converter({ from: 'hk', to: 'cn' }), []);

  // 3. 建立一個「攔截並轉換」的新函數
  const handleConvertedSearch = (term: string) => {
    if (!term) return;
    
    // 將輸入文字轉為簡體
    const simplifiedTerm = converter(term);
    
    // (可選) 在 Console 印出轉換結果方便除錯
    // console.log(`搜尋轉換: ${term} -> ${simplifiedTerm}`);
    
    // 呼叫原本的搜尋函數，但傳入簡體字
    handleSearch(simplifiedTerm);
  };

  // Real-time latency pinging
  const sourceUrls = useMemo(() =>
    availableSources.map(s => ({ id: s.id, baseUrl: s.id })), 
    [availableSources]
  );

  const { latencies } = useLatencyPing({
    sourceUrls,
    enabled: hasSearched && results.length > 0,
  });

  return (
    <div className="min-h-screen">
      {/* Glass Navbar */}
      <Navbar onReset={handleReset} />

      {/* Search Form - Separate from navbar */}
      <div className="max-w-7xl mx-auto px-4 mt-6 mb-8 relative" style={{
        transform: 'translate3d(0, 0, 0)',
        zIndex: 1000
      }}>
        <SearchForm
          // 4. 修改這裡：換成我們新的轉換函數
          onSearch={handleConvertedSearch} 
          onClear={handleReset}
          isLoading={loading}
          initialQuery={query}
          currentSource=""
          checkedSources={completedSources}
          totalSources={totalSources}
        />
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        {/* Results Section */}
        {(results.length >= 1 || (!loading && results.length > 0)) && (
          <SearchResults
            results={results}
            availableSources={availableSources}
            loading={loading}
            latencies={latencies}
          />
        )}

        {/* Popular Features - Homepage */}
        {/* 5. 修改這裡：熱門推薦點擊也要自動轉簡體 */}
        {!loading && !hasSearched && <PopularFeatures onSearch={handleConvertedSearch} />}

        {/* No Results */}
        {!loading && hasSearched && results.length === 0 && (
          <NoResults onReset={handleReset} />
        )}
      </main>

      {/* Favorites Sidebar - Left */}
      <FavoritesSidebar />

      {/* Watch History Sidebar - Right */}
      <WatchHistorySidebar />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-[var(--accent-color)] border-t-transparent"></div>
      </div>
    }>
      <HomePage />
    </Suspense>
  );
}
