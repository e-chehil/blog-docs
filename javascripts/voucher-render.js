const { useState, useMemo, useEffect } = React;

// --- 1. 核心逻辑 (解析与计算) ---

// 安全计算算式，支持 k/w/% 后缀，处理异常
const safeEval = (expr) => {
    if (!expr) return { val: NaN, isFormula: false, raw: '' };
    // 预处理：去逗号、转小写、替换单位
    let clean = expr.toString().replace(/[，,]/g, '').toLowerCase()
        .replace(/(\d+(\.\d+)?)k/g, '($1*1000)')
        .replace(/(\d+(\.\d+)?)w/g, '($1*10000)')
        .replace(/(\d+(\.\d+)?)%/g, '($1/100)');

    if (!/^[\d\s+\-*/().eE]+$/.test(clean)) return { val: NaN, isFormula: false, raw: expr, error: true };

    try {
        const val = new Function('return ' + clean)();
        if (!isFinite(val)) throw new Error("Infinite");
        // 若输入包含运算符，则标记为算式
        const isFormula = !/^[\d.]+$/.test(clean);
        return { val, isFormula, raw: expr, error: false };
    } catch { return { val: NaN, isFormula: false, raw: expr, error: true }; }
};

const formatMoney = (num) => {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// 解析凭证文本条目
const useEntryParser = (text) => {
    return useMemo(() => {
        const lines = text.split('\n');
        const result = [];
        let totalDebit = 0, totalCredit = 0;
        let lastContext = { direction: 'debit', rootName: '' };

        lines.forEach((line, index) => {
            const raw = line.trim();
            if (!raw) return;

            // 分离注释
            const [contentRaw, ...commentParts] = raw.split('#');
            const content = contentRaw.trim();
            const comment = commentParts.join('#').trim();

            if (!content && comment) {
                result.push({ id: `row-${index}`, type: 'comment-only', text: comment });
                return;
            }
            if (!content) return;

            // 解析借贷方向
            let direction = lastContext.direction;
            let cleanContent = content;
            const dirMatch = content.match(/^(借|贷|j|d)[:：\s]?/i);
            if (dirMatch) {
                direction = /^(借|j)/i.test(dirMatch[0]) ? 'debit' : 'credit';
                cleanContent = content.substring(dirMatch[0].length).trim();
                lastContext.direction = direction;
            }
            const prefixStr = direction === 'debit' ? '借' : '贷';

            // 解析金额与科目
            let amountObj = { val: NaN, isFormula: false, raw: '' };
            let accountName = cleanContent;
            // 匹配末尾的数字或算式
            const splitMatch = cleanContent.match(/[\s=]+([0-9kKwW.+\-*/()%]+)$/);

            if (splitMatch) {
                const parsed = safeEval(splitMatch[1]);
                if (!parsed.error && !isNaN(parsed.val)) {
                    amountObj = parsed;
                    accountName = cleanContent.substring(0, splitMatch.index).trim();
                }
            }

            // 处理科目层级 (Phantom Text)
            let phantomText = '', visibleText = accountName;
            if (/^([—-]+)/.test(accountName)) {
                phantomText = lastContext.rootName;
                visibleText = accountName; // 保留破折号以便视觉区分，或在此处去除
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

// --- 2. 样式配置 ---

const injectStyles = () => {
    const styleId = 'je-voucher-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .je-wrapper { font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.5; width: 100%; margin: 16px 0; box-sizing: border-box; }
        .je-wrapper * { box-sizing: border-box; }
        .je-desktop { display: block; }
        .je-mobile { display: none; }
        @media (max-width: 768px) {
            .je-desktop { display: none; }
            .je-mobile { display: block; }
        }
    `;
    document.head.appendChild(style);
};

const S = {
    // 桌面表格：增加列宽，防止挤压
    tableContainer: { backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden', color: '#334155' },
    // 1fr 自动填充科目列，140px 固定宽度给金额列
    row: { display: 'grid', gridTemplateColumns: '1fr 140px 140px', borderBottom: '1px solid #e2e8f0', alignItems: 'stretch' },
    headerCell: { padding: '8px 12px', backgroundColor: '#f8fafc', fontWeight: 'bold', fontSize: '12px', color: '#64748b', borderRight: '1px solid #e2e8f0' },
    cell: { padding: '6px 12px', display: 'flex', alignItems: 'center', borderRight: '1px solid #e2e8f0', overflow: 'hidden' },

    // 金额列核心样式：允许换行，防止溢出
    moneyCell: {
        padding: '6px 12px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        textAlign: 'right',
        fontWeight: 'bold',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',  // 允许长算式换行
        wordBreak: 'break-all',  // 强制长单词/数字断行
        fontSize: '12px'
    },

    // 移动端样式
    mobileContainer: { backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '8px' },
    card: { backgroundColor: '#fff', borderRadius: '6px', marginBottom: '8px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', overflow: 'hidden' },
    cardInner: { display: 'flex', minHeight: '44px' },
    stripe: { width: '5px', flexShrink: 0 },

    // 组件小元素
    badge: { fontSize: '10px', padding: '0 4px', borderRadius: '3px', marginRight: '8px', border: '1px solid', height: '18px', lineHeight: '16px', flexShrink: 0, fontWeight: 'bold', display: 'inline-block' },
    commentRow: { backgroundColor: '#f8fafc', padding: '4px 12px 4px 42px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' },
    phantom: { opacity: 0.5, marginRight: 0 },
    textBold: { fontWeight: 600, color: '#1e293b' }
};

// --- 3. UI 组件 ---

const IconCalculator = () => (
    <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', color: '#60a5fa', flexShrink: 0 }}>
        <rect x="4" y="2" width="16" height="20" rx="2" /><line x1="8" x2="16" y1="6" y2="6" /><line x1="16" x2="16" y1="14" y2="18" /><path d="M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" />
    </svg>
);

const MoneyCell = ({ amount }) => {
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
                color: (showFormula && isFormula) ? '#2563eb' : '#0f172a',
                width: '100%',
                display: 'flex',
                flexWrap: 'wrap', // 关键：允许内容折行
                alignItems: 'center',
                justifyContent: 'flex-end',
                lineHeight: '1.3'
            }}
            title={isFormula ? "点击切换算式" : ""}
        >
            {isFormula && !showFormula && <IconCalculator />}
            <span>{displayContent}</span>
        </div>
    );
};

// 桌面端视图
const DesktopView = ({ entries, totalDebit, totalCredit }) => (
    <div className="je-desktop" style={S.tableContainer}>
        <div style={S.row}>
            <div style={S.headerCell}>摘要与科目</div>
            <div style={{ ...S.headerCell, textAlign: 'right' }}>借方</div>
            <div style={{ ...S.headerCell, textAlign: 'right', borderRight: 'none' }}>贷方</div>
        </div>
        <div style={{ backgroundColor: '#fff' }}>
            {entries.map((entry) => {
                if (entry.type === 'comment-only') {
                    return <div key={entry.id} style={{ padding: '6px 12px', backgroundColor: '#f8fafc', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}># {entry.text}</div>;
                }
                const isDebit = entry.direction === 'debit';
                const badgeStyle = isDebit
                    ? { ...S.badge, backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }
                    : { ...S.badge, backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };

                return (
                    <div key={entry.id}>
                        <div style={{ ...S.row, borderBottom: entry.comment ? '1px dashed #e2e8f0' : '1px solid #e2e8f0' }}>
                            <div style={S.cell}>
                                <span style={badgeStyle}>{entry.prefixStr}</span>
                                <div style={{ overflow: 'hidden', ...S.textBold }}>
                                    {entry.phantomText && <span style={S.phantom}>{entry.phantomText}</span>}
                                    {entry.visibleText}
                                </div>
                            </div>
                            <div style={{ ...S.moneyCell, borderRight: '1px solid #e2e8f0' }}>
                                {isDebit && <MoneyCell amount={entry.amount} />}
                            </div>
                            <div style={S.moneyCell}>
                                {!isDebit && <MoneyCell amount={entry.amount} />}
                            </div>
                        </div>
                        {entry.comment && <div style={S.commentRow}>↳ {entry.comment}</div>}
                    </div>
                );
            })}
        </div>
        <div style={{ ...S.row, backgroundColor: '#f8fafc', borderBottom: 'none' }}>
            <div style={{ ...S.headerCell, textAlign: 'right', color: '#334155' }}>合计</div>
            <div style={{ ...S.moneyCell, borderRight: '1px solid #e2e8f0' }}>{formatMoney(totalDebit)}</div>
            <div style={S.moneyCell}>{formatMoney(totalCredit)}</div>
        </div>
    </div>
);

// 移动端视图
const MobileView = ({ entries, totalDebit, totalCredit }) => (
    <div className="je-mobile" style={S.mobileContainer}>
        {entries.map((entry) => {
            if (entry.type === 'comment-only') {
                return <div key={entry.id} style={{ marginBottom: '8px', padding: '8px', fontSize: '11px', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '4px' }}># {entry.text}</div>;
            }
            const isDebit = entry.direction === 'debit';
            const stripeColor = isDebit ? '#3b82f6' : '#ef4444';
            const badgeStyle = isDebit
                ? { ...S.badge, backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' }
                : { ...S.badge, backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };

            return (
                <div key={entry.id} style={S.card}>
                    <div style={S.cardInner}>
                        <div style={{ ...S.stripe, backgroundColor: stripeColor }}></div>
                        <div style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                {/* 左侧科目名称，flex: 1 确保占据剩余空间 */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1, paddingRight: '8px' }}>
                                    <span style={{ ...badgeStyle, marginTop: '2px' }}>{entry.prefixStr}</span>
                                    <div style={{ lineHeight: '1.4', wordBreak: 'break-word', ...S.textBold }}>
                                        {entry.phantomText && <span style={S.phantom}>{entry.phantomText}</span>}
                                        {entry.visibleText}
                                    </div>
                                </div>
                                {/* 右侧金额，flex-shrink: 0 防止被压缩，同时允许内部换行 */}
                                <div style={{ flexShrink: 0, maxWidth: '45%', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>
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
);

const VoucherBlock = ({ rawText }) => {
    useEffect(() => injectStyles(), []);
    const { entries, totalDebit, totalCredit } = useEntryParser(rawText);
    if (!rawText) return null;

    return (
        <div className="je-wrapper">
            <DesktopView entries={entries} totalDebit={totalDebit} totalCredit={totalCredit} />
            <MobileView entries={entries} totalDebit={totalDebit} totalCredit={totalCredit} />
        </div>
    );
};

// --- 4. 挂载逻辑 ---
const renderVouchers = () => {
    const rawBlocks = document.querySelectorAll("pre.je-source");
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
        root.render(<VoucherBlock rawText={rawText} />);
    });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderVouchers);
else renderVouchers();
if (window.document$) window.document$.subscribe(() => setTimeout(renderVouchers, 100));