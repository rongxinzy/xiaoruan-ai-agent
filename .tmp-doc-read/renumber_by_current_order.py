from pathlib import Path
import re


root = Path(r"C:\documents\xiaoruan")
source = min(root.glob("*.md"), key=lambda path: path.stat().st_size)
lines = source.read_text(encoding="utf-8").splitlines()

section_numbers = {
    "产品概述": 1,
    "安装与启动": 2,
    "界面导航": 3,
    "协作工作台 (Cowork)": 4,
    "定时任务 (Scheduled Tasks)": 5,
    "预设专家 (Experts)": 6,
    "技能管理 (Skills)": 7,
    "MCP 服务器组": 8,
    "设置面板": 9,
    "即时通讯集成 (IM Bot)": 10,
    "数据备份与恢复": 11,
    "故障排查": 12,
    "编程工作台": 13,
}

current_section = None
subsection_index = 0
output = []

for line in lines:
    match = re.match(r"^(##) \d+\. (.+)$", line)
    if match and match.group(2) in section_numbers:
        current_section = section_numbers[match.group(2)]
        subsection_index = 0
        output.append(f"## {current_section}. {match.group(2)}")
        continue

    match = re.match(r"^(###) \d+\.\d+ (.+)$", line)
    if match and current_section is not None:
        subsection_index += 1
        output.append(f"### {current_section}.{subsection_index} {match.group(2)}")
        continue

    match = re.match(r"^(####) \d+\.\d+\.\d+ (.+)$", line)
    if match and current_section is not None:
        output.append(f"#### {current_section}.{subsection_index}.{len([x for x in output if x.startswith(f'#### {current_section}.{subsection_index}.')]) + 1} {match.group(2)}")
        continue

    output.append(line)

Path(".tmp-doc-read/manual-renumbered-current-order.md").write_text(
    "\n".join(output) + "\n", encoding="utf-8"
)
