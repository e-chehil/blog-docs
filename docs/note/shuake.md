# 网课后台自动连播

## 浏览器扩展

<https://www.tampermonkey.net/>

## 使用说明

1.  安装浏览器扩展 Tampermonkey。
2.  新建脚本，复制粘贴下述代码并保存。
3.  打开网课页面，脚本会自动运行。
    - 脚本会清除本地播放记录，强制从头播放视频，并在视频结束后自动跳转到下一个单元。
    - 如果视频未能在30秒内加载，脚本会自动跳转到下一个单元，多半是因为进入了答题或讨论页面。
    - 脚本会尝试在视频暂停时自动恢复播放，确保视频持续播放，适合后台学习。

## 脚本代码

### 学堂在线

```javascript
// ==UserScript==
// @name         网课后台自动连播
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  清除本地播放记录, 后台自动恢复播放, 结束后通过URL递增跳转。
// @author       Chehil
// @match        https://*.xuetangx.com/pro/lms/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const SCRIPT_PREFIX = '[自动连播脚本]';
    const PROGRESS_STORAGE_KEY = 'nhd';

    let observer;
    let timeoutId;

    function log(message) {
        console.log(SCRIPT_PREFIX, message);
    }

    function clearPlaybackProgress() {
        try {
            if (localStorage.getItem(PROGRESS_STORAGE_KEY)) {
                localStorage.removeItem(PROGRESS_STORAGE_KEY);
                log(`已清除本地播放记录 (Key: ${PROGRESS_STORAGE_KEY})，强制从头播放。`);
            }
        } catch (e) {
            console.error(SCRIPT_PREFIX, '清除播放记录时出错:', e);
        }
    }

    function jumpToNextVideo() {
        try {
            const url = new URL(window.location.href);
            const match = url.pathname.match(/\/video\/(\d+)/);

            if (match && match[1]) {
                const currentId = parseInt(match[1], 10);
                const nextId = currentId + 1;
                url.pathname = url.pathname.replace(/\/video\/\d+/, `/video/${nextId}`);
                log(`跳转到下一单元: ${url.href}`);
                window.location.href = url.href;
            } else {
                console.error(SCRIPT_PREFIX, '无法从URL中解析出视频ID，跳转失败。');
            }
        } catch (e) {
            console.error(SCRIPT_PREFIX, '构建下一个URL时发生错误:', e);
        }
    }

    function setupVideo(video) {
        if (timeoutId) {
            clearTimeout(timeoutId);
            log('已找到视频，超时跳转已取消。');
        }

        log('开始设置视频...');

        video.addEventListener('canplay', () => {
            log('视频准备就绪，强制从头开始并播放。');
            video.muted = true;
            video.currentTime = 0;
            video.addEventListener('pause', () => {
                if (!video.ended) {
                    log('检测到暂停，自动恢复播放...');
                    video.play().catch(e => log('恢复播放失败:', e.message));
                } else {
                    log('视频正常结束，不恢复播放。');
                }
            });
            video.play().catch(e => log('自动播放需要用户与页面首次交互，请点击页面。'));
            video.addEventListener('ended', jumpToNextVideo);
        }, { once: true });

        if (observer) {
            observer.disconnect();
            log('任务完成，已停止DOM观察。');
        }
    }

    function findAndSetupVideo() {
        const videoElement = document.querySelector('video');
        if (videoElement) {
            setupVideo(videoElement);
            return true;
        }
        return false;
    }

    clearPlaybackProgress();

    window.addEventListener('DOMContentLoaded', () => {
        if (findAndSetupVideo()) {
            log('脚本初始化成功，已在页面加载时找到视频。');
        } else {
            log('页面加载时未发现视频，启动观察器等待视频加载...');

            timeoutId = setTimeout(() => {
                log('等待视频超时，自动跳转到下一个页面。');
                if (observer) {
                    observer.disconnect();
                    log('因超时，已停止DOM观察。');
                }
                jumpToNextVideo();
            }, 30000);

            observer = new MutationObserver(() => {
                findAndSetupVideo();
            });

            observer.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
        }
    });

})();
```
### 雨课堂

```javascript
// ==UserScript==
// @name         雨课堂看课助手 V2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  完美实现后台自动播放与防暂停功能，稳定挂机。
// @author       Gemini
// @match        https://www.yuketang.cn/v2/web/xcloud/video-student/*
// @match        https://www.yuketang.cn/v2/web/studentLog/*
// @grant        none
// @run-at       document-documentElement
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    let currentMode = null;

    /**
     * 视频播放页的全部逻辑
     */
    function handleVideoPage() {
        if (currentMode === 'video') return;
        currentMode = 'video';
        console.log('雨课堂助手(V2.0): 已进入视频播放模式，启动视频观察器...');

        const observer = new MutationObserver((mutationsList, obs) => {
            const videoElement = document.querySelector('video');
            if (videoElement) {
                console.log('观察器检测到视频元素，应用设置...');
                const setupVideoPlayer = (video) => {
                    if (video.dataset.helperAttached) return;
                    video.dataset.helperAttached = 'true';

                    // 1. 立即尝试自动播放
                    video.muted = true;
                    video.play().catch(err => {});

                    // 2. 延迟“防暂停”功能的介入
                    setTimeout(() => {
                        console.log('冷静期结束，接管“防暂停”功能。');
                        // 只有在视频没有因为播放结束而暂停时，才强制播放
                        if (!video.ended && video.paused) {
                            video.play().catch(e => {});
                        }
                        // 附加上我们的“防暂停”卫士
                        video.addEventListener('pause', () => {
                            if (!video.ended) {
                                video.play().catch(e => {});
                            }
                        });
                    }, 2000); // 给予2秒的初始化冷静期

                    // 3. 播放结束后跳转
                    video.addEventListener('ended', () => {
                        const match = window.location.href.match(/video-student\/(\d+)/);
                        if (match && match[1]) {
                            window.location.href = `https://www.yuketang.cn/v2/web/studentLog/${match[1]}`;
                        }
                    });
                };
                setupVideoPlayer(videoElement);
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    /**
     * 课程目录页的全部逻辑
     */
    function handleCatalogPage() {
        if (currentMode === 'catalog') return;
        currentMode = 'catalog';
        console.log('雨课堂助手(V2.0): 已进入目录模式，启动混合引擎。');

        let state = 'IDLE';
        let observer;

        const findAndClickNextVideo = (iframeDoc) => {
            const searchContext = iframeDoc || document;
            const contextName = iframeDoc ? 'iFrame' : '主页面';
            console.log(`在 ${contextName} 中查找下一个未完成视频...`);

            const allItems = searchContext.querySelectorAll('.leaf-detail');
            if (allItems.length === 0) {
                console.error("错误: 找不到任何课程条目 ('.leaf-detail')！");
                return;
            }

            let nextVideoFound = false;
            for (const item of allItems) {
                if (item.querySelector('.icon--shipin')) {
                    const progressElement = item.querySelector('.progress-wrap .item');
                    const statusText = progressElement ? progressElement.textContent.trim() : '[无状态]';
                    if (statusText !== '已完成') {
                        const title = item.querySelector('.title') ? item.querySelector('.title').textContent.trim() : '未知标题';
                        console.log(`✅ 找到目标视频: "${title}" (状态: ${statusText})。准备点击...`);
                        item.click();
                        nextVideoFound = true;
                        break;
                    }
                }
            }
            if (!nextVideoFound) {
                console.log('🎉 所有视频均已完成。');
            }
        };

        const pollForContent = () => {
            console.log('启动内容轮询器，等待内容就绪...');
            let checks = 0;
            const maxChecks = 60;
            const interval = setInterval(() => {
                checks++;
                try {
                    const iframe = document.querySelector('iframe');
                    if (iframe && iframe.contentWindow && iframe.contentWindow.document) {
                        const iframeDocument = iframe.contentWindow.document;
                        const loader = iframeDocument.querySelector('.loading-view');
                        if (!loader) {
                            clearInterval(interval);
                            console.log('轮询成功：加载动画已消失。额外等待2秒以同步最新进度...');
                            setTimeout(() => {
                                findAndClickNextVideo(iframeDocument);
                            }, 2000);
                            return;
                        }
                    }
                } catch(e) { /* iFrame可能暂时无法访问 */ }
                if (checks > maxChecks) {
                    console.error('轮询超时：加载动画一直存在。');
                    clearInterval(interval);
                }
            }, 500);
        };

        const mainTick = () => {
            try {
                if (state === 'IDLE' || state === 'WAITING_FOR_TAB') {
                    const tab = document.querySelector('#tab-content');
                    if (!tab) return;
                    if (tab.classList.contains('is-active')) {
                        console.log('状态机：任务完成，控制权移交至轮询器。');
                        state = 'POLLING';
                        observer.disconnect();
                        pollForContent();
                    } else if (state === 'IDLE') {
                        console.log('状态机：正在点击“学习内容”标签页...');
                        state = 'WAITING_FOR_TAB';
                        tab.click();
                    }
                }
            } catch (e) {
                console.error('状态机出错:', e);
                if(observer) observer.disconnect();
            }
        };
        observer = new MutationObserver(mainTick);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        mainTick();
    }

    /**
     * 主路由：持续监控URL变化，决定运行哪个模式
     */
    const mainRouter = () => {
        const url = window.location.href;
        if (url.includes('/video-student/') && currentMode !== 'video') {
            handleVideoPage();
        } else if (url.includes('/studentLog/') && currentMode !== 'catalog') {
            handleCatalogPage();
        }
    };

    new MutationObserver(mainRouter).observe(document.documentElement, { attributes: true, childList: true, subtree: true });
    window.addEventListener('load', mainRouter);

})();
```