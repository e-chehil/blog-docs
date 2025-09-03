#!/usr/bin/env python3
"""
mkdocs_generate_course_docs.py

读取 data/ 下的 CSV 文件，按 12 点 -> 9 点的映射关系，为每门课程生成 MkDocs（Material）需要的 Markdown 页面：
- docs/index.md               (课程索引)
- docs/courses/<course_code>.md  (每门课程的对照表)
- 可选：根据需要写入/更新 mkdocs.yml（可通过 --overwrite-mkdocs 打开覆盖）

使用方法：
    python mkdocs_generate_course_docs.py --data data --docs docs

依赖：
    pandas

CSV 约定（请确保列名准确）:
1) data/twelve_requirements.csv: twelve_id,twelve_text
2) data/map_12_to_9.csv: twelve_id,nine_id
3) data/courses_12.csv: course_code,course_name,twelve_id
4) data/assessments_9.csv: course_code,course_name,nine_id,assessment_method

可选（若有）：
- data/nine_requirements.csv: nine_id,nine_text  （如果没有，脚本会把 nine_text 留空）

脚本行为要点：
- 对 CSV 做基本校验，缺列会报错并退出。
- 允许 1:n 的映射（一个 twelve_id 对应多个 nine_id 会展开成多行）。
- 若 assessments_9 中没有某一项（或 map 中没有 nine_id），会在输出中标注为“未提供”。
- 生成的 Markdown 表格包含：12点编号、文字表述、9点编号、（若有）9点文字表述、考核方式。

请把此脚本放在你的 MkDocs 项目根目录下（或任意你喜欢的位置），确保`data/`目录的 CSV 文件就位，然后运行本脚本。

"""

from pathlib import Path
import argparse
import sys
import pandas as pd
from textwrap import dedent


def escape_md(s):
    if s is None:
        return ""
    if pd.isna(s):
        return ""
    s = str(s)
    s = s.replace("\n", " ")
    s = s.replace("|", "\\|")
    return s.strip()


def read_csv_validate(path: Path, required_cols):
    if not path.exists():
        raise FileNotFoundError(f"Required file not found: {path}")
    df = pd.read_csv(path, dtype=str, encoding="utf-8").fillna("")
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        raise ValueError(f"File {path} is missing required columns: {missing}")
    return df


def ensure_dir(p: Path):
    if not p.exists():
        p.mkdir(parents=True, exist_ok=True)


def generate_course_markdown(course_code, course_name, df_course_rows, out_path: Path):
    """生成单门课程的 Markdown 文件，包含对照表和说明。"""
    title = f"# {course_code} — {course_name}\n"
    note = (
        "**转换说明：**以下表格把原 12 点体系下课程包含的小项，按照`map_12_to_9.csv`中的转换关系，"\
        "列出对应的 9 点编号，并在最后一列显示该 9 点项在`assessments_9.csv`中的考核方式。\n"
    )

    md_lines = [title, "\n", note, "\n"]

    # Conversion summary (unique mapping of twelve->nine for this course)
    mapping_rows = df_course_rows[['twelve_id', 'nine_id']].drop_duplicates()

    # Main table header
    md_lines.append("## 详细对照表\n\n")
    md_lines.append("| ⑫编号 | ⑫表述 | ⑨编号 | ⑨表述 | 方式 |\n")
    md_lines.append("|:---:|:---:|:---:|:---:|:---:|\n")

    # Deduplicate meaningful rows (保留全部组合)
    rows = df_course_rows[['twelve_id','twelve_text','nine_id','nine_text','assessment_method']]
    rows = rows.drop_duplicates()
    # --- 排序 ---
    def sort_key(s):
        return tuple(int(p) for p in s.split('.'))
    rows = rows.sort_values(by='twelve_id', key=lambda col: col.map(sort_key))
    # ----------------
    if rows.empty:
        md_lines.append("| — | — | — | — | — |\n")
    else:
        for _, r in rows.iterrows():
            t_id = escape_md(r['twelve_id']) or '—'
            t_text = escape_md(r.get('twelve_text','')) or '未提供'
            n_id = escape_md(r.get('nine_id','')) or '—'
            n_text = escape_md(r.get('nine_text','')) or '未提供'
            assess = escape_md(r.get('assessment_method','')) or '未提供'
            md_lines.append(f"| {t_id} | {t_text} | {n_id} | {n_text} | {assess} |\n")
    md_lines.append("\n---\n\n")
    md_lines.append("注：若某列显示“未提供”，说明对应的原始 CSV 中没有相关条目。检查`data/`目录下的文件是否完整。\n")

    out_path.write_text(''.join(md_lines), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description='Generate MkDocs pages for course requirement mappings')
    parser.add_argument('--data', default='data', help='data directory (default: data)')
    parser.add_argument('--docs', default='docs', help='docs output directory (default: docs)')
    parser.add_argument('--overwrite-mkdocs', action='store_true', help='overwrite mkdocs.yml if present')
    args = parser.parse_args()

    data_dir = Path(args.data)
    docs_dir = Path(args.docs)
    courses_out_dir = docs_dir / 'courses'

    # Required files
    twelve_path = data_dir / 'twelve_requirements.csv'
    map_path = data_dir / 'map_12_to_9.csv'
    courses12_path = data_dir / 'courses_12.csv'
    assessments9_path = data_dir / 'assessments_9.csv'
    nine_path = data_dir / 'nine_requirements.csv'  # optional

    # Read and validate
    try:
        twelve_df = read_csv_validate(twelve_path, ['twelve_id','twelve_text'])
        map_df = read_csv_validate(map_path, ['twelve_id','nine_id'])
        courses12_df = read_csv_validate(courses12_path, ['course_code','course_name','twelve_id'])
        assessments9_df = read_csv_validate(assessments9_path, ['course_code','course_name','nine_id','assessment_method'])
        have_nine_text = False
        if nine_path.exists():
            nine_df = read_csv_validate(nine_path, ['nine_id','nine_text'])
            have_nine_text = True
        else:
            nine_df = pd.DataFrame(columns=['nine_id','nine_text'])
    except Exception as e:
        print(f"Error reading/validating CSV files: {e}", file=sys.stderr)
        sys.exit(2)

    # Merge steps
    # courses12_df: each row is a pair (course, twelve_id)
    df = courses12_df.merge(twelve_df, on='twelve_id', how='left')
    df = df.merge(map_df, on='twelve_id', how='left')
    if have_nine_text:
        df = df.merge(nine_df, on='nine_id', how='left')
    else:
        df['nine_text'] = ''

    # Merge assessment method by (course_code, nine_id)
    assessments_small = assessments9_df[['course_code','nine_id','assessment_method']].copy()
    df = df.merge(assessments_small, on=['course_code','nine_id'], how='left')

    # ⚡ 新增筛选：仅保留课程实际考核的 9 点
    df = df[df['assessment_method'].notna() & (df['assessment_method'] != '')]

    # Prepare output directories
    ensure_dir(docs_dir)
    ensure_dir(courses_out_dir)

    # For each course, generate markdown
    courses = df[['course_code','course_name']].drop_duplicates().sort_values(['course_code'])
    for _, c in courses.iterrows():
        code = c['course_code']
        name = c['course_name']
        sub = df[df['course_code']==code].copy()
        # sort for readability
        sub = sub.sort_values(['twelve_id','nine_id'])
        out_file = courses_out_dir / f"{code}.md"
        generate_course_markdown(code, name, sub, out_file)
        print(f"Wrote {out_file}")

    # Generate index.md
    index_lines = ["# 课程毕业要求对照（12 点 -> 9 点）\n\n"]
    index_lines.append("本页面列出所有课程，并链接到每门课程的详细对照页面。\n\n")
    index_lines.append("## 课程列表\n\n")
    for _, c in courses.iterrows():
        code = c['course_code']
        name = c['course_name']
        # MkDocs uses relative links from index.md to docs/courses/<code>.md
        link = f"courses/{code}.md"
        index_lines.append(f"- [{code} — {name}]({link})\n")

    index_path = docs_dir / 'index.md'
    index_path.write_text(''.join(index_lines), encoding='utf-8')
    print(f"Wrote {index_path}")

    # Optionally generate mkdocs.yml (if not present or overwrite requested)
    mkdocs_path = Path('mkdocs.yml')
    if not mkdocs_path.exists() or args.overwrite_mkdocs:
        nav_lines = ['nav:', "  - Home: index.md", "  - Courses:"]
        for _, c in courses.iterrows():
            code = c['course_code']
            name = c['course_name']
            # Put course title as key with path value
            nav_lines.append(f"    - '{code} — {name}': 'courses/{code}.md'")
        nav_block = "\n".join(nav_lines)
        mkdocs_content = dedent(f"""\
        site_name: "毕业要求对照（12->9）"
        theme:
        name: material
        {nav_block}
        plugins: [search]
        """)
        mkdocs_path.write_text(mkdocs_content, encoding='utf-8')
        print(f"Wrote {mkdocs_path}")
    else:
        print(f"mkdocs.yml exists and overwrite not requested; skipping mkdocs.yml generation.")

    print('\nDone. 现在运行 `mkdocs serve` 在本地预览（需安装 mkdocs 和 mkdocs-material）。')


if __name__ == '__main__':
    main()
