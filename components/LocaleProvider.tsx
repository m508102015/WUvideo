'use client';

/**
 * LocaleProvider - Converts the entire UI between Simplified and Traditional Chinese
 * using opencc-js DOM-level conversion with an optimized MutationObserver.
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
      document.documentElement.lang = 'zh-CN';
      return;
    }

    let cleanup: (() => void) | undefined;
    let observer: MutationObserver | undefined;

    (async () => {
      try {
        const OpenCC = await import('opencc-js');
        const converter = OpenCC.Converter({ from: 'cn', to: 'tw' });

        // 1. 強制掃描整個 body，不限制 lang 屬性
        OpenCC.HTMLConverter(converter, document.body);
        document.documentElement.lang = 'zh-TW';

        // 2. 優化版的 MutationObserver：只針對「有變動的節點」進行轉換，避免效能卡頓
        let isConverting = false;
        observer = new MutationObserver((mutations) => {
          if (isConverting) return;
          isConverting = true;
          
          mutations.forEach((mutation) => {
            if (mutation.type === 'characterData') {
              const target = mutation.target.parentNode || mutation.target;
              OpenCC.HTMLConverter(converter, target as Node);
            } else if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
                  OpenCC.HTMLConverter(converter, node);
                }
              });
            }
          });
          
          isConverting = false;
        });

        observer.observe(document.body, { 
          childList: true, 
          subtree: true, 
          characterData: true 
        });

        cleanup = () => {
          observer?.disconnect();
          const reverseConverter = OpenCC.Converter({ from: 'tw', to: 'cn' });
          OpenCC.HTMLConverter(reverseConverter, document.body);
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
