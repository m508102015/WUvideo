'use client';

/**
 * LocaleProvider - Converts the entire UI between Simplified and Traditional Chinese
 * using opencc-js DOM-level conversion with a custom recursive observer.
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

        // 🍎 關鍵修改：自己寫一個遞迴文字轉換器，徹底避開 HTMLConverter 的 4 參數限制與 lang 檢查 Bug
        const convertTextNodes = (node: Node, conv: (text: string) => string) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.nodeValue && node.nodeValue.trim()) {
              const converted = conv(node.nodeValue);
              if (converted !== node.nodeValue) {
                node.nodeValue = converted;
              }
            }
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const el = node as Element;
            if (el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE') {
              el.childNodes.forEach(child => convertTextNodes(child, conv));
            }
          }
        };

        // 1. 立即執行第一次全域轉換
        convertTextNodes(document.body, converter);
        document.documentElement.lang = 'zh-TW';

        // 2. 建立 MutationObserver 攔截動態渲染
        let isConverting = false;
        observer = new MutationObserver((mutations) => {
          if (isConverting) return;
          isConverting = true;

          mutations.forEach((mutation) => {
            if (mutation.type === 'characterData') {
              const target = mutation.target.parentNode || mutation.target;
              convertTextNodes(target as Node, converter);
            } else if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                convertTextNodes(node, converter);
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
          convertTextNodes(document.body, reverseConverter);
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
