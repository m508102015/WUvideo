'use client';

import React from 'react';
import { Icons } from '@/components/ui/Icon';
import { usePlayerSettings } from '../hooks/usePlayerSettings';
import { settingsStore, AdFilterMode } from '@/lib/store/settings-store';
import { createPortal } from 'react-dom';

interface DesktopMoreMenuProps {
    showMoreMenu: boolean;
    isPremium?: boolean;
    isProxied?: boolean;
    onToggleMoreMenu: () => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
    onCopyLink: (type?: 'original' | 'proxy') => void;
    webFullscreenSize: 'full' | 'large' | 'focused';
    onCycleWebFullscreenSize: () => void;
    containerRef: React.RefObject<HTMLDivElement | null>;
    isRotated?: boolean;
}

export function DesktopMoreMenu({
    showMoreMenu,
    isPremium = false,
    isProxied = false,
    onToggleMoreMenu,
    onMouseEnter,
    onMouseLeave,
    onCopyLink,
    webFullscreenSize,
    onCycleWebFullscreenSize,
    containerRef,
    isRotated = false
}: DesktopMoreMenuProps) {
    const {
        autoNextEpisode,
        autoSkipIntro,
        skipIntroSeconds,
        autoSkipOutro,
        skipOutroSeconds,
        showModeIndicator,
        adFilter,
        setAutoNextEpisode,
        setAutoSkipIntro,
        setSkipIntroSeconds,
        setAutoSkipOutro,
        setSkipOutroSeconds,
        setShowModeIndicator,
        setAdFilter,
        adFilterMode,
        setAdFilterMode,
        fullscreenType,
        setFullscreenType,
        danmakuEnabled,
        setDanmakuEnabled,
        danmakuApiUrl,
        danmakuOpacity,
        setDanmakuOpacity,
        danmakuFontSize,
        setDanmakuFontSize,
        danmakuDisplayArea,
        setDanmakuDisplayArea,
    } = usePlayerSettings(isPremium);

    const buttonRef = React.useRef<HTMLButtonElement>(null);
    const menuRef = React.useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = React.useState({ top: 0, left: 0, maxHeight: 'none', openUpward: false, align: 'right' as 'left' | 'right' });
    const [isAdFilterOpen, setAdFilterOpen] = React.useState(false);

    const AD_FILTER_LABELS: Record<string, string> = {
        off: '关闭',
        keyword: '关键词',
        heuristic: '智能(Beta)',
        aggressive: '激进'
    };
    const WEB_FULLSCREEN_SIZE_LABELS: Record<'full' | 'large' | 'focused', string> = {
        full: '铺满窗口',
        large: '大窗模式',
        focused: '聚焦影院',
    };

    const [isFullscreen, setIsFullscreen] = React.useState(false);

    React.useEffect(() => {
        const updateFullscreen = () => {
            const nativeFullscreen = !!document.fullscreenElement;
            const windowFullscreen = containerRef.current?.closest('.is-web-fullscreen') !== null;
            setIsFullscreen(nativeFullscreen || windowFullscreen);
        };
        document.addEventListener('fullscreenchange', updateFullscreen);
        const interval = setInterval(updateFullscreen, 500);
        updateFullscreen();
        return () => {
            document.removeEventListener('fullscreenchange', updateFullscreen);
            clearInterval(interval);
        };
    }, [containerRef]);

    const calculateMenuPosition = React.useCallback(() => {
        if (!buttonRef.current || !containerRef.current) return;

        if (!isRotated && !isFullscreen) {
            const buttonRect = buttonRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            const spaceBelow = viewportHeight - buttonRect.bottom - 10;
            const spaceAbove = buttonRect.top - 10;

            const estimatedMenuHeight = 450;
            const actualMenuHeight = menuRef.current?.offsetHeight || estimatedMenuHeight;

            const openUpward = spaceBelow < Math.min(actualMenuHeight, 300) && spaceAbove > spaceBelow;
            const maxHeight = openUpward
                ? Math.min(spaceAbove, actualMenuHeight)
                : Math.min(spaceBelow, viewportHeight * 0.7);

            const isLeftHalf = buttonRect.left < viewportWidth / 2;
            const align = isLeftHalf ? 'left' : 'right';

            let left = isLeftHalf ? buttonRect.left : buttonRect.right;

            if (isLeftHalf) {
                left = Math.max(left, 10);
            } else {
                left = Math.min(left, viewportWidth - 10);
            }

            setMenuPosition({
                top: openUpward ? buttonRect.top - 10 : buttonRect.bottom + 10,
                left: left,
                maxHeight: `${maxHeight}px`,
                openUpward: openUpward,
                align: align
            });
        } else if (isFullscreen && !isRotated) {
            let top = 0;
            let left = 0;
            let el: HTMLElement | null = buttonRef.current;

            while (el && el !== containerRef.current) {
                top += el.offsetTop;
                left += el.offsetLeft;
                el = el.offsetParent as HTMLElement;
            }

            const buttonHeight = buttonRef.current.offsetHeight;
            const buttonWidth = buttonRef.current.offsetWidth;
            const containerWidth = containerRef.current.offsetWidth;
            const containerHeight = containerRef.current.offsetHeight;

            const spaceBelow = containerHeight - (top + buttonHeight) - 10;
            const spaceAbove = top - 10;

            const estimatedMenuHeight = 450;
            const actualMenuHeight = menuRef.current?.offsetHeight || estimatedMenuHeight;

            const openUpward = spaceBelow < Math.min(actualMenuHeight, 300) && spaceAbove > spaceBelow;
            const maxHeight = openUpward
                ? Math.min(spaceAbove, actualMenuHeight)
                : Math.min(spaceBelow, containerHeight * 0.7);

            const isLeftHalf = left < containerWidth / 2;
            const align = isLeftHalf ? 'left' : 'right';

            setMenuPosition({
                top: openUpward ? top - 10 : top + buttonHeight + 10,
                left: isLeftHalf ? left : left + buttonWidth,
                maxHeight: `${maxHeight}px`,
                openUpward: openUpward,
                align: align
            });
        } else {
            let top = 0;
            let left = 0;
            let el: HTMLElement | null = buttonRef.current;

            while (el && el !== containerRef.current) {
                top += el.offsetTop;
                left += el.offsetLeft;
                el = el.offsetParent as HTMLElement;
            }

            const buttonWidth = buttonRef.current.offsetWidth;
            const containerWidth = containerRef.current.offsetWidth;
            const containerHeight = containerRef.current.offsetHeight;

            const spaceToLandscapeTop = left;
            const spaceToLandscapeBottom = containerWidth - (left + buttonWidth);

            const estimatedMenuHeight = 450;
            const actualMenuHeight = menuRef.current?.offsetHeight || estimatedMenuHeight;

            const openUpward = spaceToLandscapeBottom < Math.min(actualMenuHeight, 300) && spaceToLandscapeTop > spaceToLandscapeBottom;
            const maxHeight = openUpward
                ? Math.min(spaceToLandscapeTop - 10, actualMenuHeight)
                : Math.min(spaceToLandscapeBottom - 10, containerHeight * 0.7);

            const isLandscapeRightHalf = top < containerHeight / 2;
            const align = isLandscapeRightHalf ? 'left' : 'right';

            setMenuPosition({
                top: top, 
                left: left, 
                maxHeight: `${maxHeight}px`,
                openUpward: openUpward,
                align: align
            });
        }
    }, [containerRef, isRotated, isFullscreen]);

    React.useEffect(() => {
        if (!showMoreMenu) return;
        const handleScroll = () => {
            if (showMoreMenu) {
                onToggleMoreMenu();
            }
        };
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [showMoreMenu, onToggleMoreMenu]);

    React.useEffect(() => {
        if (showMoreMenu) {
            calculateMenuPosition();
            const timer = setTimeout(calculateMenuPosition, 50);
            return () => clearTimeout(timer);
        }
    }, [showMoreMenu, calculateMenuPosition, isRotated]);

    const handleToggle = () => {
        if (!showMoreMenu) {
            calculateMenuPosition();
        }
        onToggleMoreMenu();
    };

    const MenuContent = (
        <div
            ref={menuRef}
            className={`absolute z-[2147483647] bg-[var(--glass-bg)] backdrop-blur-[25px] saturate-[180%] rounded-[var(--radius-2xl)] border border-[var(--glass-border)] shadow-[var(--shadow-md)] p-1.5 sm:p-2 w-fit ${isRotated ? 'min-w-[170px]' : 'min-w-[200px] sm:min-w-[240px]'} animate-in fade-in zoom-in-95 duration-200 overflow-y-auto`}
            style={{
                ...(isRotated ? {
                    ...(menuPosition.openUpward ? {
                        right: `calc(100% - ${menuPosition.left}px + 10px)`,
                        left: 'auto'
                    } : {
                        left: `${menuPosition.left + buttonRef.current?.offsetWidth! + 10}px`,
                        right: 'auto'
                    }),
                    top: `${menuPosition.top}px`,
                    transform: menuPosition.align === 'right' ? 'translateY(-100%)' : 'none',
                } : {
                    top: `${menuPosition.top}px`,
                    left: `${menuPosition.left}px`,
                    transform: menuPosition.align === 'right' ? 'translateX(-100%)' : 'none',
                }),
                maxHeight: menuPosition.maxHeight,
            }}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
            // 🍎 終極防護牆：阻斷所有事件冒泡，防止觸控訊號漏給底層影片播放器導致選單關閉
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
        >
            {/* Copy Link Options */}
            {isProxied ? (
                <>
                    <button
                        onClick={() => onCopyLink('original')}
                        className={`w-full ${isRotated ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm'} text-left text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_15%,transparent)] rounded-[var(--radius-2xl)] transition-colors flex items-center gap-2 group-hover:gap-3 cursor-pointer`}
                    >
                        <Icons.Link size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                        <span>复制原链接</span>
                    </button>
                    <button
                        onClick={() => onCopyLink('proxy')}
                        className={`w-full ${isRotated ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm'} text-left text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_15%,transparent)] rounded-[var(--radius-2xl)] transition-colors flex items-center gap-2 mt-0.5 cursor-pointer`}
                    >
                        <Icons.Link size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                        <span>复制代理链接</span>
                    </button>
                </>
            ) : (
                <button
                    onClick={() => onCopyLink('original')}
                    className={`w-full ${isRotated ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm'} text-left text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_15%,transparent)] rounded-[var(--radius-2xl)] transition-colors flex items-center gap-2 group-hover:gap-3 cursor-pointer`}
                >
                    <Icons.Link size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>复制链接</span>
                </button>
            )}

            <div className="h-px bg-[var(--glass-border)] my-1.5 sm:my-2" />

            {/* Fullscreen Mode Selector */}
            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex items-center justify-between gap-4`}>
                <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    <Icons.Settings size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>全屏方式</span>
                </div>
                <div className="relative">
                    <button
                        onClick={() => {
                            if (fullscreenType === 'auto') setFullscreenType('native');
                            else if (fullscreenType === 'native') setFullscreenType('window');
                            else setFullscreenType('auto');
                        }}
                        className={`flex items-center gap-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] rounded-[var(--radius-2xl)] outline-none hover:border-[var(--accent-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_5%,transparent)] transition-all cursor-pointer whitespace-nowrap ${isRotated ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs'}`}
                    >
                        <span>
                            {fullscreenType === 'auto' ? '自动 (Auto)' : fullscreenType === 'native' ? '系统全屏' : '网页全屏'}
                        </span>
                        <Icons.Maximize size={isRotated ? 10 : 12} className="text-[var(--text-color-secondary)]" />
                    </button>
                </div>
            </div>

            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex items-center justify-between gap-4`}>
                <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    <Icons.Target size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>网页全屏尺寸</span>
                </div>
                <button
                    onClick={onCycleWebFullscreenSize}
                    className={`flex items-center gap-1 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] rounded-[var(--radius-2xl)] outline-none hover:border-[var(--accent-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_5%,transparent)] transition-all cursor-pointer whitespace-nowrap ${isRotated ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 sm:px-2.5 py-1 sm:py-1.5 text-[10px] sm:text-xs'}`}
                >
                    <span>{WEB_FULLSCREEN_SIZE_LABELS[webFullscreenSize]}</span>
                    <Icons.ChevronDown size={isRotated ? 10 : 12} className="text-[var(--text-color-secondary)]" />
                </button>
            </div>

            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex items-center justify-between gap-4`}>
                <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    <Icons.Zap size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>模式指示器</span>
                </div>
                <button
                    onClick={() => setShowModeIndicator(!showModeIndicator)}
                    className={`relative rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 border border-white/20 ${showModeIndicator
                        ? 'bg-[var(--accent-color)] shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.6)]'
                        : 'bg-white/5 hover:bg-white/10'
                        } ${isRotated ? 'w-6 h-3.5' : 'w-8 h-[18px] sm:w-10 sm:h-6'}`}
                    aria-checked={showModeIndicator}
                    role="switch"
                >
                    <span
                        className={`absolute top-0.5 left-0.5 bg-white rounded-full transition-transform duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${isRotated ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4.5 sm:h-4.5'} ${showModeIndicator ? (isRotated ? 'translate-x-2.5' : 'translate-x-3.5 sm:translate-x-4.5') : 'translate-x-0'
                            }`}
                    />
                </button>
            </div>

            {/* Ad Filter Mode Selector */}
            <div className="px-3 py-2 sm:px-4 sm:py-2.5 flex items-center justify-between gap-4 sm:gap-6">
                <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[var(--text-color)]">
                    <Icons.ShieldAlert size={16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>广告过滤</span>
                </div>
                <div className="relative">
                    <button
                        onClick={() => setAdFilterOpen(!isAdFilterOpen)}
                        className="flex items-center gap-1 sm:gap-1.5 bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-color)] text-[10px] sm:text-xs rounded-[var(--radius-2xl)] px-2 sm:px-2.5 py-1 sm:py-1.5 outline-none hover:border-[var(--accent-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_5%,transparent)] transition-all cursor-pointer whitespace-nowrap"
                    >
                        <span>{AD_FILTER_LABELS[adFilterMode] || '关闭'}</span>
                        <Icons.ChevronDown size={12} className={`text-[var(--text-color-secondary)] transition-transform duration-300 ${isAdFilterOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isAdFilterOpen && (
                        <>
                            <div className="fixed inset-0 z-10 cursor-default" onClick={() => setAdFilterOpen(false)} />
                            <div className="absolute right-0 top-full mt-2 w-28 sm:w-32 bg-[var(--glass-bg)] backdrop-blur-[25px] saturate-[180%] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] shadow-[var(--shadow-md)] p-1 overflow-hidden z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200">
                                {Object.entries(AD_FILTER_LABELS).map(([mode, label]) => (
                                    <button
                                        key={mode}
                                        onClick={() => {
                                            setAdFilterMode(mode as AdFilterMode);
                                            setAdFilterOpen(false);
                                        }}
                                        className={`text-left text-[10px] sm:text-xs px-2 sm:px-3 py-1.5 sm:py-2 rounded-[var(--radius-2xl)] hover:bg-[color-mix(in_srgb,var(--accent-color)_15%,transparent)] transition-colors w-full flex items-center justify-between group ${adFilterMode === mode ? 'text-[var(--accent-color)] font-medium bg-[color-mix(in_srgb,var(--accent-color)_5%,transparent)]' : 'text-[var(--text-color)]'
                                            }`}
                                    >
                                        <span>{label}</span>
                                        {adFilterMode === mode && <Icons.Check size={10} className="sm:w-[12px] sm:h-[12px] text-[var(--accent-color)]" />}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <div className="h-px bg-[var(--glass-border)] my-1.5 sm:my-2" />

            {/* Danmaku Toggle */}
            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex items-center justify-between gap-4`}>
                <div className={`flex items-center gap-2 ${!danmakuApiUrl ? 'text-[var(--text-color-secondary)]' : 'text-[var(--text-color)]'} ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    <Icons.Danmaku size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>弹幕</span>
                    {!danmakuApiUrl && (
                        <span className={`${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'} text-[var(--text-color-secondary)]`}>(未配置)</span>
                    )}
                </div>
                <button
                    onClick={() => danmakuApiUrl && setDanmakuEnabled(!danmakuEnabled)}
                    disabled={!danmakuApiUrl}
                    className={`relative rounded-full transition-all duration-300 flex-shrink-0 border border-white/20 ${!danmakuApiUrl
                        ? 'bg-white/5 opacity-40 cursor-not-allowed'
                        : danmakuEnabled
                            ? 'bg-[var(--accent-color)] shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.6)] cursor-pointer'
                            : 'bg-white/5 hover:bg-white/10 cursor-pointer'
                        } ${isRotated ? 'w-6 h-3.5' : 'w-8 h-[18px] sm:w-10 sm:h-6'}`}
                    aria-checked={danmakuEnabled}
                    role="switch"
                >
                    <span
                        className={`absolute top-0.5 left-0.5 bg-white rounded-full transition-transform duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${isRotated ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4.5 sm:h-4.5'} ${danmakuEnabled && danmakuApiUrl ? (isRotated ? 'translate-x-2.5' : 'translate-x-3.5 sm:translate-x-4.5') : 'translate-x-0'
                            }`}
                    />
                </button>
            </div>

            {/* Danmaku Sub-Settings */}
            {danmakuEnabled && danmakuApiUrl && (
                <div className={`${isRotated ? 'px-2 pb-1.5' : 'px-3 pb-2 sm:px-4 sm:pb-2.5'} space-y-2.5`}>
                    <div className={`${isRotated ? 'ml-4' : 'ml-6 sm:ml-7'}`}>
                        <div className={`flex items-center justify-between mb-1 ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'} text-[var(--text-color-secondary)]`}>
                            <span>透明度</span>
                            <span>{Math.round(danmakuOpacity * 100)}%</span>
                        </div>
                        <input
                            type="range"
                            min="10"
                            max="100"
                            value={Math.round(danmakuOpacity * 100)}
                            onChange={(e) => setDanmakuOpacity(parseInt(e.target.value) / 100)}
                            className={`w-full accent-[var(--accent-color)] ${isRotated ? 'h-1' : 'h-1.5'}`}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchMove={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                        />
                    </div>

                    <div className={`${isRotated ? 'ml-4' : 'ml-6 sm:ml-7'}`}>
                        <div className={`mb-1 ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'} text-[var(--text-color-secondary)]`}>字号</div>
                        <div className="flex gap-1 flex-wrap">
                            {[14, 18, 20, 24, 28].map((size) => (
                                <button
                                    key={size}
                                    onClick={() => setDanmakuFontSize(size)}
                                    className={`rounded-[var(--radius-2xl)] border font-medium transition-all duration-200 cursor-pointer ${isRotated ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px] sm:text-xs'} ${danmakuFontSize === size
                                        ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white'
                                        : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)]'
                                        }`}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={`${isRotated ? 'ml-4' : 'ml-6 sm:ml-7'}`}>
                        <div className={`mb-1 ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'} text-[var(--text-color-secondary)]`}>显示区域</div>
                        <div className="flex gap-1 flex-wrap">
                            {([
                                { value: 0.25, label: '1/4屏' },
                                { value: 0.5, label: '半屏' },
                                { value: 0.75, label: '3/4屏' },
                                { value: 1.0, label: '全屏' },
                            ] as const).map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setDanmakuDisplayArea(value)}
                                    className={`rounded-[var(--radius-2xl)] border font-medium transition-all duration-200 cursor-pointer ${isRotated ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px] sm:text-xs'} ${danmakuDisplayArea === value
                                        ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white'
                                        : 'bg-[var(--glass-bg)] border-[var(--glass-border)] text-[var(--text-color)] hover:bg-[color-mix(in_srgb,var(--accent-color)_10%,transparent)]'
                                        }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'} flex items-center justify-between gap-4`}>
                <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                    <Icons.SkipForward size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                    <span>自动下一集</span>
                </div>
                <button
                    onClick={() => setAutoNextEpisode(!autoNextEpisode)}
                    className={`relative rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 border border-white/20 ${autoNextEpisode
                        ? 'bg-[var(--accent-color)] shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.6)]'
                        : 'bg-white/5 hover:bg-white/10'
                        } ${isRotated ? 'w-6 h-3.5' : 'w-8 h-[18px] sm:w-10 sm:h-6'}`}
                    aria-checked={autoNextEpisode}
                    role="switch"
                >
                    <span
                        className={`absolute top-0.5 left-0.5 bg-white rounded-full transition-transform duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${isRotated ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4.5 sm:h-4.5'} ${autoNextEpisode ? (isRotated ? 'translate-x-2.5' : 'translate-x-3.5 sm:translate-x-4.5') : 'translate-x-0'
                            }`}
                    />
                </button>
            </div>

            {/* Skip Intro Switch & Input */}
            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                        <Icons.FastForward size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                        <span>跳过片头</span>
                    </div>
                    <button
                        onClick={() => setAutoSkipIntro(!autoSkipIntro)}
                        className={`relative rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 border border-white/20 ${autoSkipIntro
                            ? 'bg-[var(--accent-color)] shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.6)]'
                            : 'bg-white/5 hover:bg-white/10'
                            } ${isRotated ? 'w-6 h-3.5' : 'w-8 h-[18px] sm:w-10 sm:h-6'}`}
                        aria-checked={autoSkipIntro}
                        role="switch"
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 bg-white rounded-full transition-transform duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${isRotated ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4.5 sm:h-4.5'} ${autoSkipIntro ? (isRotated ? 'translate-x-2.5' : 'translate-x-3.5 sm:translate-x-4.5') : 'translate-x-0'
                                }`}
                        />
                    </button>
                </div>
                {autoSkipIntro && (
                    <div className={`mt-2 flex items-center gap-1.5 ${isRotated ? 'ml-4' : 'ml-6 sm:ml-7'}`}>
                        <span className={`text-[var(--text-color-secondary)] ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>时长:</span>
                        {/* 🍎 為輸入框也補上獨立的防穿透，確保點擊時不會漏給外層 */}
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={skipIntroSeconds === 0 ? '' : skipIntroSeconds}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setSkipIntroSeconds(val ? parseInt(val) : 0);
                            }}
                            className={`text-center bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] text-[var(--text-color)] focus:outline-none focus:border-[var(--accent-color)] no-spinner ${isRotated ? 'w-10 px-1 py-0 text-[10px]' : 'w-12 sm:w-16 px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs sm:text-sm'}`}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            style={{ pointerEvents: 'auto', userSelect: 'text', WebkitUserSelect: 'text' }}
                        />
                        <span className={`text-[var(--text-color-secondary)] ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>秒</span>
                    </div>
                )}
            </div>

            {/* Skip Outro Switch & Input */}
            <div className={`${isRotated ? 'px-2 py-1.5' : 'px-3 py-2 sm:px-4 sm:py-2.5'}`}>
                <div className="flex items-center justify-between gap-4">
                    <div className={`flex items-center gap-2 text-[var(--text-color)] ${isRotated ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
                        <Icons.Rewind size={isRotated ? 14 : 16} className="sm:w-[18px] sm:h-[18px]" />
                        <span>跳过片尾</span>
                    </div>
                    <button
                        onClick={() => setAutoSkipOutro(!autoSkipOutro)}
                        className={`relative rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 border border-white/20 ${autoSkipOutro
                            ? 'bg-[var(--accent-color)] shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.6)]'
                            : 'bg-white/5 hover:bg-white/10'
                            } ${isRotated ? 'w-6 h-3.5' : 'w-8 h-[18px] sm:w-10 sm:h-6'}`}
                        aria-checked={autoSkipOutro}
                        role="switch"
                    >
                        <span
                            className={`absolute top-0.5 left-0.5 bg-white rounded-full transition-transform duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] ${isRotated ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5 sm:w-4.5 sm:h-4.5'} ${autoSkipOutro ? (isRotated ? 'translate-x-2.5' : 'translate-x-3.5 sm:translate-x-4.5') : 'translate-x-0'
                                }`}
                        />
                    </button>
                </div>
                {autoSkipOutro && (
                    <div className={`mt-2 flex items-center gap-1.5 ${isRotated ? 'ml-4' : 'ml-6 sm:ml-7'}`}>
                        <span className={`text-[var(--text-color-secondary)] ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>剩余:</span>
                        {/* 🍎 為輸入框也補上獨立的防穿透，確保點擊時不會漏給外層 */}
                        <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={skipOutroSeconds === 0 ? '' : skipOutroSeconds}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                setSkipOutroSeconds(val ? parseInt(val) : 0);
                            }}
                            className={`text-center bg-[var(--glass-bg)] border border-[var(--glass-border)] rounded-[var(--radius-2xl)] text-[var(--text-color)] focus:outline-none focus:border-[var(--accent-color)] no-spinner ${isRotated ? 'w-10 px-1 py-0 text-[10px]' : 'w-12 sm:w-16 px-1.5 py-0.5 sm:px-2 sm:py-1 text-xs sm:text-sm'}`}
                            onClick={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onTouchEnd={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onPointerUp={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            style={{ pointerEvents: 'auto', userSelect: 'text', WebkitUserSelect: 'text' }}
                        />
                        <span className={`text-[var(--text-color-secondary)] ${isRotated ? 'text-[9px]' : 'text-[10px] sm:text-xs'}`}>秒</span>
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                onClick={handleToggle}
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                className="group flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm transition-all duration-300 hover:scale-110 active:scale-95"
                aria-label="更多选项"
                title="更多选项"
            >
                <Icons.MoreHorizontal className="text-white/80 group-hover:text-white w-[20px] h-[20px] sm:w-[24px] sm:h-[24px]" />
            </button>

            {showMoreMenu && typeof document !== 'undefined' && createPortal(MenuContent, ((isRotated || isFullscreen) && containerRef.current) ? containerRef.current : document.body)}
        </div>
    );
}
