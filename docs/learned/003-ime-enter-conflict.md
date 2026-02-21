# Issue #003: UI Enter 发送与输入法 Enter 冲突

**日期**: 2026-01-02  
**状态**: ✅ 已解决

## 问题描述

在 Webview 输入框中使用中文/日文等输入法（IME）进行组合输入（候选词未上屏）时，按下 `Enter` 用于确认候选词，会被 UI 的「Enter 发送」快捷键拦截，导致**误发送**。

同时，当文件选择器（`@` 提示）打开时，组件通过 `window` 级别监听 `keydown` 处理 `Enter/方向键`，也会在 IME 组合输入期间抢占按键，造成与输入法交互冲突。

## 症状

- IME 候选词状态下按 `Enter`：
  - 预期：确认候选词（上屏），不发送
  - 实际：触发发送（submit/send），输入法确认被打断
- 打开 `@` 文件选择器时：
  - IME 候选状态下 `Enter/方向键` 可能被 FilePicker 的全局 `keydown` 抢走

## 根本原因

输入框的 `onKeyDown` 对 `Enter` 做了「非 Shift 即发送」处理，但**没有区分是否处于 IME composition**。

在 IME 组合输入期间，浏览器/React 会通过以下信号表征“仍在 composition”：
- `nativeEvent.isComposing === true`
- `keyCode === 229`（常见于部分浏览器/输入法）
- `key === 'Process'`（部分环境）

若不做保护，`Enter` 会被当作普通回车处理，从而误触发发送/选择等行为。

## 解决方案

### 1) InputArea：IME composition 时跳过 Enter 发送逻辑

- 通过 `onCompositionStart/onCompositionEnd` 维护本地 `isComposing` 状态
- 在 `handleKeyDown` 中综合判断 `isComposing / nativeEvent.isComposing / keyCode 229 / key Process`
- 当处于 IME composition 时：
  - 不执行 `Enter` 的 `preventDefault()`
  - 不触发 `handleSubmit()`

实现位置：
- `apps/vscode-extension/webview/src/components/InputArea.tsx`

### 2) FilePicker：全局 keydown 在 IME composition 时不拦截

FilePicker 通过 `window.addEventListener('keydown', ...)` 做键盘导航/确认选择。为避免与输入法候选交互冲突，在 handler 入口增加 IME composition 判断，组合输入期间直接 return。

实现位置：
- `apps/vscode-extension/webview/src/components/FilePicker.tsx`

## 验证方式

1. 切换到中文输入法（拼音等）
2. 在输入框输入拼音，使候选词列表出现（仍处于组合输入）
3. 按 `Enter` 确认候选词
4. 预期：仅确认候选词，不发送消息
5. 输入 `@` 打开文件选择器，保持 IME 候选状态下按 `Enter/方向键`
6. 预期：不被 FilePicker 抢占导致输入法异常；非组合输入状态下仍可正常用键盘选择文件

## 相关文件

- `apps/vscode-extension/webview/src/components/InputArea.tsx`
- `apps/vscode-extension/webview/src/components/FilePicker.tsx`

