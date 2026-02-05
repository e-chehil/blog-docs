(function () {
    'use strict';

    /**
     * AcctJournal Refactor (基于 v9)
     *
     * 遵照你的重构蓝图实现:
     * 1. 架构分离 (Parser / Renderer / Host)
     * 2. 移除 new Function()，使用 math.js + decimal.js 保证安全和精度
     * 3. 移除字符串拼接，使用 lit-html 模板引擎
     * 4. 移除 resize 监听，使用纯 CSS 媒体查询实现响应式
     * 5. 移除点击切换，使用 Tippy.js 实现 Tooltip
     * 6. 异步按需加载所有依赖
     */

    // --- 1. 配置与依赖 (按需加载) ---

    // 【V10 修复】: 将 CDN 从 unpkg 切换到 esm.sh / jsdelivr 提高加载稳定性
    const DEPS = {
        // 模板引擎
        lit: 'https://esm.sh/lit-html',
        // 高精度计算
        decimal: 'https://esm.sh/decimal.js@10.4.3',
        // 安全的表达式解析
        mathjs: 'https://esm.sh/mathjs@13.0.0',
        // Tooltip
        tippy: 'https://esm.sh/tippy.js@6',
        tippyCSS: 'https://cdn.jsdelivr.net/npm/tippy.js@6/dist/tippy.css'
    };

    // 依赖项将在加载后被填充
    let lit, Decimal, math, tippy;
    const EPSILON = 0.001; // 平衡检查阈值

    // --- 2. 核心类：解析器 (I-1, II-2) ---

    /**
     * 解析器 (Parser)
     * 职责：将纯文本转换为 AST (抽象语法树) 和计算总额。
     * 使用 decimal.js (Decimal) 和 math.js (math)
     */
    class AcctParser {
        constructor(precision = 64) {
            this.Decimal = Decimal; // 注入依赖
            this.math = math;       // 注入依赖

            // 配置 math.js 使用 BigNumber 以保证精度
            this.math.config({
                number: 'BigNumber',
                precision: precision
            });
            this.mathParser = this.math.parser();
        }

        /**
         * 安全地评估金额表达式
         * @param {string} amountStr - 类似 "1000 * 5" 或 "1,200.50"
         * @returns {{result: Decimal | null, original: string, isFormula: boolean}}
         */
        evaluateAmount(amountStr) {
            let original = amountStr;
            let cleanExpr = amountStr.replace(/,/g, ''); // 移除千位分隔符

            // 1. 检查是否为简单数字
            if (/^(\d+(\.\d*)?|\.\d+)$/.test(cleanExpr)) {
                try {
                    return { result: new this.Decimal(cleanExpr), original: original, isFormula: false };
                } catch (e) {
                    return { result: null, original: original, isFormula: false };
                }
            }

            // 2. 不是简单数字，尝试使用 math.js 解析
            try {
                // 使用 math.js 解析
                const result = this.mathParser.evaluate(cleanExpr);
                // 将 math.js 的 BigNumber 转换为 decimal.js 的 Decimal
                const decimalResult = new this.Decimal(result.toString());

                if (decimalResult.isNaN()) {
                    return { result: null, original: original, isFormula: true };
                }
                return { result: decimalResult, original: original, isFormula: true };
            } catch (e) {
                // Math.js 解析失败 (例如: "银行存款 1000")
                return { result: null, original: original, isFormula: true };
            }
        }

        /**
         * 解析完整的日记账文本
         * @param {string} text - 整个代码块的文本
         * @returns {object} - 包含 AST (entries) 和总计的
         */
        parse(text) {
            const lines = text.split('\n');
            const entries = [];
            let totalDebit = new this.Decimal(0);
            let totalCredit = new this.Decimal(0);
            let currentType = null;
            let currentLevel1Account = '';

            // 正则表达式定义 (更严格)
            const debitRegex = /^借：(.*)/;
            const creditRegex = /^贷：(.*)/;
            const continuationRegex = /^——(.*)/;
            const commentRegex = /^#(.*)/;

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (line === '') continue; // 跳过空行

                // 1. 处理整行注释
                let commentMatch = line.match(commentRegex);
                if (commentMatch) {
                    entries.push({ type: 'comment', content: commentMatch[1].trim() });
                    continue;
                }

                // 2. 分离行内注释
                let parts = line.split('#');
                let lineContent = parts[0].trim();
                let lineComment = parts.slice(1).join('#').trim() || null;

                if (lineContent === '') continue; // 跳过只有行内注释的空行

                let entry = {
                    type: null,
                    account: '',
                    comment: lineComment,
                    originalAmount: '',
                    isFormula: false,
                    amount: null, // 将存储 Decimal 对象
                };

                let prefix = '';
                let content = '';

                // 3. 确定行类型 (借/贷/——)
                if (debitRegex.test(lineContent)) {
                    currentType = 'debit';
                    content = lineContent.match(debitRegex)[1].trim();
                } else if (creditRegex.test(lineContent)) {
                    currentType = 'credit';
                    content = lineContent.match(creditRegex)[1].trim();
                } else if (continuationRegex.test(lineContent)) {
                    content = lineContent.match(continuationRegex)[1].trim();
                    prefix = '——';
                } else {
                    // 如果没有前缀，则假定延续上一类型
                    content = lineContent;
                }

                if (!currentType) continue; // 跳过所有在第一个 "借：" 或 "贷：" 之前的行
                entry.type = currentType;

                // 4. 解析 "账户 金额/算式"
                // (复用 V9 的稳健逻辑，但使用新的 evaluateAmount)
                let evalResult = { result: null, original: '', isFormula: false };
                const lineParts = content.split(/\s+/); // 按空白符分割
                let bestMatch = { result: null, original: '', isFormula: false, index: -1 };

                // 从后往前查找最长的有效算式
                for (let i = lineParts.length - 1; i >= 0; i--) {
                    let potentialAmount = lineParts.slice(i).join(' ');
                    let tempEval = this.evaluateAmount(potentialAmount);

                    if (tempEval.result !== null) {
                        bestMatch = { ...tempEval, index: i };
                    }
                }

                let accountPart;
                if (bestMatch.index !== -1) {
                    // 找到了金额
                    evalResult = bestMatch;
                    entry.amount = bestMatch.result; // 存储 Decimal 对象
                    accountPart = lineParts.slice(0, bestMatch.index).join(' ');
                } else {
                    // 没找到金额
                    accountPart = content;
                    entry.amount = null;
                }

                entry.originalAmount = evalResult.original;
                entry.isFormula = evalResult.isFormula;

                // 5. 处理账户层级
                if (prefix === '——') {
                    accountPart = `${currentLevel1Account}——${accountPart}`;
                } else if (accountPart.trim() !== '') {
                    // 更新一级账户
                    const match = accountPart.match(/^(.*?)\s*——\s*/);
                    currentLevel1Account = match ? match[1].trim() : accountPart.trim();
                }
                entry.account = accountPart;

                // 6. 累加总计
                if (entry.amount) {
                    if (entry.type === 'debit') {
                        totalDebit = totalDebit.plus(entry.amount);
                    } else if (entry.type === 'credit') {
                        totalCredit = totalCredit.plus(entry.amount);
                    }
                }
                entries.push(entry);
            }

            // 7. 计算差额
            const difference = totalDebit.minus(totalCredit);
            const isBalanced = difference.abs().lt(EPSILON);

            return {
                entries,
                totalDebit, // Decimal
                totalCredit, // Decimal
                difference, // Decimal
                isBalanced,
            };
        }
    }

    // --- 3. 核心类：渲染器 (I-1, III-1, III-2, III-3, III-4) ---

    /**
     * 渲染器 (Renderer)
     * 职责：接收 AST，使用 lit-html 渲染为 DOM，并初始化 Tippy.js。
     */
    class AcctRenderer {
        constructor(dependencies) {
            this.html = dependencies.lit.html;
            this.render = dependencies.lit.render;
            this.tippy = dependencies.tippy;
            this.locale = undefined; // (II-3) 使用浏览器默认 locale
        }

        /**
         * 格式化 Decimal 金额
         * @param {Decimal} decimalAmount
         * @returns {{plain: string, html: object, value: string}}
         */
        formatAmount(decimalAmount) {
            if (!decimalAmount) {
                return { plain: '', html: this.html``, value: '' };
            }
            // toLocaleString 需要 number 类型
            const num = decimalAmount.toNumber();
            const plain = num.toLocaleString(this.locale, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            // data-value 使用标准格式
            const value = decimalAmount.toFixed(2);

            // 复用原脚本的 ".00" 隐藏逻辑
            if (decimalAmount.isInteger()) {
                const intPart = num.toLocaleString(this.locale, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                });
                const decPart = plain.substring(plain.lastIndexOf('.'));
                return {
                    plain,
                    value,
                    html: this.html`${intPart}<span class="decimal-part" style="visibility: hidden;">${decPart}</span>`
                };
            } else {
                // (III-4) 修复了 V9 的 .00 渲染 bug，现在可以正确显示
                const parts = plain.match(/^(.*?)(\.([0-9]{2}))$/);
                if (parts) {
                    return {
                        plain,
                        value,
                        html: this.html`${parts[1]}<span class="decimal-part">${parts[2]}</span>`
                    };
                }
                return { plain, value, html: this.html`${plain}` };
            }
        }

        /**
         * 渲染主表格
         * @param {object} ast - 解析器返回的 AST
         * @param {HTMLElement} container - 目标容器
         */
        renderJournal(ast, container) {
            const { entries, totalDebit, totalCredit, difference, isBalanced } = ast;
            const totalDebitFmt = this.formatAmount(totalDebit);
            const totalCreditFmt = this.formatAmount(totalCredit);
            const differenceFmt = this.formatAmount(difference.abs());

            // (III-1) lit-html 模板
            // (III-2) 响应式：同时包含 desktop-only 和 mobile-only 元素，由 CSS 控制
            // (III-4) 无障碍：添加 <caption>, scope, data-value
            const template = this.html`
                <table class="acct-journal-table">
                    <caption class="acct-journal-caption">会计分录 (Journal)</caption>
                    <thead>
                        <tr>
                            <th scope="col" class="acct-col-account">账户</th>
                            <th scope="col" class="acct-col-debit desktop-only">借方</th>
                            <th scope="col" class="acct-col-credit desktop-only">贷方</th>
                            <th scope="col" class="acct-col-amount mobile-only">金额</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entries.map(entry => this.renderEntryRow(entry))}
                    </tbody>
                    <tfoot>
                        <!-- 桌面合计 -->
                        <tr class="total-row desktop-only">
                            <td scope="row"><strong>合计 (Total)</strong></td>
                            <td class="amount" data-value="${totalDebitFmt.value}">${totalDebitFmt.html}</td>
                            <td class="amount" data-value="${totalCreditFmt.value}">${totalCreditFmt.html}</td>
                        </tr>
                        <!-- 移动端合计 -->
                        <tr class="total-row mobile-only">
                            <td scope="row" class="total-label-mobile"><strong>合计 (Total)</strong></td>
                            <td class="total-placeholder-mobile"></td>
                        </tr>
                        <tr class="total-row-debit mobile-only">
                            <td scope="row" class="total-label-mobile">借方合计</td>
                            <td class="amount amount-debit-mobile" data-value="${totalDebitFmt.value}">${totalDebitFmt.html}</td>
                        </tr>
                        <tr class="total-row-credit mobile-only">
                            <td scope="row" class="total-label-mobile">贷方合计</td>
                            <td class="amount amount-credit-mobile" data-value="${totalCreditFmt.value}">${totalCreditFmt.html}</td>
                        </tr>
                        
                        <!-- 差额 (通用) -->
                        ${!isBalanced ? this.html`
                            <tr class="balance-row">
                                <td colspan="4" class="balance-error">
                                    分录未配平 (Unbalanced) - 差额: ${differenceFmt.html}
                                </td>
                            </tr>
                        ` : ''}
                    </tfoot>
                </table>
            `;
            // 渲染到 DOM
            this.render(template, container);

            // (III-3) 渲染后初始化 Tooltips
            this.initTooltips(container);
        }

        /**
         * 渲染单行条目
         * @param {object} entry - AST 中的单个条目
         */
        renderEntryRow(entry) {
            if (entry.type === 'comment') {
                return this.html`
                    <tr class="full-comment-row">
                        <td colspan="4" class="full-comment-cell"># ${entry.content}</td>
                    </tr>`;
            }
            if (!entry.type) return this.html``; // 跳过无效行

            const hasComment = entry.comment && entry.comment.trim() !== '';
            const amtFmt = this.formatAmount(entry.amount);
            const isDebit = entry.type === 'debit';
            // (III-3) 为 Tippy 准备算式数据
            const formulaTooltip = entry.isFormula ? entry.originalAmount : null;
            const accountClass = isDebit ? 'account-debit' : 'account-credit';
            const amountClass = isDebit ? 'amount-debit-mobile' : 'amount-credit-mobile';

            return this.html`
                <tr class="entry-row ${hasComment ? 'has-comment' : ''}">
                    <td class="account ${accountClass}" data-account-name="${entry.account}">
                        ${entry.account}
                    </td>
                    
                    <!-- 桌面列 -->
                    <td class="amount desktop-only ${isDebit ? '' : 'empty-cell'}"
                        data-value="${isDebit ? amtFmt.value : ''}"
                        data-formula="${isDebit ? formulaTooltip : ''}">
                        ${isDebit ? amtFmt.html : ''}
                    </td>
                    <td class="amount desktop-only ${!isDebit ? '' : 'empty-cell'}"
                        data-value="${!isDebit ? amtFmt.value : ''}"
                        data-formula="${!isDebit ? formulaTooltip : ''}">
                        ${!isDebit ? amtFmt.html : ''}
                    </td>

                    <!-- 移动端列 -->
                    <td class="amount mobile-only ${amountClass}"
                        data-value="${amtFmt.value}"
                        data-formula="${formulaTooltip}">
                        ${amtFmt.html}
                    </td>
                </tr>
                ${hasComment ? this.html`
                    <tr class="comment-row">
                        <td colspan="4" class="comment-cell comment-cell-${entry.type}">
                            ↳ ${entry.comment}
                        </td>
                    </tr>
                ` : ''}
            `;
        }

        /**
         * (III-3) 初始化 Tippy.js Tooltips
         */
        initTooltips(container) {
            const cells = container.querySelectorAll('td[data-formula]');
            cells.forEach(cell => {
                const formula = cell.dataset.formula;
                // 仅为非空的 data-formula 属性添加 tooltip
                if (formula) {
                    this.tippy(cell, {
                        content: `算式: <code>${formula}</code>`,
                        allowHTML: true,
                        placement: 'top',
                        arrow: true,
                        theme: 'light-border', // 一个常见主题
                    });
                }
            });
        }
    }

    // --- 4. 宿主适配层 (Host Adapter) (I-1, IV-3) ---

    let parserInstance;
    let rendererInstance;
    let isInitialized = false;
    let isLoading = false;

    /**
     * (IV-3) 异步加载所有依赖
     * 仅在第一次需要渲染时执行
     */
    async function loadDependencies() {
        if (isInitialized) return true;
        if (isLoading) return false; // 防止重复加载
        isLoading = true;

        try {
            // 1. 加载 CSS
            const tippyLink = document.createElement('link');
            tippyLink.rel = 'stylesheet';
            tippyLink.href = DEPS.tippyCSS;
            document.head.appendChild(tippyLink);

            // 2. 加载 CSS (III-2)
            // 注入响应式布局所需的 CSS
            const style = document.createElement('style');
            style.textContent = `
                /* --- AcctJournal Refactored Styles --- */
                .acct-journal-wrapper {
                    overflow-x: auto;
                    margin: 1.5em 0;
                    border: 1px solid #e0e0e0;
                    border-radius: 6px;
                }
                .acct-journal-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.9rem;
                    line-height: 1.6;
                }
                .acct-journal-caption {
                    font-weight: 600;
                    padding: 0.75em 1em;
                    text-align: left;
                    background-color: #f7f7f7;
                    border-bottom: 1px solid #e0e0e0;
                    border-radius: 6px 6px 0 0;
                }
                .acct-journal-table th, .acct-journal-table td {
                    padding: 0.6em 0.8em;
                    border-bottom: 1px solid #f0f0f0;
                }
                .acct-journal-table th {
                    text-align: left;
                    background-color: #fcfcfc;
                    font-weight: 600;
                }
                .acct-journal-table tbody tr:last-child td {
                    border-bottom: 1px solid #e0e0e0;
                }
                .acct-journal-table tfoot td {
                    border-bottom: none;
                    font-weight: 600;
                }
                .acct-journal-table .account { padding-left: 0.8em; }
                .acct-journal-table .account-debit { }
                .acct-journal-table .account-credit { padding-left: 2.5em; }
                
                .acct-journal-table .amount {
                    text-align: right;
                    font-family: Consolas, monospace;
                    white-space: nowrap;
                }
                .acct-journal-table .decimal-part { color: #888; }
                .acct-journal-table td[data-formula] {
                    cursor: help;
                    border-bottom-style: dashed;
                    border-bottom-width: 1px;
                }

                .acct-col-account { width: 60%; }
                .acct-col-debit, .acct-col-credit { width: 20%; }
                
                .full-comment-row td {
                    color: #555;
                    font-style: italic;
                    background: #fdfdfd;
                    padding-left: 1.5em;
                }
                .comment-row td {
                    color: #777;
                    font-size: 0.9em;
                    padding-top: 0;
                    padding-bottom: 0.6em;
                    border-bottom-width: 0;
                }
                .comment-cell-credit { padding-left: 3.5em; }
                
                .total-row td, .total-row-debit td, .total-row-credit td {
                    background-color: #f7f7f7;
                    border-top: 2px solid #e0e0e0;
                }
                .balance-row td {
                    background-color: #fff8f8;
                    color: #d00;
                    text-align: center;
                }
                .acct-error {
                    padding: 1em;
                    color: #d00;
                    background: #fff8f8;
                }

                /* --- (III-2) 响应式布局 --- */
                .desktop-only { display: table-cell; }
                .mobile-only { display: none; }

                @media (max-width: 768px) {
                    .desktop-only { display: none; }
                    .mobile-only { display: table-cell; }
                    
                    .acct-journal-table th.acct-col-account,
                    .acct-journal-table td.account {
                        width: 60%;
                    }
                    .acct-journal-table th.acct-col-amount,
                    .acct-journal-table td.amount {
                         width: 40%;
                    }
                    .acct-journal-table .account-credit {
                        padding-left: 1.5em; /* 移动端减少缩进 */
                    }
                    .comment-cell-credit { padding-left: 2.5em; }

                    .total-label-mobile { text-align: left; }
                    .total-placeholder-mobile { display: none; }
                    .amount-debit-mobile { color: #333; }
                    .amount-credit-mobile { color: #333; }
                }
            `;
            document.head.appendChild(style);

            // 3. 异步加载 JS 模块
            const [litModule, decimalModule, mathModule, tippyModule] = await Promise.all([
                import(DEPS.lit),
                import(DEPS.decimal),
                import(DEPS.mathjs),
                import(DEPS.tippy)
            ]);

            lit = litModule;
            // 【V10 修复】: esm.sh 将 decimal.js 包装为 default export
            Decimal = decimalModule.default;
            // math = mathModule; // <-- 【V11 修复】旧的错误代码
            tippy = tippyModule.default; // Tippy 是 default export

            // 【V11 修复】: 遵照 math.js 错误提示，创建本地实例
            // 从导入的模块中解构 create 和 all
            const { create, all } = mathModule;
            // 创建一个新的、可配置的 mathjs 实例
            math = create(all); // 将新实例赋给 IIFE 作用域的 'math' 变量

            // 4. 初始化实例
            // AcctParser 构造函数现在将使用上面创建的可配置 'math' 实例
            parserInstance = new AcctParser();
            rendererInstance = new AcctRenderer({ lit, tippy });

            isInitialized = true;
            isLoading = false;
            console.log("AcctJournal: Dependencies loaded and initialized.");
            return true;

        } catch (err) {
            console.error("AcctJournal: 关键依赖加载失败 (Failed to load dependencies).", err);
            isLoading = false;
            return false;
        }
    }

    /**
     * 主处理函数
     * 查找所有未处理的代码块并渲染它们
     */
    async function processAcctJournalBlocks() {
        // 查找尚未处理的块
        const preElements = document.querySelectorAll('pre.acct-journal-render:not([data-acct-processed])');
        if (preElements.length === 0) {
            return; // 页面上没有需要处理的块
        }

        // 首次发现，加载依赖
        const success = await loadDependencies();
        if (!success) {
            console.error("AcctJournal: 因依赖加载失败，渲染中止。");
            return;
        }

        preElements.forEach(preEl => {
            const codeEl = preEl.querySelector('code');
            if (!codeEl) return;

            // 标记为已处理，防止重复渲染
            preEl.dataset.acctProcessed = 'true';

            const inputText = codeEl.textContent;

            const outputWrapper = document.createElement('div');
            outputWrapper.className = 'acct-journal-wrapper';

            try {
                // 1. 解析
                const ast = parserInstance.parse(inputText);
                // 2. 渲染
                rendererInstance.renderJournal(ast, outputWrapper);
                // 3. 替换
                preEl.parentElement.replaceChild(outputWrapper, preEl);
            } catch (err) {
                console.error("AcctJournal: 渲染失败 (Failed to parse or render).", err);
                outputWrapper.innerHTML = `<p class="acct-error">渲染会计分录时出错: ${err.message}</p>`;
                preEl.parentElement.replaceChild(outputWrapper, preEl);
            }
        });
    }

    // --- 5. 启动与事件监听 ---

    // 1. 页面加载时
    document.addEventListener('DOMContentLoaded', processAcctJournalBlocks);

    // 2. 窗口大小改变 (III-2)
    // (已移除) - 不再需要，CSS 媒体查询万岁！
    // window.addEventListener('resize', reRenderAcctJournalBlocks);

    // 3. 全局点击事件 (III-3)
    // (已移除) - 不再需要，Tippy.js 万岁！
    // document.body.addEventListener('click', ...);

    // 4. 适配 mkdocs-material 的 "instant loading" (I-1)
    if (window.document$) {
        window.document$.subscribe(processAcctJournalBlocks);
    }
    else if (window.MutationObserver) {
        // 回退到 MutationObserver 适配其他 PJAX 页面
        const observer = new MutationObserver(mutations => {
            if (mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0)) {
                // 使用 setTimeout 来防抖，应对快速的 DOM 变化
                setTimeout(processAcctJournalBlocks, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

})();


