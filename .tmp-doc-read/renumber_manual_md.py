from pathlib import Path
import re


source = min(Path(r"C:\documents\xiaoruan").glob("*.md"), key=lambda path: path.stat().st_size)
lines = source.read_text(encoding="utf-8").splitlines()


def renumber_heading(line):
    match = re.match(r"^(##|###) (\d+)(\.(?:\d+)?)\s+(.*)$", line)
    if not match:
        if line.startswith("### 模型来源或平台连接异常"):
            return "### 13.4 模型来源或平台连接异常"
        return line
    level, number, suffix, title = match.groups()
    number = int(number)
    if number == 6 and level == "###":
        number = 5
        suffix = ".4"
    elif 7 <= number <= 14:
        number -= 1
    elif number == 15 and level == "##":
        number = 14
    return f"{level} {number}{suffix} {title}"


lines = [renumber_heading(line) for line in lines]
lines = [line for line in lines if line.strip() != "文档结束"]

appendix_index = next(i for i, line in enumerate(lines) if line.startswith("## 附录 A."))
coding_index = next(i for i, line in enumerate(lines) if line.startswith("## 14. 编程工作台"))
coding_block = lines[coding_index:]
main_before_appendix = lines[:appendix_index]
appendix_block = lines[appendix_index:coding_index]
updated = main_before_appendix + coding_block + appendix_block
while updated and not updated[-1].strip():
    updated.pop()
updated.extend(["", "文档结束", ""])

Path(".tmp-doc-read/manual-renumbered.md").write_text("\n".join(updated), encoding="utf-8")
