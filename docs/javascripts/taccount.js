const { useState, useMemo, useEffect } = React;

// --- 1. 核心工具 (复用你的逻辑) ---

const safeEvalT = (expr) => {
    if (!expr) return { val: NaN, raw: '' };
    let clean = expr.toString().replace(/[，,]/g, '').toLowerCase()
        .replace(/(\d+(\.\d+)?)k/g, '($1*1000)')
        .replace(/(\d+(\.\d+)?)w/g, '($1*10000)')
        .replace(/(\d+(\.\d+)?)%/g, '($1/100)');

    if (!/^[\d\s+\-*/().eE]+$/.test(clean)) return { val: NaN, raw: expr };
    try {
        const val = new Function('return ' + clean)();
        return { val: isFinite(val) ? val : NaN, raw: expr };
    } catch { return { val: NaN, raw: expr }; }
};

const formatMoneyT = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '-';
    // 使用会计常用的千分位格式
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- 2. T型账户解析器 (核心新逻辑) ---

const useTAccountParser = (text) => {
    return useMemo(() => {
        const lines = text.split('\n');
        const accountsMap = {}; // { '现金': { debits: [], credits: [] } }

        lines.forEach((line) => {
            const raw = line.trim();
            if (!raw || raw.startsWith('#')) return; // 跳过空行和纯注释

            // 1. 分离注释 (支持行尾 # 注释)
            const [contentRaw] = raw.split('#');
            const content = contentRaw.trim();
            if (!content) return;

            // 2. 解析方向 (默认借方，除非明确指定贷/d)
            // 逻辑：检测行首是否有 '贷:' 或 'd:'
            let direction = 'debit';
            let cleanContent = content;
            const dirMatch = content.match(/^(借|贷|j|d)[:：\s]?/i);
            
            if (dirMatch) {
                if (/^(贷|d)/i.test(dirMatch[0])) direction = 'credit';
                cleanContent = content.substring(dirMatch[0].length).trim();
            }

            // 3. 解析金额 (末尾的数字)
            const splitMatch = cleanContent.match(/[\s=]+([0-9kKwW.+\-*/()%]+)$/);
            if (!splitMatch) return;

            const amountObj = safeEvalT(splitMatch[1]);
            if (isNaN(amountObj.val)) return;

            const accountName = cleanContent.substring(0, splitMatch.index).trim();
            
            // 4. 归组
            if (!accountsMap[accountName]) {
                accountsMap[accountName] = { name: accountName, debits: [], credits: [] };
            }

            if (direction === 'debit') {
                accountsMap[accountName].debits.push(amountObj);
            } else {
                accountsMap[accountName].credits.push(amountObj);
            }
        });

        // 5. 计算余额并转换为数组
        return Object.values(accountsMap).map(acc => {
            const sumDebit = acc.debits.reduce((a, b) => a + b.val, 0);
            const sumCredit = acc.credits.reduce((a, b) => a + b.val, 0);
            const balance = sumDebit - sumCredit;
            
            return {
                ...acc,
                sumDebit,
                sumCredit,
                balance, 
                // 余额在借方还是贷方？(资产类通常借方为正，权益类贷方为正。这里简单按数值大小放置)
                balanceSide: balance >= 0 ? 'debit' : 'credit', 
                absBalance: Math.abs(balance)
            };
        });
    }, [text]);
};

// --- 3. 样式配置 (T-Account 专用) ---

const injectTStyles = () => {
    const styleId = 'je-t-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .t-grid-container { 
            display: grid; 
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); 
            gap: 24px; 
            margin: 20px 0; 
            font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
        }
        .t-card { 
            background: #fff; 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        }
        .t-header {
            background: #f8fafc;
            color: #1e293b;
            font-weight: bold;
            text-align: center;
            padding: 10px;
            font-size: 14px;
            border-bottom: 2px solid #64748b; /* T字的横线 */
        }
        .t-body {
            display: flex;
            flex: 1;
            position: relative;
        }
        .t-spine {
            width: 2px;
            background-color: #64748b; /* T字的竖线 */
            flex-shrink: 0;
        }
        .t-column {
            flex: 1;
            padding: 8px 0;
            display: flex;
            flex-direction: column;
            min-height: 100px;
        }
        .t-item {
            padding: 2px 12px;
            font-size: 13px;
            text-align: right;
            color: #334155;
            line-height: 1.6;
        }
        .t-item.is-formula { color: #60a5fa; cursor: help; }
        .t-total-row {
            border-top: 1px solid #cbd5e1;
            margin-top: auto; /* 推到底部 */
            padding: 4px 12px;
            font-weight: 600;
            font-size: 13px;
            text-align: right;
            color: #64748b;
        }
        .t-balance-row {
            border-top: 2px double #64748b; /* 双实线表示余额 */
            padding: 6px 12px;
            font-weight: bold;
            font-size: 13px;
            text-align: right;
            color: #0f172a;
            background-color: #fffbeb;
        }
        /* 移动端适配 */
        @media (max-width: 600px) {
            .t-grid-container { grid-template-columns: 1fr; }
        }
    `;
    document.head.appendChild(style);
};

// --- 4. 组件 ---

const AmountItem = ({ item }) => {
    // 简单处理：如果是算式，hover显示原始值(这里简化为title)
    const isFormula = item.raw && item.raw.toString() !== item.val.toString();
    return (
        <div className={`t-item ${isFormula ? 'is-formula' : ''}`} title={isFormula ? item.raw : ''}>
            {formatMoneyT(item.val)}
        </div>
    );
};

const TAccountCard = ({ account }) => {
    // 借方列
    const renderDebit = () => (
        <div className="t-column">
            {account.debits.map((d, i) => <AmountItem key={i} item={d} />)}
            {/* 补位空白，保证T字美观 */}
            <div style={{flex:1}}></div>
            {/* 本期合计 */}
            <div className="t-total-row">{formatMoneyT(account.sumDebit)}</div>
            {/* 期末余额 (如果在借方) */}
            {account.balanceSide === 'debit' ? (
                <div className="t-balance-row">余: {formatMoneyT(account.absBalance)}</div>
            ) : <div className="t-balance-row" style={{opacity:0}}>-</div>}
        </div>
    );

    // 贷方列
    const renderCredit = () => (
        <div className="t-column">
            {account.credits.map((c, i) => <AmountItem key={i} item={c} />)}
            <div style={{flex:1}}></div>
            <div className="t-total-row">{formatMoneyT(account.sumCredit)}</div>
            {account.balanceSide === 'credit' ? (
                <div className="t-balance-row">余: {formatMoneyT(account.absBalance)}</div>
            ) : <div className="t-balance-row" style={{opacity:0}}>-</div>}
        </div>
    );

    return (
        <div className="t-card">
            <div className="t-header">{account.name}</div>
            <div className="t-body">
                {renderDebit()}
                <div className="t-spine"></div>
                {renderCredit()}
            </div>
        </div>
    );
};

const TAccountBlock = ({ rawText }) => {
    useEffect(() => injectTStyles(), []);
    const accounts = useTAccountParser(rawText);

    if (!rawText) return null;

    return (
        <div className="t-grid-container">
            {accounts.map((acc) => (
                <TAccountCard key={acc.name} account={acc} />
            ))}
        </div>
    );
};

// --- 5. 挂载逻辑 ---
const renderTAccounts = () => {
    // 监听 class="je-t-account"
    const rawBlocks = document.querySelectorAll("pre.je-t-account");
    rawBlocks.forEach((preBlock) => {
        if (preBlock.hasAttribute("data-je-processed")) return;
        const codeElement = preBlock.querySelector("code");
        if (!codeElement) return;
        
        const rawText = codeElement.innerText;
        const container = document.createElement("div");
        preBlock.parentNode.insertBefore(container, preBlock);
        preBlock.style.display = "none";
        preBlock.setAttribute("data-je-processed", "true");
        
        const root = ReactDOM.createRoot(container);
        root.render(<TAccountBlock rawText={rawText} />);
    });
};

// 同时启动
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderTAccounts);
else renderTAccounts();
if (window.document$) window.document$.subscribe(() => setTimeout(renderTAccounts, 100));