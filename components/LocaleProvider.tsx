'use client';

/**
 * LocaleProvider - Converts the entire UI between Simplified and Traditional Chinese
 * using opencc-js DOM-level conversion with a custom MutationObserver.
 */

import { useEffect, useState } from 'react';
import { settingsStore, type LocaleOption } from '@/lib/store/settings-store';

export function LocaleProvider() {
  const [locale, setLocale] = useState<LocaleOption>('zh-CN');

  // Listen for settings changes
  useEffect(() => {
    const settings = settingsStore.getSettings();
    setLocale(settings.locale);

    const unsub = settingsStore.subscribe(() => {
      const updated = settingsStore.getSettings();
      setLocale(updated.locale);
    });

    return unsub;
  }, []);

  // Apply DOM-level conversion when locale changes
  useEffect(() => {
    if (locale !== 'zh-TW') {
      // Reset to original (Simplified) by reloading lang attribute
      document.documentElement.lang = 'zh-CN';
      return;
    }

    let cleanup: (() => void) | undefined;
    let observer: MutationObserver | undefined;

    (async () => {
      try {
        const OpenCC = await import('opencc-js');
        const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

        // 1. 取得轉換函數並「立即執行」第一次全域轉換
        const convertDOM = OpenCC.HTMLConverter(converter, document.documentElement, 'zh-CN', 'zh-TW');
        convertDOM(); 
        
        document.documentElement.lang = 'zh-TW';

        // 2. 手動建立 MutationObserver 攔截 React 的動態渲染
        // 加入 isConverting 鎖，防止 opencc 修改 DOM 時觸發自身的無限迴圈
        let isConverting = false;
        observer = new MutationObserver(() => {
          if (isConverting) return;
          isConverting = true;
          convertDOM(); // 當 React 產生新元素時，立刻轉換
          isConverting = false;
        });

        // 開始監視整個 body 的節點變化與文字內容變化
        observer.observe(document.body, { 
          childList: true, 
          subtree: true, 
          characterData: true 
        });

        cleanup = () => {
          observer?.disconnect();
          // Reverse conversion on cleanup
          const reverseConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
          const revertDOM = OpenCC.HTMLConverter(reverseConverter, document.documentElement, 'zh-TW', 'zh-CN');
          revertDOM(); // 執行還原
          document.documentElement.lang = 'zh-CN';
        };
      } catch (err) {
        console.warn('[LocaleProvider] Failed to load opencc-js:', err);
      }
    })();

    return () => {
      observer?.disconnect();
      cleanup?.();
    };
  }, [locale]);

  return null;
}
