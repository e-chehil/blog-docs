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
