#!/bin/bash

# 样式审查脚本
# 用于查找需要统一的样式问题

set -e

WEBVIEW_SRC="packages/extension/webview/src"
REPORT_FILE="style-audit-report.txt"

echo "🔍 VCoder 样式审查报告" > "$REPORT_FILE"
echo "================================" >> "$REPORT_FILE"
echo "生成时间: $(date)" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. 查找硬编码的十六进制颜色
echo "📊 正在查找硬编码颜色..." >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "## 1. 硬编码十六进制颜色" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "#[0-9a-fA-F]{3,6}" "$WEBVIEW_SRC" --glob "*.scss" -n >> "$REPORT_FILE" 2>&1 || echo "✅ 未发现十六进制颜色硬编码" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 2. 查找 rgba/rgb 颜色
echo "## 2. RGBA/RGB 颜色" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "rgba?\([0-9]" "$WEBVIEW_SRC" --glob "*.scss" -n >> "$REPORT_FILE" 2>&1 || echo "✅ 未发现 RGBA 颜色硬编码" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 3. 查找固定 padding 值
echo "## 3. 固定 Padding 值（需要统一为 --vc-padding 倍数）" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "padding:\s*\d+px" "$WEBVIEW_SRC" --glob "*.scss" -n | head -50 >> "$REPORT_FILE" 2>&1 || echo "✅ 所有 padding 已使用变量" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 4. 查找固定 margin 值
echo "## 4. 固定 Margin 值" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "margin:\s*\d+px" "$WEBVIEW_SRC" --glob "*.scss" -n | head -50 >> "$REPORT_FILE" 2>&1 || echo "✅ 所有 margin 已使用变量" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 5. 查找固定 gap 值
echo "## 5. 固定 Gap 值" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "gap:\s*\d+px" "$WEBVIEW_SRC" --glob "*.scss" -n | head -50 >> "$REPORT_FILE" 2>&1 || echo "✅ 所有 gap 已使用变量" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 6. 查找固定 border-radius 值
echo "## 6. 固定 Border-Radius 值（需要统一为 --vc-radius-*）" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "border-radius:\s*\d+px" "$WEBVIEW_SRC" --glob "*.scss" -n | head -50 >> "$REPORT_FILE" 2>&1 || echo "✅ 所有 border-radius 已使用变量" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 7. 查找不规范的类名（没有 vc- 前缀）
echo "## 7. 样式类名分析" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "统计使用 'vc-' 前缀的类:" >> "$REPORT_FILE"
rg "^\s*\.vc-" "$WEBVIEW_SRC" --glob "*.scss" | wc -l >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "统计未使用 'vc-' 前缀的类（可能需要重命名）:" >> "$REPORT_FILE"
rg "^\s*\.[a-z][a-z0-9-]*\s*\{" "$WEBVIEW_SRC" --glob "*.scss" | grep -v "vc-" | head -20 >> "$REPORT_FILE" 2>&1 || echo "所有类名已规范" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 8. 查找 transition 定义（检查是否统一）
echo "## 8. Transition 定义（需要统一参数）" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
rg "transition:" "$WEBVIEW_SRC" --glob "*.scss" -n | grep -v "var(--vc-motion" | head -30 >> "$REPORT_FILE" 2>&1 || echo "✅ 所有 transition 已使用标准变量" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 9. 统计 SCSS 文件
echo "## 9. SCSS 文件统计" >> "$REPORT_FILE"
echo "---" >> "$REPORT_FILE"
echo "总 SCSS 文件数:" >> "$REPORT_FILE"
find "$WEBVIEW_SRC" -name "*.scss" 2>/dev/null | wc -l >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "各目录 SCSS 文件数:" >> "$REPORT_FILE"
find "$WEBVIEW_SRC" -name "*.scss" 2>/dev/null | sed 's|/[^/]*$||' | sort | uniq -c | sort -rn >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 10. 总结
echo "================================" >> "$REPORT_FILE"
echo "## 审查完成" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "📝 建议行动:" >> "$REPORT_FILE"
echo "1. 查看上述硬编码颜色，替换为 CSS 变量" >> "$REPORT_FILE"
echo "2. 统一间距值为 --vc-padding 的倍数" >> "$REPORT_FILE"
echo "3. 统一圆角值为 --vc-radius-* 变量" >> "$REPORT_FILE"
echo "4. 为未规范的类名添加 'vc-' 前缀" >> "$REPORT_FILE"
echo "5. 统一 transition 动画参数" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "📖 参考文档:" >> "$REPORT_FILE"
echo "- docs/UI_DESIGN_SYSTEM.md" >> "$REPORT_FILE"
echo "- docs/UI_UNIFICATION_GUIDE.md" >> "$REPORT_FILE"

echo "✅ 审查完成！报告已生成: $REPORT_FILE"
cat "$REPORT_FILE"
