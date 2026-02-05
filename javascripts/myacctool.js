/**
 * JE-Accounting Render v2.1 (Compiled to Native JS)
 * 已编译为原生 JS，无需 Babel 运行时。
 */
"use strict";

var _React = React,
    useState = _React.useState,
    useMemo = _React.useMemo,
    useEffect = _React.useEffect;

// ==========================================
// 1. 核心工具 (Utils)
// ==========================================

var safeEval = function safeEval(expr) {
    if (!expr) return { val: NaN, isFormula: false, raw: '' };
    var clean = expr.toString().replace(/[，,]/g, '').toLowerCase().replace(/(\d+(\.\d+)?)k/g, '($1*1000)').replace(/(\d+(\.\d+)?)w/g, '($1*10000)').replace(/(\d+(\.\d+)?)%/g, '($1/100)');
    if (!/^[\d\s+\-*/().eE]+$/.test(clean)) return { val: NaN, isFormula: false, raw: expr, error: true };
    try {
        var val = new Function('return ' + clean)();
        if (!isFinite(val)) throw new Error("Infinite");
        var isFormula = !/^[\d.]+$/.test(clean);
        return { val: val, isFormula: isFormula, raw: expr, error: false };
    } catch (_unused) {
        return { val: NaN, isFormula: false, raw: expr, error: true };
    }
};

var formatMoney = function formatMoney(num) {
    if (typeof num !== 'number' || isNaN(num)) return '';
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ==========================================
// 2. 数据解析 (Parsers)
// ==========================================

var useEntryParser = function useEntryParser(text) {
    return useMemo(function () {
        var lines = text.split('\n');
        var result = [];
        var totalDebit = 0, totalCredit = 0;
        var lastContext = { direction: 'debit', rootName: '' };

        lines.forEach(function (line, index) {
            var raw = line.trim();
            if (!raw) return;
            var _raw$split = raw.split('#'),
                contentRaw = _raw$split[0],
                commentParts = _raw$split.slice(1);
            var content = contentRaw.trim();
            var comment = commentParts.join('#').trim();

            if (!content && comment) {
                result.push({ id: "row-".concat(index), type: 'comment-only', text: comment });
                return;
            }
            if (!content) return;

            var direction = lastContext.direction;
            var cleanContent = content;
            var dirMatch = content.match(/^(借|贷|j|d)[:：\s]?/i);
            if (dirMatch) {
                direction = /^(借|j)/i.test(dirMatch[0]) ? 'debit' : 'credit';
                cleanContent = content.substring(dirMatch[0].length).trim();
                lastContext.direction = direction;
            }
            var prefixStr = direction === 'debit' ? '借' : '贷';

            var amountObj = { val: NaN, isFormula: false, raw: '' };
            var accountName = cleanContent;
            var splitMatch = cleanContent.match(/[\s=]+([0-9kKwW.+\-*/()%]+)$/);

            if (splitMatch) {
                var parsed = safeEval(splitMatch[1]);
                if (!parsed.error && !isNaN(parsed.val)) {
                    amountObj = parsed;
                    accountName = cleanContent.substring(0, splitMatch.index).trim();
                }
            }

            var phantomText = '', visibleText = accountName;
            if (/^([—-]+)/.test(accountName)) {
                phantomText = lastContext.rootName;
                visibleText = accountName;
            } else {
                var split = accountName.split(/[—-]+/);
                if (split.length > 0 && split[0].trim()) lastContext.rootName = split[0].trim();
            }

            if (!isNaN(amountObj.val)) {
                direction === 'debit' ? totalDebit += amountObj.val : totalCredit += amountObj.val;
            }
            result.push({ id: "row-".concat(index), type: 'entry', direction: direction, prefixStr: prefixStr, phantomText: phantomText, visibleText: visibleText, amount: amountObj, comment: comment });
        });
        return { entries: result, totalDebit: totalDebit, totalCredit: totalCredit };
    }, [text]);
};

var useDerivedTAccounts = function useDerivedTAccounts(entries) {
    return useMemo(function () {
        var accountsMap = {};
        entries.forEach(function (entry) {
            if (entry.type !== 'entry' || isNaN(entry.amount.val)) return;
            var key = entry.visibleText.replace(/^[—-]+/, '').trim();
            if (entry.phantomText) key = "".concat(entry.phantomText, "\u2014\u2014").concat(key);

            if (!accountsMap[key]) {
                accountsMap[key] = { name: key, debits: [], credits: [] };
            }
            if (entry.direction === 'debit') {
                accountsMap[key].debits.push(entry.amount);
            } else {
                accountsMap[key].credits.push(entry.amount);
            }
        });

        return Object.values(accountsMap).map(function (acc) {
            var sumDebit = acc.debits.reduce(function (a, b) { return a + b.val; }, 0);
            var sumCredit = acc.credits.reduce(function (a, b) { return a + b.val; }, 0);
            var balance = sumDebit - sumCredit;
            return Object.assign({}, acc, {
                sumDebit: sumDebit,
                sumCredit: sumCredit,
                balance: balance,
                balanceSide: balance >= 0 ? 'debit' : 'credit',
                absBalance: Math.abs(balance)
            });
        });
    }, [entries]);
};

// ==========================================
// 3. 样式注入
// ==========================================

var injectStyles = function injectStyles() {
    var styleId = 'je-merged-styles-v2';
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = "\n        /* \u5BB9\u5668\u91CD\u7F6E */\n        .je-wrapper { font-family: ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 1.5; width: 100%; margin: 16px 0; color: #334155; }\n        .je-wrapper * { box-sizing: border-box; }\n\n        /* Toolbar */\n        .je-toolbar { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }\n        .je-tab { padding: 4px 12px; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 12px; transition: all 0.2s; user-select: none; color: #64748b; }\n        .je-tab.active { background-color: #3b82f6; color: white; }\n        .je-tab:hover:not(.active) { background-color: #f1f5f9; color: #0f172a; }\n\n        /* \u901A\u7528\u539F\u5B50\u6837\u5F0F */\n        .je-phantom { opacity: 0.5; margin-right: 0; }\n        .je-bold { font-weight: 600; color: #1e293b; }\n        .je-badge { font-size: 10px; padding: 0 4px; border-radius: 3px; margin-right: 8px; border: 1px solid; height: 18px; line-height: 16px; flex-shrink: 0; font-weight: bold; display: inline-block; }\n        \n        /* \u684C\u9762\u7AEF\u8868\u683C (Voucher) */\n        .je-table { background-color: #fff; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; }\n        .je-row { display: grid; grid-template-columns: 1fr 140px 140px; border-bottom: 1px solid #e2e8f0; align-items: stretch; }\n        .je-header-cell { padding: 8px 12px; background-color: #f8fafc; font-weight: bold; font-size: 12px; color: #64748b; border-right: 1px solid #e2e8f0; }\n        .je-cell { padding: 6px 12px; display: flex; align-items: center; border-right: 1px solid #e2e8f0; overflow: hidden; }\n        .je-money-cell { padding: 6px 12px; display: flex; flex-direction: column; justifyContent: center; text-align: right; font-weight: bold; font-family: monospace; white-space: pre-wrap; word-break: break-all; font-size: 12px; }\n\n        /* T\u578B\u8D26\u6237 (Grid Layout) */\n        .t-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 24px; margin-top: 8px; }\n        .t-card { \n            background: #fff; \n            border: 1px solid #e2e8f0; \n            border-radius: 8px; \n            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);\n            overflow: hidden;\n            display: flex;       /* \u5173\u952E\u4FEE\u590D */\n            flex-direction: column; /* \u5173\u952E\u4FEE\u590D\uFF1A\u786E\u4FDD\u4E0A\u4E0B\u6392\u5217 */\n        }\n        .t-header { background: #f8fafc; color: #1e293b; font-weight: bold; text-align: center; padding: 10px; font-size: 14px; border-bottom: 2px solid #64748b; }\n        .t-body { display: flex; flex: 1; position: relative; min-height: 100px; }\n        .t-spine { width: 2px; background-color: #64748b; flex-shrink: 0; }\n        .t-column { flex: 1; padding: 8px 0; display: flex; flex-direction: column; }\n        .t-item { padding: 2px 12px; font-size: 13px; text-align: right; color: #334155; line-height: 1.6; font-family: monospace; }\n        .t-item.is-formula { color: #2563eb; cursor: pointer; }\n        .t-total-row { border-top: 1px solid #cbd5e1; margin-top: auto; padding: 4px 12px; font-weight: 600; font-size: 13px; text-align: right; color: #64748b; font-family: monospace;}\n        .t-balance-row { border-top: 2px double #64748b; padding: 6px 12px; font-weight: bold; font-size: 13px; text-align: right; color: #0f172a; background-color: #fffbeb; font-family: monospace;}\n\n        /* \u54CD\u5E94\u5F0F\u63A7\u5236 */\n        .je-desktop { display: block; }\n        .je-mobile { display: none; }\n        \n        @media (max-width: 768px) {\n            .je-desktop { display: none; }\n            .je-mobile { display: block; }\n            .t-grid { grid-template-columns: 1fr; }\n            \n            /* \u79FB\u52A8\u7AEF\u5361\u7247\u6837\u5F0F */\n            .je-m-card { background: #fff; border-radius: 6px; margin-bottom: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; overflow: hidden; }\n            .je-m-inner { display: flex; min-height: 44px; }\n            .je-m-stripe { width: 5px; flex-shrink: 0; }\n            .je-m-content { flex: 1; padding: 10px; display: flex; flex-direction: column; justify-content: center; }\n        }\n    ";
    document.head.appendChild(style);
};

// ==========================================
// 4. UI 组件 (UI Components)
// ==========================================

// 4.1 计算器图标
var IconCalculator = function IconCalculator() {
    return React.createElement("svg", {
        viewBox: "0 0 24 24",
        width: "12",
        height: "12",
        stroke: "currentColor",
        strokeWidth: "2",
        fill: "none",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { marginRight: '4px', color: '#60a5fa', flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }
    }, React.createElement("rect", { x: "4", y: "2", width: "16", height: "20", rx: "2" }), React.createElement("line", { x1: "8", x2: "16", y1: "6", y2: "6" }), React.createElement("line", { x1: "16", x2: "16", y1: "14", y2: "18" }), React.createElement("path", { d: "M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M8 18h.01M12 18h.01" }));
};

// 4.2 统一的金额显示组件
var MoneyCell = function MoneyCell(_ref) {
    var amount = _ref.amount,
        _ref$align = _ref.align,
        align = _ref$align === void 0 ? 'right' : _ref$align;

    var _useState = useState(false),
        showFormula = _useState[0],
        setShowFormula = _useState[1];

    if (amount.error) return React.createElement("span", { style: { color: '#ef4444', fontSize: '11px' } }, "Error");
    if (isNaN(amount.val)) return null;

    var isFormula = amount.isFormula;
    var displayContent = showFormula && isFormula ? amount.raw : formatMoney(amount.val);

    return React.createElement("div", {
        onClick: function onClick(e) {
            if (isFormula) {
                e.stopPropagation();
                setShowFormula(!showFormula);
            }
        },
        style: {
            cursor: isFormula ? 'pointer' : 'default',
            color: showFormula && isFormula ? '#2563eb' : 'inherit',
            width: '100%',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
            lineHeight: '1.3'
        },
        title: isFormula ? "点击切换算式" : ""
    }, isFormula && !showFormula && React.createElement(IconCalculator, null), React.createElement("span", null, displayContent));
};

// --- 视图 1: 凭证表格 ---
var VoucherView = function VoucherView(_ref2) {
    var entries = _ref2.entries,
        totalDebit = _ref2.totalDebit,
        totalCredit = _ref2.totalCredit;
    return React.createElement("div", null, React.createElement("div", { className: "je-desktop je-table" }, React.createElement("div", { className: "je-row" }, React.createElement("div", { className: "je-header-cell" }, "\u6458\u8981\u4E0E\u79D1\u76EE"), React.createElement("div", { className: "je-header-cell", style: { textAlign: 'right' } }, "\u501F\u65B9"), React.createElement("div", { className: "je-header-cell", style: { textAlign: 'right', borderRight: 'none' } }, "\u8D37\u65B9")), entries.map(function (entry) {
        if (entry.type === 'comment-only') {
            return React.createElement("div", { key: entry.id, style: { padding: '6px 12px', backgroundColor: '#f8fafc', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' } }, "# ", entry.text);
        }
        var isDebit = entry.direction === 'debit';
        var badgeStyle = isDebit ? { backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' } : { backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };
        return React.createElement("div", { key: entry.id }, React.createElement("div", { className: "je-row", style: { borderBottom: entry.comment ? '1px dashed #e2e8f0' : '1px solid #e2e8f0' } }, React.createElement("div", { className: "je-cell" }, React.createElement("span", { className: "je-badge", style: badgeStyle }, entry.prefixStr), React.createElement("div", { style: { overflow: 'hidden' }, className: "je-bold" }, entry.phantomText && React.createElement("span", { className: "je-phantom" }, entry.phantomText), entry.visibleText)), React.createElement("div", { className: "je-money-cell", style: { borderRight: '1px solid #e2e8f0' } }, isDebit && React.createElement(MoneyCell, { amount: entry.amount })), React.createElement("div", { className: "je-money-cell" }, !isDebit && React.createElement(MoneyCell, { amount: entry.amount }))), entry.comment && React.createElement("div", { style: { backgroundColor: '#f8fafc', padding: '4px 12px 4px 42px', fontSize: '11px', color: '#64748b', borderBottom: '1px solid #e2e8f0' } }, "\u21B3 ", entry.comment));
    }), React.createElement("div", { className: "je-row", style: { backgroundColor: '#f8fafc', borderBottom: 'none' } }, React.createElement("div", { className: "je-header-cell", style: { textAlign: 'right', color: '#334155' } }, "\u5408\u8BA1"), React.createElement("div", { className: "je-money-cell", style: { borderRight: '1px solid #e2e8f0' } }, formatMoney(totalDebit)), React.createElement("div", { className: "je-money-cell" }, formatMoney(totalCredit)))), React.createElement("div", { className: "je-mobile", style: { backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '8px' } }, entries.map(function (entry) {
        if (entry.type === 'comment-only') return React.createElement("div", { key: entry.id, style: { marginBottom: '8px', padding: '8px', fontSize: '11px', color: '#64748b', border: '1px dashed #cbd5e1', borderRadius: '4px' } }, "# ", entry.text);
        var isDebit = entry.direction === 'debit';
        var stripeColor = isDebit ? '#3b82f6' : '#ef4444';
        var badgeStyle = isDebit ? { backgroundColor: '#eff6ff', color: '#2563eb', borderColor: '#dbeafe' } : { backgroundColor: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' };
        return React.createElement("div", { key: entry.id, className: "je-m-card" }, React.createElement("div", { className: "je-m-inner" }, React.createElement("div", { className: "je-m-stripe", style: { backgroundColor: stripeColor } }), React.createElement("div", { className: "je-m-content" }, React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, React.createElement("div", { style: { display: 'flex', alignItems: 'flex-start', flex: 1, paddingRight: '8px' } }, React.createElement("span", { className: "je-badge", style: Object.assign({}, badgeStyle, { marginTop: '2px' }) }, entry.prefixStr), React.createElement("div", { style: { lineHeight: '1.4', wordBreak: 'break-word' }, className: "je-bold" }, entry.phantomText && React.createElement("span", { className: "je-phantom" }, entry.phantomText), entry.visibleText)), React.createElement("div", { style: { flexShrink: 0, maxWidth: '45%', textAlign: 'right', fontWeight: 'bold', fontFamily: 'monospace', wordBreak: 'break-all' } }, React.createElement(MoneyCell, { amount: entry.amount }))), entry.comment && React.createElement("div", { style: { marginTop: '6px', fontSize: '11px', color: '#64748b', lineHeight: '1.4', paddingLeft: '2px' } }, "\u21B3 ", entry.comment))));
    }), React.createElement("div", { style: { backgroundColor: '#1e293b', color: '#fff', padding: '10px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' } }, React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '4px' } }, React.createElement("span", { style: { opacity: 0.7 } }, "\u501F\u65B9\u5408\u8BA1"), React.createElement("span", { style: { fontFamily: 'monospace' } }, formatMoney(totalDebit))), React.createElement("div", { style: { display: 'flex', justifyContent: 'space-between' } }, React.createElement("span", { style: { opacity: 0.7 } }, "\u8D37\u65B9\u5408\u8BA1"), React.createElement("span", { style: { fontFamily: 'monospace' } }, formatMoney(totalCredit))))));
};

// --- 视图 2: T型账户 ---
var TAccountView = function TAccountView(_ref3) {
    var accounts = _ref3.accounts;
    return React.createElement("div", { className: "t-grid" }, accounts.map(function (acc) {
        return React.createElement("div", { key: acc.name, className: "t-card" }, React.createElement("div", { className: "t-header" }, acc.name), React.createElement("div", { className: "t-body" }, React.createElement("div", { className: "t-column" }, acc.debits.map(function (d, i) {
            return React.createElement("div", { key: i, className: "t-item" }, React.createElement(MoneyCell, { amount: d }));
        }), React.createElement("div", { style: { flex: 1 } }), React.createElement("div", { className: "t-total-row" }, formatMoney(acc.sumDebit)), acc.balanceSide === 'debit' ? React.createElement("div", { className: "t-balance-row" }, "\u4F59: ", formatMoney(acc.absBalance)) : React.createElement("div", { className: "t-balance-row", style: { opacity: 0 } }, "-")), React.createElement("div", { className: "t-spine" }), React.createElement("div", { className: "t-column" }, acc.credits.map(function (c, i) {
            return React.createElement("div", { key: i, className: "t-item" }, React.createElement(MoneyCell, { amount: c }));
        }), React.createElement("div", { style: { flex: 1 } }), React.createElement("div", { className: "t-total-row" }, formatMoney(acc.sumCredit)), acc.balanceSide === 'credit' ? React.createElement("div", { className: "t-balance-row" }, "\u4F59: ", formatMoney(acc.absBalance)) : React.createElement("div", { className: "t-balance-row", style: { opacity: 0 } }, "-"))));
    }));
};

// ==========================================
// 5. 主逻辑
// ==========================================

var AccountingWidget = function AccountingWidget(_ref4) {
    var rawText = _ref4.rawText;
    useEffect(function () { return injectStyles(); }, []);

    var _useEntryParser = useEntryParser(rawText),
        entries = _useEntryParser.entries,
        totalDebit = _useEntryParser.totalDebit,
        totalCredit = _useEntryParser.totalCredit;

    var accounts = useDerivedTAccounts(entries);
    var _useState2 = useState('voucher'),
        view = _useState2[0],
        setView = _useState2[1];

    if (!rawText) return null;

    return React.createElement("div", { className: "je-wrapper" }, React.createElement("div", { className: "je-toolbar" }, React.createElement("div", {
        className: "je-tab ".concat(view === 'voucher' ? 'active' : ''), onClick: function onClick() {
            return setView('voucher');
        }
    }, "\uD83D\uDCDD \u4F1A\u8BA1\u5206\u5F55"), React.createElement("div", {
        className: "je-tab ".concat(view === 't-account' ? 'active' : ''), onClick: function onClick() {
            return setView('t-account');
        }
    }, "\uD83D\uDCCA T\u578B\u8D26\u6237")), view === 'voucher' ? React.createElement(VoucherView, { entries: entries, totalDebit: totalDebit, totalCredit: totalCredit }) : React.createElement(TAccountView, { accounts: accounts }));
};

var mountAccounting = function mountAccounting() {
    var selector = "pre.je-source, pre.je-t-account";
    document.querySelectorAll(selector).forEach(function (preBlock) {
        if (preBlock.hasAttribute("data-je-processed")) return;
        var codeElement = preBlock.querySelector("code");
        if (!codeElement) return;

        var rawText = codeElement.innerText;
        var container = document.createElement("div");
        preBlock.parentNode.insertBefore(container, preBlock);
        preBlock.style.display = "none";
        preBlock.setAttribute("data-je-processed", "true");

        var root = ReactDOM.createRoot(container);
        root.render(React.createElement(AccountingWidget, { rawText: rawText }));
    });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAccounting);
else mountAccounting();
if (window.document$) window.document$.subscribe(function () { return setTimeout(mountAccounting, 100); });