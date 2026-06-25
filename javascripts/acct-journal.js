(function () {
    // --- 辅助函数 ---
    // 格式化金额，返回纯文本和 HTML 版本
    function formatAmount(amountNum) {
        if (typeof amountNum !== 'number' || isNaN(amountNum)) {
            return { plain: 'N/A', html: 'N/A' };
        }
        const plainFormatted = amountNum.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        let html;
        if (Number.isInteger(amountNum)) {
            const integerPart = amountNum.toLocaleString('en-US', {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
            const decimalPart = plainFormatted.substring(plainFormatted.lastIndexOf('.'));
            html = `${integerPart}<span class="decimal-part" style="visibility: hidden;">${decimalPart}</span>`;
        } else {
            const parts = plainFormatted.match(/^(.*?)\.([0-9]{2})$/);
            if (parts) {
                html = `${parts[1]}<span class="decimal-part">.${parts[2]}</span>`;
            } else {
                html = plainFormatted;
            }
        }
        return { plain: plainFormatted, html: html };
    }

    function getLevel1Account(accountPart) {
        const plainTextAccount = accountPart.replace(/<[^>]*>/g, '');
        const match = plainTextAccount.match(/^(.*?)\s*——\s*/);
        return match ? match[1].trim() : plainTextAccount.trim();
    }

    function evaluateAmount(amountStr) {
        let original = amountStr;
        let cleanExpr = amountStr.replace(/,/g, '');
        if (/^(\d+(\.\d*)?|\.\d+)$/.test(cleanExpr)) {
            return { result: parseFloat(cleanExpr), original: original, isFormula: false };
        }
        cleanExpr = cleanExpr.replace(/(\d+(\.\d+)?)%/g, '($1/100)').replace(/\^/g, '**');
        const safeMathRegex = /^[\d\s+\-*/().eE*]+$/;
        if (!safeMathRegex.test(cleanExpr)) {
            return { result: NaN, original: original, isFormula: false };
        }
        try {
            let result = new Function('return ' + cleanExpr)();
            if (typeof result === 'number' && !isNaN(result)) {
                return { result: result, original: original, isFormula: true };
            }
        } catch (e) { }
        return { result: NaN, original: original, isFormula: false };
    }

    function escapeHTML(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function isMobile() {
        return window.innerWidth <= 768;
    }

    // --- renderTable 函数 (已修复) ---
    function renderTable(entries, container, totalDebit, totalCredit, isBalanced) {
        if (entries.length === 0) {
            container.innerHTML = '<p style="padding: 15px; color: #888; text-align: center;">暂无内容</p>';
            return;
        }
        const mobile = isMobile();

        // ⬇️ 【V9 关键修复】 在这里添加 class！
        let table = '<table class="acct-journal-table">';

        if (mobile) {
            table += '<thead><tr><th>账户</th><th>金额</th></tr></thead>';
        } else {
            table += '<thead><tr><th>账户</th><th>借方</th><th>贷方</th></tr></thead>';
        }

        table += '<tbody>';
        for (const entry of entries) {
            if (entry.type === 'comment') {
                table += `<tr class="full-comment-row"><td colspan="${mobile ? '2' : '3'}" class="full-comment-cell"># ${entry.account}</td></tr>`;
                continue;
            }
            if (entry.type === null && entry.account === '' && entry.amountPlain === '') {
                continue;
            }
            if (entry.type === null) {
                continue;
            }
            const hasComment = entry.comment && entry.comment.trim() !== '';
            const escapedFormula = escapeHTML(entry.originalAmount);
            let amountCell = '';
            if (entry.isFormula) {
                const amountClass = mobile ? (entry.type === 'debit' ? 'amount-debit-mobile' : 'amount-credit-mobile') : 'amount';
                amountCell = `<td class="${amountClass} amount-formula" 
                          data-formula="${escapedFormula}" 
                          data-result="${entry.amountPlain}" 
                          data-state="result" 
                          title="点击查看算式: ${escapedFormula}">
                          ${entry.amountFormatted}
                      </td>`;
            } else {
                const amountClass = mobile ? (entry.type === 'debit' ? 'amount-debit-mobile' : 'amount-credit-mobile') : 'amount';
                amountCell = `<td class="${amountClass}">${entry.amountFormatted}</td>`;
            }
            table += `<tr class="${hasComment ? 'has-comment' : ''}">`;
            if (mobile) {
                if (entry.type === 'debit') {
                    table += `<td class="account-debit">${entry.account}</td>`;
                    table += amountCell;
                } else if (entry.type === 'credit') {
                    table += `<td class="account-credit">${entry.account}</td>`;
                    table += amountCell;
                }
            } else {
                if (entry.type === 'debit') {
                    table += `<td class="account-debit">${entry.account}</td>`;
                    table += amountCell;
                    table += `<td class="mobile-hide"></td>`;
                } else if (entry.type === 'credit') {
                    table += `<td class="account-credit">${entry.account}</td>`;
                    table += `<td class="mobile-hide"></td>`;
                    table += amountCell;
                }
            }
            table += '</tr>';
            if (hasComment) {
                let commentCellClass = entry.type === 'credit' ? 'comment-cell-credit' : 'comment-cell-debit';
                table += '<tr class="comment-row">';
                table += `<td colspan="${mobile ? '2' : '3'}" class="comment-cell ${commentCellClass}">↳ ${entry.comment}</td>`;
                table += '</tr>';
            }
        }
        table += '</tbody>';
        table += '<tfoot>';
        if (mobile) {
            table += '<tr class="total-row">';
            table += `<td colspan="2" class="total-label-mobile"><strong>合计 (Total)</strong></td>`;
            table += '</tr>';
            table += '<tr class="total-row">';
            table += `<td class="total-debit-mobile">借方合计</td>`;
            table += `<td class="amount-debit-mobile">${formatAmount(totalDebit).html}</td>`;
            table += '</tr>';
            table += '<tr class="total-row">';
            table += `<td class="total-credit-mobile">贷方合计</td>`;
            table += `<td class="amount-credit-mobile">${formatAmount(totalCredit).html}</td>`;
            table += '</tr>';
        } else {
            table += '<tr class="total-row">';
            table += `<td><strong>合计 (Total)</strong></td>`;
            table += `<td class="amount">${formatAmount(totalDebit).html}</td>`;
            table += `<td class="amount mobile-hide">${formatAmount(totalCredit).html}</td>`;
            table += '</tr>';
        }
        if (!isBalanced) {
            let difference = Math.abs(totalDebit - totalCredit);
            table += '<tr class="balance-row">';
            table += `<td colspan="${mobile ? '2' : '3'}" class="balance-error">分录未配平 (Unbalanced) - 差额: ${formatAmount(difference).html}</td>`;
            table += '</tr>';
        }
        table += '</tfoot></table>';
        container.innerHTML = table;
    }

    // --- 【V9 关键修复】: 这是 V8 的正确解析逻辑 ---
    function parseAndRender(inputText, outputDiv) {
        let totalDebit = 0,
            totalCredit = 0;
        const lines = inputText.split('\n');
        let journalEntries = [];
        let currentType = null,
            currentLevel1Account = '';

        for (const rawLine of lines) {
            let parts = rawLine.split('#');
            let processedLine = parts[0].trim();
            let comment = parts.slice(1).join('#').trim() || null;

            if (processedLine === '' && comment) {
                journalEntries.push({ type: 'comment', account: comment });
                continue;
            } else if (processedLine === '') {
                continue;
            }

            let entry = {
                type: null,
                account: '',
                comment: comment,
                originalAmount: '',
                isFormula: false,
                amountFormatted: '',
                amountPlain: ''
            };
            let accountPart = '', amountNum = NaN;
            let prefix = '', lineContent = '';

            if (processedLine.startsWith('借：')) {
                currentType = 'debit';
                prefix = '借：';
                lineContent = processedLine.substring(2).trim();
            } else if (processedLine.startsWith('贷：')) {
                currentType = 'credit';
                prefix = '贷：';
                lineContent = processedLine.substring(2).trim();
            } else if (processedLine.startsWith('——')) {
                prefix = '——';
                lineContent = processedLine.substring(2).trim();
            } else {
                prefix = '';
                lineContent = processedLine.trim();
            }

            if (lineContent === '') {
                continue;
            }

            // --- 【V8/V9 修复开始】: 正确的解析逻辑 ---
            let evalResult = { result: NaN, original: '', isFormula: false };
            const lineParts = lineContent.split(' '); // e.g., ["银行存款", "1000", "*", "5"]
            let bestMatch = { result: NaN, original: '', isFormula: false, index: -1 };

            // 从后往前迭代，找到最长的、有效的数学表达式
            // "银行存款 1000 * 5"
            // 1. 尝试 "5" (i=3) -> 成功, result=5. 存储.
            // 2. 尝试 "* 5" (i=2) -> 失败, NaN.
            // 3. 尝试 "1000 * 5" (i=1) -> 成功, result=5000. 存储 (覆盖 "5").
            // 4. 尝试 "银行存款 1000 * 5" (i=0) -> 失败, NaN.
            for (let i = lineParts.length - 1; i >= 0; i--) {
                let potentialAmount = lineParts.slice(i).join(' ');
                let tempEval = evaluateAmount(potentialAmount);

                if (!isNaN(tempEval.result)) {
                    // 这是一个有效的算式。保存它
                    bestMatch = tempEval;
                    bestMatch.index = i;
                }
                // (已删除 V7 的错误 "break" 逻辑)
            }

            // 循环结束后, bestMatch 是: { result: 5000, original: "1000 * 5", index: 1 }

            if (bestMatch.index !== -1) {
                // 我们找到了一个有效的金额
                evalResult = bestMatch;
                amountNum = bestMatch.result;
                // index 1 -> slice(0, 1) -> "银行存款"
                accountPart = lineParts.slice(0, bestMatch.index).join(' ');
            } else {
                // 没有找到任何有效金额，整行都是科目
                accountPart = lineContent;
                amountNum = NaN;
                evalResult = { original: '', isFormula: false };
            }
            // --- 【V8/V9 修复结束】 ---

            if (prefix === '——') {
                accountPart = `${currentLevel1Account}——${accountPart}`;
            } else {
                if (accountPart.trim() !== '') {
                    currentLevel1Account = getLevel1Account(accountPart);
                }
            }

            entry.type = currentType;
            entry.account = accountPart;

            const amountData = isNaN(amountNum) ? { plain: '', html: '' } : formatAmount(amountNum);
            entry.amountFormatted = amountData.html;
            entry.amountPlain = amountData.plain;
            entry.originalAmount = evalResult.original;
            entry.isFormula = evalResult.isFormula;

            if (!isNaN(amountNum)) {
                if (entry.type === 'debit') totalDebit += amountNum;
                else if (entry.type === 'credit') totalCredit += amountNum;
            }
            journalEntries.push(entry);
        }

        const epsilon = 0.001;
        const isBalanced = Math.abs(totalDebit - totalCredit) < epsilon;

        renderTable(journalEntries, outputDiv, totalDebit, totalCredit, isBalanced);
    }

    // --- 启动和重绘逻辑 (保持不变) ---

    // 1. 查找所有未处理的 acct 代码块并渲染它们
    function initAcctJournalBlocks() {
        const preElements = document.querySelectorAll('pre.acct-journal-render');

        preElements.forEach(preEl => {
            const codeEl = preEl.querySelector('code');
            if (!codeEl) return;

            const inputText = codeEl.textContent;

            const outputWrapper = document.createElement('div');
            outputWrapper.className = 'acct-journal-wrapper';
            outputWrapper.dataset.acctSource = inputText;

            preEl.parentElement.replaceChild(outputWrapper, preEl);

            parseAndRender(inputText, outputWrapper);
        });
    }


    // 2. 在窗口大小改变时重绘所有表格
    function reRenderAcctJournalBlocks() {
        const wrappers = document.querySelectorAll('.acct-journal-wrapper');
        wrappers.forEach(wrapper => {
            const inputText = wrapper.dataset.acctSource;
            if (inputText) {
                wrapper.innerHTML = '';
                parseAndRender(inputText, wrapper);
            }
        });
    }

    // 3. 全局点击事件委托
    document.body.addEventListener('click', function (e) {
        const el = e.target.closest('.acct-journal-wrapper .amount-formula');
        if (el) {
            const currentState = el.getAttribute('data-state');
            const formula = el.getAttribute('data-formula');

            if (currentState === 'result') {
                el.innerHTML = formula;
                el.setAttribute('data-state', 'formula');
                const result = el.getAttribute('data-result');
                el.setAttribute('title', `点击查看结果: ${result}`);
                el.classList.add('showing-formula');
            } else {
                const resultStr = el.getAttribute('data-result');
                const resultNum = parseFloat(resultStr.replace(/,/g, ''));
                el.innerHTML = formatAmount(resultNum).html;
                el.setAttribute('data-state', 'result');
                el.setAttribute('title', `点击查看算式: ${formula}`);
                el.classList.remove('showing-formula');
            }
        }
    });


    // 4. 绑定事件
    document.addEventListener('DOMContentLoaded', initAcctJournalBlocks);
    window.addEventListener('resize', reRenderAcctJournalBlocks);

    // 5. 适配 mkdocs-material 的 "instant loading"
    if (window.document$) {
        window.document$.subscribe(initAcctJournalBlocks);
    }
    else if (window.MutationObserver) {
        const observer = new MutationObserver(mutations => {
            if (mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0)) {
                setTimeout(initAcctJournalBlocks, 100);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

})();