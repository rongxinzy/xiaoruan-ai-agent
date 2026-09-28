from pathlib import Path


root = Path(r"C:\documents\xiaoruan")
source = min(root.glob("*.md"), key=lambda path: path.stat().st_size)
lines = source.read_text(encoding="utf-8").splitlines()
mapping = {
    "#### 常规 (General)": "#### 11.2.1 常规 (General)",
    "#### 外观 (Appearance)": "#### 11.2.2 外观 (Appearance)",
    "#### 模型 (Model)": "#### 11.2.3 模型 (Model)",
    "#### 即时通讯 (IM)": "#### 11.2.4 即时通讯 (IM)",
    "#### 邮件 (Email)": "#### 11.2.5 邮件 (Email)",
    "#### 记忆管理 (Memory)": "#### 11.2.6 记忆管理 (Memory)",
    "#### 快捷键 (Shortcuts)": "#### 11.2.7 快捷键 (Shortcuts)",
    "#### 关于 (About)": "#### 11.2.8 关于 (About)",
}
updated = [mapping.get(line, line) for line in lines]
Path(".tmp-doc-read/manual-settings-numbered.md").write_text("\n".join(updated) + "\n", encoding="utf-8")
