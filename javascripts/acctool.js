/**
 * JE-Accounting Render v2.1 (Fixes & Restored UI)
 * 修复了样式崩塌问题，还原了计算器图标，统一了视觉风格
 */
const { useState, useMemo, useEffect } = React;

// ==========================================
// 1. 核心工具 (Utils)
// ==========================================

const safeEval = (expr) => {
    if (!expr) return { val: NaN, isFormula: false, raw: '' };
    let clean = expr.toString().replace(/[，,]/g, '').toLowerCase()
        .replace(/(\d+(\.\d+)?)k/g, '($1*1000)')
        .replace(/(\d+(\.\d+)?)w/g, '($1*10000)')
        .replace(/(\d+(\.\d+)?)%/g, '($1/100)');

    if (!/^[\d\s+\-*/().eE]+$/.test(clean)) return { val: NaN, isFormula: false, raw: expr, error: true };

    try {
        const val = new Function('return ' + clean)();
        if (!isFinite(val)) throw new Error("Infinite");
        const isFormula = !/^[\d.]+$/.test(clean);
        return { val, isFormula, raw: expr, error: false };
    } catch { return { val: NaN, isFormula: false, raw: expr, error: true }; }
};

const formatMoney = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ==========================================
// 2. 数据解析 (Parsers)
// ==========================================

const useEntryParser = (text) => {
    return useMemo(() => {
        const lines = text.split('\n');
        const result = [];
        let totalDebit = 0, totalCredit = 0;
        let lastContext = { direction: 'debit', rootName: '' };

        lines.forEach((line, index) => {
            const raw = line.trim();
            if (!raw) return;

            const [contentRaw, ...commentParts] = raw.split('#');
            const content = contentRaw.trim();
            const comment = commentParts.join('#').trim();

            if (!content && comment) {
                result.push({ id: `row-${index}`, type: 'comment-only', text: comment });
                return;
            }
            if (!content) return;

            let direction = lastContext.direction;
            let cleanContent = content;
            const dirMatch = content.match(/^(借|贷|j|d)[:：\s]?/i);
            if (dirMatch) {
                direction = /^(借|j)/i.test(dirMatch[0]) ? 'debit' : 'credit';
                cleanContent = content.substring(dirMatch[0].length).trim();
                lastContext.direction = direction;
            }
            const prefixStr = direction === 'debit' ? '借' : '贷';

            let amountObj = { val: NaN, isFormula: false, raw: '' };
            let accountName = cleanContent;
            const splitMatch = cleanContent.match(/[\s=]+([0-9kKwW.+\-*/()%]+)$/);

            if (splitMatch) {
                const parsed = safeEval(splitMatch[1]);
                if (!parsed.error && !isNaN(parsed.val)) {
                    amountObj = parsed;
                    accountName = cleanContent.substring(0, splitMatch.index).trim();
                }
            }

            let phantomText = '', visibleText = accountName;
            if (/^([—-]+)/.test(accountName)) {
                phantomText = lastContext.rootName;
                visibleText = accountName;
            } else {
                const split = accountName.split(/[—-]+/);
                if (split.length > 0 && split[0].trim()) lastContext.rootName = split[0].trim();
            }

            if (!isNaN(amountObj.val)) {
                direction === 'debit' ? totalDebit += amountObj.val : totalCredit += amountObj.val;
            }

            result.push({ id: `row-${index}`, type: 'entry', direction, prefixStr, phantomText, visibleText, amount: amountObj, comment });
        });
        return { entries: result, totalDebit, totalCredit };
    }, [text]);
};

const useDerivedTAccounts = (entries) => {
    return useMemo(() => {
        const accountsMap = {};
        entries.forEach(entry => {
            if (entry.type !== 'entry' || isNaN(entry.amount.val)) return;

            // 聚合逻辑：去除破折号，合并同名科目
            let key = entry.visibleText.replace(/^[—-]+/, '').trim();
            if (entry.phantomText) key = `${entry.phantomText}——${key}`;

            if (!accountsMap[key]) {
                accountsMap[key] = { name: key, debits: [], credits: [] };
            }

            if (entry.direction === 'debit') {
                accountsMap[key].debits.push(entry.amount);
            } else {
                accountsMap[key].credits.push(entry.amount);
            }
        });

        return Object.values(accountsMap).map(acc => {
            const sumDebit = acc.debits.reduce((a, b) => a + b.val, 0);
            const sumCredit = acc.credits.reduce((a, b) => a + b.val, 0);
            const balance = sumDebit - sumCredit;
            return {
                ...acc,
                sumDebit,
                sumCredit,
                balance,
                balanceSide: balance >= 0 ? 'debit' : 'credit',
                absBalance: Math.abs(balance)
            };
        });
    }, [entries]);
};

// ==========================================
// 3. 样式注入 (修复了 CSS 语法)
// ==========================================

const injectStyles = () => {
    const styleId = 'je-merged-styles-v2';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        /* 容器重置 */
        .je-wrapper { font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.5; width: 100%; margin: 16px 0; color: #334155; }
        .je-wrapper * { box-sizing: border-box; }

        /* Toolbar */
        .je-toolbar { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
        .je-tab { padding: 4px 12px; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 12px; transition: all 0.2s; user-select: none; color: #64748b; }
        .je-tab.active { background-color: #3b82f6; color: white; }
        .je-tab:hover:not(.active) { background-color: #f1f5f9; color: #0f172a; }

        /* 通用原子样式 */
        .je-phantom { opacity: 0.5; margin-right: 0; }
        .je-bold { font-weight: 600; color: #1e293b; }
        .je-badge { font-size: 10px; padding: 0 4px; border-radius: 3px; margin-right: 8px; border: 1px solid; height: 18px; line-height: 16px; flex-shrink: 0; font-weight: bold; display: inline-block; }
        
        /* 桌面端表格 (Voucher) */
        .je-table { background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }
        .je-row { display: grid; grid-template-columns: 1fr 140px 140px; border-bottom: 1px solid #e2e8f0; align-items: stretch; }
        .je-header-cell { padding: 8px 12px; background-color: #f8fafc; font-weight: bold; font-size: 12px; color: #64748b; border-right: 1px solid #e2e8f0; }
        .je-cell { padding: 6px 12px; display: flex; align-items: center; border-right: 1px solid #e2e8f0; overflow: hidden; }
        .je-money-cell { padding: 6px 12px; display: flex; flex-direction: column; justifyContent: center; text-align: right; font-weight: bold; font-family: monospace; white-space: pre-wrap; word-break: break-all; font-size: 12px; }

        /* T型账户 (Grid Layout) */
        .t-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; margin-top: 8px; }
        .t-card { 
            background: #fff; 
            border: 1px solid #e2e8f0; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
            overflow: hidden;
            display: flex;       /* 关键修复 */
            flex-direction: column; /* 关键修复：确保上下排列 */
        }
        .t-header { background: #f8fafc; color: #1e293b; font-weight: bold; text-align: center; padding: 10px; font-size: 14px; border-bottom: 2px solid #64748b; }
        .t-body { display: flex; flex: 1; position: relative; min-height: 100px; }
        .t-spine { width: 2px; background-color: #64748b; flex-shrink: 0; }
        .t-column { flex: 1; padding: 8px 0; display: flex; flex-direction: column; }
        .t-item { padding: 2px 12px; font-size: 13px; text-align: right; color: #334155; line-height: 1.6; font-family: monospace; }
        .t-item.is-formula { color: #2563eb; cursor: pointer; }
        .t-total-row { border-top: 1px solid #cbd5e1; margin-top: auto; padding: 4px 12px; font-weight: 600; font-size: 13px; text-align: right; color: #64748b; font-family: monospace;}
        .t-balance-row { border-top: 2px double #64748b; padding: 6px 12px; font-weight: bold; font-size: 13px; text-align: right; color: #0f172a; background-color: #fffbeb; font-family: monospace;}

        /* 响应式控制 */
        .je-desktop { display: block; }
        .je-mobile { display: none; }
        
        @media (max-width: 768px) {
            .je-desktop { display: none; }
            .je-mobile { display: block; }
            .t-grid { grid-template-columns: 1fr; }
            
            /* 移动端卡片样式 */
            .je-m-card { background: #fff; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; }
            .je-m-inner { display: flex; min-height: 44px; }
            .je-m-stripe { width: 5px; flex-shrink: 0; }
            .je-m-content { flex: 1; padding: 10px; display: flex; flex-direction: column; justify-content: center; }
        }
    `;
    document.head.appendChild(style);
};

// ==========================================
// 4. UI 组件 (UI Components)
// ==========================================

// 4.1 计算器图标 (从原版还原)
const IconCalculator = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', color: '#60a5fa', flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}>
        <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
    </svg>
);

// 4.2 统一的金额显示组件 (带交互)
const MoneyCell = ({ amount, align = 'right' }) => {
    const [showFormula, setShowFormula] = useState(false);
    if (amount.error) return <span style={{ color: '#ef4444', fontSize: '11px' }}>Error</span>;
    if (isNaN(amount.val)) return null;

    const isFormula = amount.isFormula;
    const displayContent = (showFormula && isFormula) ? amount.raw : formatMoney(amount.val);

    return (
        <div
            onClick={(e) => {
                if (isFormula) {
                    e.stopPropagation();
                    setShowFormula(!showFormula);
                }
            }}
            style={{
                cursor: isFormula ? 'pointer' : 'default',
                color: (showFormula && isFormula) ? '#2563eb' : 'inherit',
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
                lineHeight: '1.3'
            }}
            title={isFormula ? "点击切换算式" : ""}
        >
            {isFormula && !showFormula && <IconCalculator />}
            <span>{displayContent}</span>
        </div>
    );
};

// --- 视图 1: 凭证表格 (还原 voucher-render.js 布局) ---
const VoucherView = ({ entries, totalDebit, totalCredit }) => (
    <div>
        {/* Desktop View */}
        <div className="je-desktop je-table">
            <div className="je-row">
                <div className="je-header-cell">摘要与科目</div>
                <div className="je-header-cell" style={{ textAlign: 'right' }}>借方</div>
                <div className="je-header-cell" style={{ textAlign: 'right', borderRight: 'none' }}>贷方</div>
            </div>
            {entries.map((entry) => {
                if (entry.type === 'comment-only') {
                    return <div key={entry.id} style={{ padding: '6px 12px', backgroundColor: '#f8fafc', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}># {entry.text}</div>;
                }
                const isDebit = entry.direction === 'debit';
                const badgeStyle = isDebit
                    ? { backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }
                    : { backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };

                return (
                    <div key={entry.id}>
                        <div className="je-row" style={{ borderBottom: entry.comment ? '1px dashed #e2e8f0' : '1px solid #e2e8f0' }}>
                            <div className="je-cell">
                                <span className="je-badge" style={badgeStyle}>{entry.prefixStr}</span>
                                <div style={{ overflow: 'hidden' }} className="je-bold">
                                    {entry.phantomText && <span className="je-phantom">{entry.phantomText}</span>}
                                    {entry.visibleText}
                                </div>
                            </div>
                            <div className="je-money-cell" style={{ borderRight: '1px solid #e2e8f0' }}>
                                {isDebit && <MoneyCell amount={entry.amount} />}
                            </div>
                            <div className="je-money-cell">
                                {!isDebit && <MoneyCell amount={entry.amount} />}
                            </div>
                        </div>
                        {entry.comment && <div style={{ backgroundColor: '#f8fafc', padding: '4px 12px 4px 42px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>↳ {entry.comment}</div>}
                    </div>
                );
            })}
            <div className="je-row" style={{ backgroundColor: '#f8fafc', borderBottom: 'none' }}>
                <div className="je-header-cell" style={{ textAlign: 'right', color: '#334155' }}>合计</div>
                <div className="je-money-cell" style={{ borderRight: '1px solid #e2e8f0' }}>{formatMoney(totalDebit)}</div>
                <div className="je-money-cell">{formatMoney(totalCredit)}</div>
            </div>
        </div>

        {/* Mobile View */}
        <div className="je-mobile" style={{ backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '8px' }}>
            {entries.map((entry) => {
                if (entry.type === 'comment-only') return <div key={entry.id} style={{ marginBottom: '8px', padding: '8px', fontSize: '11px', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '4px' }}># {entry.text}</div>;

                const isDebit = entry.direction === 'debit';
                const stripeColor = isDebit ? '#3b82f6' : '#ef4444';
                const badgeStyle = isDebit
                    ? { backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }
                    : { backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };

                return (
                    <div key={entry.id} className="je-m-card">
                        <div className="je-m-inner">
                            <div className="je-m-stripe" style={{ backgroundColor: stripeColor }}></div>
                            <div className="je-m-content">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1, paddingRight: '8px' }}>
                                        <span className="je-badge" style={{ ...badgeStyle, marginTop: '2px' }}>{entry.prefixStr}</span>
                                        <div style={{ lineHeight: '1.4', wordBreak: 'break-word' }} className="je-bold">
                                            {entry.phantomText && <span className="je-phantom">{entry.phantomText}</span>}
                                            {entry.visibleText}
                                        </div>
                                    </div>
                                    <div style={{ flexShrink: 0, maxWidth: '45%', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                                        <MoneyCell amount={entry.amount} />
                                    </div>
                                </div>
                                {entry.comment && <div style={{ marginTop: '6px', fontSize: '11px', color: '#64748b', lineHeight: '1.4', paddingLeft: '2px' }}>↳ {entry.comment}</div>}
                            </div>
                        </div>
                    </div>
                );
            })}
            <div style={{ backgroundColor: '#1e293b', color: '#fff', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ opacity: 0.7 }}>借方合计</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatMoney(totalDebit)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ opacity: 0.7 }}>贷方合计</span>
                    <span style={{ fontFamily: 'monospace' }}>{formatMoney(totalCredit)}</span>
                </div>
            </div>
        </div>
    </div>
);

// --- 视图 2: T型账户 (还原 taccount.js 布局) ---
const TAccountView = ({ accounts }) => (
    <div className="t-grid">
        {accounts.map((acc) => (
            <div key={acc.name} className="t-card">
                <div className="t-header">{acc.name}</div>
                <div className="t-body">
                    <div className="t-column">
                        {acc.debits.map((d, i) => <div key={i} className="t-item"><MoneyCell amount={d} /></div>)}
                        <div style={{ flex: 1 }}></div>
                        <div className="t-total-row">{formatMoney(acc.sumDebit)}</div>
                        {acc.balanceSide === 'debit' ? (
                            <div className="t-balance-row">余: {formatMoney(acc.absBalance)}</div>
                        ) : <div className="t-balance-row" style={{ opacity: 0 }}>-</div>}
                    </div>
                    <div className="t-spine"></div>
                    <div className="t-column">
                        {acc.credits.map((c, i) => <div key={i} className="t-item"><MoneyCell amount={c} /></div>)}
                        <div style={{ flex: 1 }}></div>
                        <div className="t-total-row">{formatMoney(acc.sumCredit)}</div>
                        {acc.balanceSide === 'credit' ? (
                            <div className="t-balance-row">余: {formatMoney(acc.absBalance)}</div>
                        ) : <div className="t-balance-row" style={{ opacity: 0 }}>-</div>}
                    </div>
                </div>
            </div>
        ))}
    </div>
);

// ==========================================
// 5. 主逻辑
// ==========================================

const AccountingWidget = ({ rawText }) => {
    useEffect(() => injectStyles(), []);

    const { entries, totalDebit, totalCredit } = useEntryParser(rawText);
    const accounts = useDerivedTAccounts(entries);
    const [view, setView] = useState('voucher');

    if (!rawText) return null;

    return (
        <div className="je-wrapper">
            <div className="je-toolbar">
                <div className={`je-tab ${view === 'voucher' ? 'active' : ''}`} onClick={() => setView('voucher')}>
                    📝 会计分录
                </div>
                <div className={`je-tab ${view === 't-account' ? 'active' : ''}`} onClick={() => setView('t-account')}>
                    📊 T型账户
                </div>
            </div>

            {view === 'voucher' ? (
                <VoucherView entries={entries} totalDebit={totalDebit} totalCredit={totalCredit} />
            ) : (
                <TAccountView accounts={accounts} />
            )}
        </div>
    );
};

const mountAccounting = () => {
    const selector = "pre.je-source, pre.je-t-account";
    document.querySelectorAll(selector).forEach((preBlock) => {
        if (preBlock.hasAttribute("data-je-processed")) return;
        const codeElement = preBlock.querySelector("code");
        if (!codeElement) return;

        const rawText = codeElement.innerText;
        const container = document.createElement("div");
        preBlock.parentNode.insertBefore(container, preBlock);
        preBlock.style.display = "none";
        preBlock.setAttribute("data-je-processed", "true");

        const root = ReactDOM.createRoot(container);
        root.render(<AccountingWidget rawText={rawText} />);
    });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAccounting);
else mountAccounting();
if (window.document$) window.document$.subscribe(() => setTimeout(mountAccounting, 100));