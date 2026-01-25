/**
 * JE-Quiz Render v2.0 (Compiled to Native JS)
 * 已编译为原生 JS，无需 Babel 运行时，速度更快。
 */
"use strict";

var _React = React,
    useState = _React.useState,
    useMemo = _React.useMemo,
    useEffect = _React.useEffect;

// --- 1. 工具函数 ---

// Fisher-Yates 洗牌算法
var shuffleArray = function shuffleArray(array) {
    var arr = [].concat(array);
    for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var _ref = [arr[j], arr[i]];
        arr[i] = _ref[0];
        arr[j] = _ref[1];
    }
    return arr;
};

// --- 2. 核心解析逻辑 ---

var parseQuizData = function parseQuizData(text) {
    var blocks = text.split(/\n\s*\n/);
    return blocks.map(function (block, index) {
        var lines = block.split('\n');
        var questionLines = [];
        var options = [];
        var explanation = '';
        var step = 'question';

        lines.forEach(function (line) {
            var raw = line.trim();
            if (!raw) return;

            // 解析说明/解析部分
            if (raw.startsWith('>') || raw.startsWith('？') || raw.startsWith('?')) {
                step = 'explanation';
                explanation += raw.replace(/^[>？?]\s*/, '') + '\n';
                return;
            }

            // 解析选项
            var optMatch = raw.match(/^([\*\-])\s+(.*)/);
            if (optMatch) {
                step = 'options';
                var isCorrect = optMatch[1] === '*';
                var content = optMatch[2].trim();
                options.push({
                    id: "opt-".concat(Math.random().toString(36).substr(2, 9)),
                    text: content,
                    isCorrect: isCorrect
                });
                return;
            }

            if (step === 'question') questionLines.push(raw); else if (step === 'explanation') explanation += raw + '\n';
        });

        var correctCount = options.filter(function (o) {
            return o.isCorrect;
        }).length;
        var type = correctCount > 1 ? 'multi' : 'single';

        return {
            id: index,
            type: type,
            question: questionLines.join('\n'),
            originalOptions: options,
            explanation: explanation.trim()
        };
    }).filter(function (q) {
        return q.originalOptions.length > 0;
    });
};

// --- 3. 新版样式注入 ---

var injectQuizStyles = function injectQuizStyles() {
    var styleId = 'je-quiz-styles-refined';
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = "\n        :root {\n            --jq-primary: #3b82f6;       /* \u4E3B\u8272\u8C03 Blue */\n            --jq-primary-bg: #eff6ff;\n            --jq-success: #10b981;       /* \u6B63\u786E Green */\n            --jq-success-bg: #ecfdf5;\n            --jq-error: #ef4444;         /* \u9519\u8BEF Red */\n            --jq-error-bg: #fef2f2;\n            --jq-missed: #f59e0b;        /* \u6F0F\u9009 Amber */\n            --jq-missed-bg: #fffbeb;\n            --jq-border: #e2e8f0;\n            --jq-text-main: #334155;\n            --jq-text-muted: #64748b;\n        }\n\n        .jq-container {\n            font-family: -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif;\n            max-width: 100%;\n            margin: 1.5rem 0;\n        }\n\n        /* \u5361\u7247\u5BB9\u5668 */\n        .jq-card {\n            background: #fff;\n            border: 1px solid var(--jq-border);\n            border-radius: 8px;\n            padding: 20px;\n            margin-bottom: 24px;\n            box-shadow: 0 1px 3px rgba(0,0,0,0.04);\n            transition: box-shadow 0.2s;\n        }\n        .jq-card:hover {\n            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);\n        }\n\n        /* \u5934\u90E8 */\n        .jq-header {\n            display: flex;\n            justify-content: space-between;\n            align-items: flex-start;\n            margin-bottom: 16px;\n            gap: 12px;\n        }\n        .jq-question {\n            font-size: .8rem;\n            font-weight: 600;\n            color: #1e293b;\n            line-height: 1.6;\n            white-space: pre-wrap;\n            flex: 1;\n        }\n        .jq-badge {\n            font-size: .6rem;\n            font-weight: 700;\n            padding: 2px 8px;\n            border-radius: 99px;\n            text-transform: uppercase;\n            letter-spacing: 0.05em;\n            flex-shrink: 0;\n            margin-top: 4px;\n        }\n        .jq-badge.single { background: var(--jq-primary-bg); color: var(--jq-primary); border: 1px solid #dbeafe; }\n        .jq-badge.multi { background: #f3e8ff; color: #9333ea; border: 1px solid #e9d5ff; }\n\n        /* \u9009\u9879\u5217\u8868 */\n        .jq-options {\n            display: flex;\n            flex-direction: column;\n            gap: 8px;\n        }\n\n        /* \u9009\u9879\u6761\u76EE */\n        .jq-opt {\n            display: flex;\n            align-items: flex-start;\n            padding: 10px 12px;\n            border-radius: 6px;\n            border: 1px solid transparent;\n            cursor: pointer;\n            transition: all 0.15s ease-in-out;\n            background-color: transparent;\n        }\n\n        .jq-opt:not(.disabled):hover {\n            background-color: #f8fafc;\n        }\n\n        .jq-opt.selected {\n            background-color: var(--jq-primary-bg);\n            border-color: #bfdbfe;\n        }\n\n        /* \u56FE\u6807\u533A\u57DF */\n        .jq-icon-box {\n            font-size: .8rem;\n            height: 1.5em;\n            width: 20px;\n            margin-top: 0;\n            margin-right: 12px;\n            flex-shrink: 0;\n            display: flex;\n            align-items: center;\n            justify-content: center;\n            color: #94a3b8;\n            transition: color 0.2s;\n        }\n        .jq-opt.selected .jq-icon-box {\n            color: var(--jq-primary);\n        }\n\n        /* \u6587\u672C */\n        .jq-text {\n            font-size: .8rem;\n            color: var(--jq-text-main);\n            line-height: 1.5;\n            flex: 1;\n        }\n\n        /* --- \u7ED3\u679C\u72B6\u6001 --- */\n        .jq-opt.disabled { cursor: default; }\n\n        .jq-opt.status-correct {\n            background-color: var(--jq-success-bg);\n            border-color: #a7f3d0;\n        }\n        .jq-opt.status-correct .jq-icon-box { color: var(--jq-success); }\n        .jq-opt.status-correct .jq-text { color: #065f46; font-weight: 500; }\n\n        .jq-opt.status-wrong {\n            background-color: var(--jq-error-bg);\n            border-color: #fecaca;\n        }\n        .jq-opt.status-wrong .jq-icon-box { color: var(--jq-error); }\n        .jq-opt.status-wrong .jq-text { color: #991b1b; text-decoration: line-through; opacity: 0.8; }\n\n        .jq-opt.status-missed {\n            background-color: #fff;\n            border: 1px dashed var(--jq-missed);\n        }\n        .jq-opt.status-missed .jq-icon-box { color: var(--jq-missed); }\n        .jq-opt.status-missed .jq-text { color: #92400e; }\n\n        /* \u5E95\u90E8\u64CD\u4F5C\u533A */\n        .jq-footer {\n            margin-top: 20px;\n            padding-top: 16px;\n            border-top: 1px solid #f1f5f9;\n        }\n\n        .jq-btn {\n            background: #1e293b;\n            color: #fff;\n            border: none;\n            padding: 8px 16px;\n            border-radius: 6px;\n            font-size: .8rem;\n            font-weight: 600;\n            cursor: pointer;\n            transition: background 0.2s, transform 0.1s;\n        }\n        .jq-btn:hover { background: #334155; }\n        .jq-btn:active { transform: translateY(1px); }\n        .jq-btn:disabled { background: #cbd5e1; cursor: not-allowed; opacity: 0.7; }\n\n        /* \u89E3\u6790\u6846 */\n        .jq-explanation {\n            margin-top: 16px;\n            font-size: .8rem;\n            color: var(--jq-text-main);\n            background: #f8fafc;\n            padding: 12px 16px;\n            border-radius: 6px;\n            border-left: 3px solid var(--jq-primary);\n            animation: fadeIn 0.3s ease;\n        }\n        .jq-exp-label { font-weight: 700; color: #1e293b; margin-right: 4px; }\n\n        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }\n\n        @media (max-width: 600px) {\n            .jq-card { padding: 16px; }\n            .jq-opt { padding: 8px 10px; }\n        }\n    ";
    document.head.appendChild(style);
};

// --- 4. SVG 图标组件 ---
// 使用 React.createElement 替代 JSX

var Icons = {
    RadioUnchecked: function RadioUnchecked() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("circle", { cx: "12", cy: "12", r: "9" }));
    },
    RadioChecked: function RadioChecked() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "currentColor", stroke: "none" }, React.createElement("path", { d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm4-8c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4z" }));
    },
    CheckUnchecked: function CheckUnchecked() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }));
    },
    CheckChecked: function CheckChecked() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("path", { d: "M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" }), React.createElement("polyline", { points: "9 11 12 14 22 4" }));
    },
    ResultCorrect: function ResultCorrect() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("polyline", { points: "20 6 9 17 4 12" }));
    },
    ResultWrong: function ResultWrong() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" }));
    },
    ResultMissed: function ResultMissed() {
        return React.createElement("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }, React.createElement("circle", { cx: "12", cy: "12", r: "10" }), React.createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }), React.createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" }));
    }
};

// --- 5. 组件逻辑 ---

var QuizCard = function QuizCard(_ref2) {
    var data = _ref2.data;

    var _useState = useState(new Set()),
        selectedIds = _useState[0],
        setSelectedIds = _useState[1];

    var _useState2 = useState(false),
        isSubmitted = _useState2[0],
        setIsSubmitted = _useState2[1];

    // 只在初始化时洗牌一次
    var shuffledOptions = useMemo(function () {
        return shuffleArray(data.originalOptions);
    }, [data.originalOptions]);

    var handleToggle = function handleToggle(optId) {
        if (isSubmitted) return;
        var newSet = new Set(selectedIds);

        if (data.type === 'single') {
            newSet.clear();
            newSet.add(optId);
        } else {
            if (newSet.has(optId)) newSet.delete(optId); else newSet.add(optId);
        }
        setSelectedIds(newSet);
    };

    // 获取当前选项的渲染状态
    var getOptionState = function getOptionState(opt) {
        var isSelected = selectedIds.has(opt.id);

        if (!isSubmitted) {
            return {
                className: isSelected ? 'selected' : '',
                icon: data.type === 'single' ? isSelected ? React.createElement(Icons.RadioChecked, null) : React.createElement(Icons.RadioUnchecked, null) : isSelected ? React.createElement(Icons.CheckChecked, null) : React.createElement(Icons.CheckUnchecked, null)
            };
        }

        // 提交后逻辑
        if (isSelected && opt.isCorrect) {
            return { className: 'status-correct disabled', icon: React.createElement(Icons.ResultCorrect, null) };
        }
        if (isSelected && !opt.isCorrect) {
            return { className: 'status-wrong disabled', icon: React.createElement(Icons.ResultWrong, null) };
        }
        if (!isSelected && opt.isCorrect) {
            return { className: 'status-missed disabled', icon: React.createElement(Icons.ResultMissed, null) };
        }

        // 未选中且不是正确答案 (普通禁用)
        return {
            className: 'disabled',
            icon: data.type === 'single' ? React.createElement(Icons.RadioUnchecked, null) : React.createElement(Icons.CheckUnchecked, null)
        };
    };

    return React.createElement("div", { className: "jq-card" }, React.createElement("div", { className: "jq-header" }, React.createElement("div", { className: "jq-question" }, data.question), React.createElement("div", { className: "jq-badge ".concat(data.type) }, data.type === 'single' ? 'Single' : 'Multi')), React.createElement("div", { className: "jq-options" }, shuffledOptions.map(function (opt) {
        var _getOptionState = getOptionState(opt),
            className = _getOptionState.className,
            icon = _getOptionState.icon;

        return React.createElement("div", {
            key: opt.id,
            className: "jq-opt ".concat(className),
            onClick: function onClick() {
                return handleToggle(opt.id);
            }
        }, React.createElement("div", { className: "jq-icon-box" }, icon), React.createElement("div", { className: "jq-text" }, opt.text));
    })), React.createElement("div", { className: "jq-footer" }, !isSubmitted ? React.createElement("button", {
        className: "jq-btn",
        onClick: function onClick() {
            return setIsSubmitted(true);
        },
        disabled: selectedIds.size === 0
    }, "Check Answer") : React.createElement("div", { className: "jq-explanation" }, React.createElement("span", { className: "jq-exp-label" }, "\u89E3\u6790\uFF1A"), data.explanation || '暂无详细解析')));
};

var QuizBlock = function QuizBlock(_ref3) {
    var rawText = _ref3.rawText;
    useEffect(function () {
        return injectQuizStyles();
    }, []);
    var questions = useMemo(function () {
        return parseQuizData(rawText);
    }, [rawText]);

    if (!questions.length) return null;

    return React.createElement("div", { className: "jq-container" }, questions.map(function (q) {
        return React.createElement(QuizCard, { key: q.id, data: q });
    }));
};

// --- 6. 挂载逻辑 ---

var renderQuizzes = function renderQuizzes() {
    var rawBlocks = document.querySelectorAll("pre.je-quiz");
    rawBlocks.forEach(function (preBlock) {
        if (preBlock.hasAttribute("data-je-processed")) return;

        var codeElement = preBlock.querySelector("code");
        if (!codeElement) return;
        var rawText = codeElement.innerText;

        var container = document.createElement("div");
        preBlock.parentNode.insertBefore(container, preBlock);

        preBlock.style.display = "none";
        preBlock.setAttribute("data-je-processed", "true");

        var root = ReactDOM.createRoot(container);
        root.render(React.createElement(QuizBlock, { rawText: rawText }));
    });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderQuizzes); else renderQuizzes();
if (window.document$) window.document$.subscribe(function () {
    return setTimeout(renderQuizzes, 100);
});