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

        // 1. 建立一個包裝函數來重複執行轉換
        const convertDOM = () => {
          OpenCC.HTMLConverter(converter, document.documentElement, 'zh-CN', 'zh-TW');
        };

        // 立即執行第一次全域轉換
        convertDOM(); 
        document.documentElement.lang = 'zh-TW';

        // 2. 手動建立 MutationObserver 攔截 React 的動態渲染
        observer = new MutationObserver(() => {
          // 安全鎖：轉換前先暫停監聽，防止 OpenCC 改變文字時觸發 MutationObserver 導致無限迴圈
          observer?.disconnect();
          
          convertDOM(); // 執行繁體轉換
          
          // 轉換完成後，重新掛載監聽器
          observer?.observe(document.body, { 
            childList: true, 
            subtree: true, 
            characterData: true 
          });
        });

        // 首次啟動監聽
        observer.observe(document.body, { 
          childList: true, 
          subtree: true, 
          characterData: true 
        });

        cleanup = () => {
          observer?.disconnect();
          // Reverse conversion on cleanup
          const reverseConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
          OpenCC.HTMLConverter(reverseConverter, document.documentElement, 'zh-TW', 'zh-CN');
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
