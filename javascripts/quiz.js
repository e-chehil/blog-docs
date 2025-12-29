const { useState, useMemo, useEffect } = React;

// --- 1. 工具函数 (保留原有逻辑) ---

// Fisher-Yates 洗牌算法
const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

// --- 2. 核心解析逻辑 (保留原有逻辑) ---

const parseQuizData = (text) => {
    const blocks = text.split(/\n\s*\n/);
    return blocks.map((block, index) => {
        const lines = block.split('\n');
        let questionLines = [];
        let options = [];
        let explanation = '';
        let step = 'question';

        lines.forEach(line => {
            const raw = line.trim();
            if (!raw) return;

            // 解析说明/解析部分
            if (raw.startsWith('>') || raw.startsWith('？') || raw.startsWith('?')) {
                step = 'explanation';
                explanation += raw.replace(/^[>？?]\s*/, '') + '\n';
                return;
            }

            // 解析选项
            const optMatch = raw.match(/^([\*\-])\s+(.*)/);
            if (optMatch) {
                step = 'options';
                const isCorrect = optMatch[1] === '*';
                const content = optMatch[2].trim();
                options.push({
                    id: `opt-${Math.random().toString(36).substr(2, 9)}`,
                    text: content,
                    isCorrect: isCorrect
                });
                return;
            }

            if (step === 'question') questionLines.push(raw);
            else if (step === 'explanation') explanation += raw + '\n';
        });

        const correctCount = options.filter(o => o.isCorrect).length;
        const type = correctCount > 1 ? 'multi' : 'single';

        return {
            id: index,
            type,
            question: questionLines.join('\n'),
            originalOptions: options,
            explanation: explanation.trim()
        };
    }).filter(q => q.originalOptions.length > 0);
};

// --- 3. 新版样式注入 (Refined UI) ---

const injectQuizStyles = () => {
    const styleId = 'je-quiz-styles-refined';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        :root {
            --jq-primary: #3b82f6;       /* 主色调 Blue */
            --jq-primary-bg: #eff6ff;
            --jq-success: #10b981;       /* 正确 Green */
            --jq-success-bg: #ecfdf5;
            --jq-error: #ef4444;         /* 错误 Red */
            --jq-error-bg: #fef2f2;
            --jq-missed: #f59e0b;        /* 漏选 Amber */
            --jq-missed-bg: #fffbeb;
            --jq-border: #e2e8f0;
            --jq-text-main: #334155;
            --jq-text-muted: #64748b;
        }

        .jq-container {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            max-width: 100%;
            margin: 1.5rem 0;
        }

        /* 卡片容器：更轻量，去除厚重边框，使用轻微阴影 */
        .jq-card {
            background: #fff;
            border: 1px solid var(--jq-border);
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.04);
            transition: box-shadow 0.2s;
        }
        .jq-card:hover {
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.06);
        }

        /* 头部：题目与标签 */
        .jq-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 16px;
            gap: 12px;
        }
        .jq-question {
            font-size: .8rem;
            font-weight: 600;
            color: #1e293b;
            line-height: 1.6;
            white-space: pre-wrap;
            flex: 1;
        }
        .jq-badge {
            font-size: .6rem;
            font-weight: 700;
            padding: 2px 8px;
            border-radius: 99px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            flex-shrink: 0;
            margin-top: 4px;
        }
        .jq-badge.single { background: var(--jq-primary-bg); color: var(--jq-primary); border: 1px solid #dbeafe; }
        .jq-badge.multi { background: #f3e8ff; color: #9333ea; border: 1px solid #e9d5ff; }

        /* 选项列表 */
        .jq-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        /* 选项条目：更加扁平，类似 Notion List */
        .jq-opt {
            display: flex;
            align-items: flex-start;
            padding: 10px 12px;
            border-radius: 6px;
            border: 1px solid transparent;
            cursor: pointer;
            transition: all 0.15s ease-in-out;
            background-color: transparent;
        }

        /* 悬停效果 (未提交时) */
        .jq-opt:not(.disabled):hover {
            background-color: #f8fafc;
        }

        /* 选中状态 (未提交时) */
        .jq-opt.selected {
            background-color: var(--jq-primary-bg);
            border-color: #bfdbfe;
        }

        /* 图标区域 */
        .jq-icon-box {
            font-size: .8rem;
            height: 1.5em;
            width: 20px;
            margin-top: 0;
            margin-right: 12px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            transition: color 0.2s;
        }
        .jq-opt.selected .jq-icon-box {
            color: var(--jq-primary);
        }

        /* 文本 */
        .jq-text {
            font-size: .8rem;
            color: var(--jq-text-main);
            line-height: 1.5;
            flex: 1;
        }

        /* --- 提交后的状态 (Result States) --- */
        .jq-opt.disabled { cursor: default; }

        /* 正确且已选 */
        .jq-opt.status-correct {
            background-color: var(--jq-success-bg);
            border-color: #a7f3d0;
        }
        .jq-opt.status-correct .jq-icon-box { color: var(--jq-success); }
        .jq-opt.status-correct .jq-text { color: #065f46; font-weight: 500; }

        /* 错误且已选 */
        .jq-opt.status-wrong {
            background-color: var(--jq-error-bg);
            border-color: #fecaca;
        }
        .jq-opt.status-wrong .jq-icon-box { color: var(--jq-error); }
        .jq-opt.status-wrong .jq-text { color: #991b1b; text-decoration: line-through; opacity: 0.8; }

        /* 漏选 (正确但未选) */
        .jq-opt.status-missed {
            background-color: #fff;
            border: 1px dashed var(--jq-missed);
        }
        .jq-opt.status-missed .jq-icon-box { color: var(--jq-missed); }
        .jq-opt.status-missed .jq-text { color: #92400e; }

        /* 底部操作区 */
        .jq-footer {
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid #f1f5f9;
        }

        .jq-btn {
            background: #1e293b; /* 深色按钮更显质感 */
            color: #fff;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            font-size: .8rem;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s, transform 0.1s;
        }
        .jq-btn:hover { background: #334155; }
        .jq-btn:active { transform: translateY(1px); }
        .jq-btn:disabled { background: #cbd5e1; cursor: not-allowed; opacity: 0.7; }

        /* 解析框 */
        .jq-explanation {
            margin-top: 16px;
            font-size: .8rem;
            color: var(--jq-text-main);
            background: #f8fafc;
            padding: 12px 16px;
            border-radius: 6px;
            border-left: 3px solid var(--jq-primary);
            animation: fadeIn 0.3s ease;
        }
        .jq-exp-label { font-weight: 700; color: #1e293b; margin-right: 4px; }

        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

        /* 移动端微调 */
        @media (max-width: 600px) {
            .jq-card { padding: 16px; }
            .jq-opt { padding: 8px 10px; }
        }
    `;
    document.head.appendChild(style);
};

// --- 4. SVG 图标组件 ---
// 使用 SVG Path 绘制图标，确保在任何分辨率下都清晰

const Icons = {
    // 单选：未选中 (圆环)
    RadioUnchecked: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"></circle></svg>
    ),
    // 单选：选中 (圆环+点)
    RadioChecked: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm4-8c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4z" /></svg>
    ),
    // 多选：未选中 (方框)
    CheckUnchecked: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
    ),
    // 多选：选中 (方框+勾)
    CheckChecked: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path><polyline points="9 11 12 14 22 4"></polyline></svg>
    ),
    // 结果：正确 (勾)
    ResultCorrect: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    ),
    // 结果：错误 (叉)
    ResultWrong: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    ),
    // 结果：漏选 (感叹号圆圈)
    ResultMissed: () => (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
    )
};

// --- 5. 组件逻辑 ---

const QuizCard = ({ data }) => {
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [isSubmitted, setIsSubmitted] = useState(false);

    // 只在初始化时洗牌一次
    const shuffledOptions = useMemo(() => shuffleArray(data.originalOptions), [data.originalOptions]);

    const handleToggle = (optId) => {
        if (isSubmitted) return;
        const newSet = new Set(selectedIds);

        if (data.type === 'single') {
            newSet.clear();
            newSet.add(optId);
        } else {
            if (newSet.has(optId)) newSet.delete(optId);
            else newSet.add(optId);
        }
        setSelectedIds(newSet);
    };

    // 获取当前选项的渲染状态
    const getOptionState = (opt) => {
        const isSelected = selectedIds.has(opt.id);

        if (!isSubmitted) {
            return {
                className: isSelected ? 'selected' : '',
                icon: data.type === 'single'
                    ? (isSelected ? <Icons.RadioChecked /> : <Icons.RadioUnchecked />)
                    : (isSelected ? <Icons.CheckChecked /> : <Icons.CheckUnchecked />)
            };
        }

        // 提交后逻辑
        if (isSelected && opt.isCorrect) {
            return { className: 'status-correct disabled', icon: <Icons.ResultCorrect /> };
        }
        if (isSelected && !opt.isCorrect) {
            return { className: 'status-wrong disabled', icon: <Icons.ResultWrong /> };
        }
        if (!isSelected && opt.isCorrect) {
            return { className: 'status-missed disabled', icon: <Icons.ResultMissed /> };
        }

        // 未选中且不是正确答案 (普通禁用)
        return {
            className: 'disabled',
            icon: data.type === 'single' ? <Icons.RadioUnchecked /> : <Icons.CheckUnchecked />
        };
    };

    return (
        <div className="jq-card">
            <div className="jq-header">
                <div className="jq-question">{data.question}</div>
                <div className={`jq-badge ${data.type}`}>
                    {data.type === 'single' ? 'Single' : 'Multi'}
                </div>
            </div>

            <div className="jq-options">
                {shuffledOptions.map((opt) => {
                    const { className, icon } = getOptionState(opt);
                    return (
                        <div
                            key={opt.id}
                            className={`jq-opt ${className}`}
                            onClick={() => handleToggle(opt.id)}
                        >
                            <div className="jq-icon-box">{icon}</div>
                            <div className="jq-text">{opt.text}</div>
                        </div>
                    );
                })}
            </div>

            <div className="jq-footer">
                {!isSubmitted ? (
                    <button
                        className="jq-btn"
                        onClick={() => setIsSubmitted(true)}
                        disabled={selectedIds.size === 0}
                    >
                        Check Answer
                    </button>
                ) : (
                    <div className="jq-explanation">
                        <span className="jq-exp-label">解析：</span>
                        {data.explanation || '暂无详细解析'}
                    </div>
                )}
            </div>
        </div>
    );
};

const QuizBlock = ({ rawText }) => {
    useEffect(() => injectQuizStyles(), []);
    const questions = useMemo(() => parseQuizData(rawText), [rawText]);

    if (!questions.length) return null;

    return (
        <div className="jq-container">
            {questions.map(q => <QuizCard key={q.id} data={q} />)}
        </div>
    );
};

// --- 6. 挂载逻辑 ---

const renderQuizzes = () => {
    const rawBlocks = document.querySelectorAll("pre.je-quiz");
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
        root.render(<QuizBlock rawText={rawText} />);
    });
};

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", renderQuizzes);
else renderQuizzes();
if (window.document$) window.document$.subscribe(() => setTimeout(renderQuizzes, 100));