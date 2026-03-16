// ==UserScript==
// @name         知乎专栏时间IP显示增强
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  在知乎专栏文章和回答页面的最顶端，显示每篇专栏或回答的创建时间和最新编辑时间以及IP属地
// @author       Foxyrep 15319350358@163.com with Claude Code
// @match        https://zhuanlan.zhihu.com/p/*
// @match        https://www.zhihu.com/question/*/answer/*
// @match        https://www.zhihu.com/question/*
// @grant        none
// @run-at       document-end
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    function formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    function getIPFromDOM(item) {
        // 从DOM中提取IP属地
        const timeEl = item.querySelector('.ContentItem-time');
        if (!timeEl) return null;

        const text = timeEl.textContent;
        const match = text.match(/[・·](.+?)$/);
        return match ? match[1].trim() : null;
    }

    function parseTimeFromDOM(item) {
        // 从 DOM 中提取时间和IP属地（备用方案）
        const timeEl = item.querySelector('[data-tooltip*="编辑于"], [data-tooltip*="发布于"], .ContentItem-time');
        if (!timeEl) return null;

        const text = timeEl.textContent;
        const match = text.match(/(发布于|编辑于)\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})(?:・(.+?))?$/);
        if (!match) return null;

        const timeStr = match[2];
        const timestamp = Math.floor(new Date(timeStr).getTime() / 1000);
        const isEdited = match[1] === '编辑于';
        const ipLocation = match[3] || null;

        return {
            created: isEdited ? null : timestamp,
            updated: timestamp,
            ipInfo: ipLocation
        };
    }

    function getArticleData() {
        console.log('[知乎增强] 开始获取文章数据...');
        const scripts = document.querySelectorAll('script:not([src])');
        console.log('[知乎增强] 找到内联script标签数量:', scripts.length);

        for (let i = 0; i < scripts.length; i++) {
            const s = scripts[i];
            if (!s.textContent.includes('"entities"')) continue;
            console.log('[知乎增强] 找到包含entities的script标签，索引:', i);

            try {
                const data = JSON.parse(s.textContent);
                console.log('[知乎增强] JSON解析成功');
                const entities = data?.initialState?.entities;

                // 尝试获取文章数据（专栏页面）
                const articles = entities?.articles;
                if (articles && Object.keys(articles).length > 0) {
                    const articleId = Object.keys(articles)[0];
                    const article = articles[articleId];
                    console.log('[知乎增强] 文章ID:', articleId);
                    console.log('[知乎增强] 文章数据:', article);
                    console.log('[知乎增强] created:', article.created, 'updated:', article.updated);

                    if (article && article.created) {
                        const result = { created: article.created, updated: article.updated || article.created };
                        console.log('[知乎增强] ✓ 成功获取文章时间数据:', result);
                        return result;
                    }
                }

                // 尝试获取回答数据（回答页面）
                const answers = entities?.answers;
                if (answers && Object.keys(answers).length > 0) {
                    console.log('[知乎增强] 找到answers实体，返回整个对象供后续查询');
                    return { type: 'answers', data: answers };
                }
            } catch (e) {
                console.error('[知乎增强] JSON解析失败:', e);
            }
        }
        console.warn('[知乎增强] ✗ 未找到文章数据');
        return null;
    }

    function findAnchorEl() {
        console.log('[知乎增强] 查找锚点元素...');
        const el = document.querySelector('.Post-Author') || document.querySelector('.AuthorInfo');
        if (el) {
            console.log('[知乎增强] ✓ 找到锚点元素:', el.className);
        } else {
            console.warn('[知乎增强] ✗ 未找到锚点元素');
        }
        return el;
    }

    function insertTimeInfo() {
        console.log('[知乎增强] insertTimeInfo 被调用');

        const data = getArticleData();
        if (!data) {
            console.warn('[知乎增强] ✗ 无时间数据，终止插入');
            return;
        }

        // 处理专栏文章（单个数据对象）
        if (data.created) {
            if (document.getElementById('zhihu-time-info')) {
                console.log('[知乎增强] 时间栏已存在，跳过');
                return;
            }

            const anchorEl = findAnchorEl();
            if (!anchorEl) {
                console.warn('[知乎增强] ✗ 无锚点元素，终止插入');
                return;
            }

            data.ipInfo = getIPFromDOM(document);
            const bar = createTimeBar(data);
            anchorEl.parentNode.insertBefore(bar, anchorEl.nextSibling);
            console.log('[知乎增强] ✓ 时间栏插入成功:', bar.textContent);
            return;
        }

        // 处理回答页面（从DOM中提取回答ID）
        if (data.type === 'answers') {
            const answersData = data.data;
            console.log('[知乎增强] 处理回答页面');

            // 找到所有回答容器
            const answerItems = document.querySelectorAll('[data-za-detail-view-path-module="AnswerItem"]');
            console.log('[知乎增强] 找到回答容器数量:', answerItems.length);

            answerItems.forEach((item, index) => {
                const timeBarId = `zhihu-time-info-${index}`;
                if (document.getElementById(timeBarId)) return;

                // 从 data-za-extra-module 提取回答ID
                const extraModule = item.getAttribute('data-za-extra-module');
                if (!extraModule) return;

                try {
                    const moduleData = JSON.parse(extraModule);
                    const answerId = moduleData?.card?.content?.token;
                    if (!answerId) return;

                    console.log('[知乎增强] 回答#' + index + ' ID:', answerId);

                    let timeData = null;

                    // 从 entities.answers 中查找时间数据
                    const answer = answersData[answerId];
                    if (answer && answer.createdTime) {
                        timeData = {
                            created: answer.createdTime,
                            updated: answer.updatedTime || answer.createdTime,
                            ipInfo: getIPFromDOM(item)
                        };
                        console.log('[知乎增强] 从entities获取时间数据, IP:', timeData.ipInfo);
                    } else {
                        // 备用方案：从 DOM 中提取时间
                        timeData = parseTimeFromDOM(item);
                        if (timeData) {
                            console.log('[知乎增强] 从DOM获取时间数据');
                        }
                    }

                    if (timeData) {
                        const authorEl = item.querySelector('.AuthorInfo');
                        if (authorEl) {
                            const bar = createTimeBar(timeData, timeBarId);
                            authorEl.parentNode.insertBefore(bar, authorEl.nextSibling);
                            console.log('[知乎增强] ✓ 回答时间栏插入成功 #' + index + ':', bar.textContent);
                        }
                    } else {
                        console.warn('[知乎增强] 回答#' + index + ' 未找到时间数据');
                    }
                } catch (e) {
                    console.error('[知乎增强] 解析回答#' + index + ' 失败:', e);
                }
            });
        }
    }

    function createTimeBar(data, id = 'zhihu-time-info') {
        const bar = document.createElement('div');
        bar.id = id;
        bar.style.cssText = 'font-size:13px;color:#8590a6;padding:8px 0 10px;border-bottom:1px solid #f0f2f7;margin-bottom:14px;line-height:1.6;';

        const ip = data.ipInfo ? `　　IP属地：${data.ipInfo}` : '';
        let text = '';
        if (data.created) {
            text = `创建时间：${formatTime(data.created)}`;
            if (data.updated && data.updated !== data.created) {
                text += `　　最新编辑时间：${formatTime(data.updated)}`;
            } else {
                text += `　　最新编辑时间：${formatTime(data.created)}`;
            }
        } else if (data.updated) {
            // 只有更新时间（从DOM提取的"编辑于"）
            text = `最新编辑时间：${formatTime(data.updated)}`;
        }
        text += ip;

        bar.textContent = text;
        return bar;
    }

    function init() {
        console.log('[知乎增强] 脚本初始化，readyState:', document.readyState);
        insertTimeInfo();

        let attempts = 0;
        const observer = new MutationObserver(() => {
            // 检查是否还有未插入时间栏的回答
            const answerItems = document.querySelectorAll('[data-za-detail-view-path-module="AnswerItem"]');
            let hasUninserted = false;

            answerItems.forEach((_, index) => {
                if (!document.getElementById(`zhihu-time-info-${index}`)) {
                    hasUninserted = true;
                }
            });

            // 专栏页面检查
            if (!document.getElementById('zhihu-time-info') && document.querySelector('.Post-Author, .AuthorInfo')) {
                hasUninserted = true;
            }

            if (!hasUninserted) return;

            attempts++;
            if (attempts <= 5) console.log('[知乎增强] MutationObserver 触发，第', attempts, '次重试');
            insertTimeInfo();
            if (attempts > 100) {
                console.warn('[知乎增强] 超过最大重试次数，停止监听');
                observer.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        console.log('[知乎增强] MutationObserver 已启动');
    }

    init();

})();
