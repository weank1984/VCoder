## 2024-05-24 - Hardcoded strings bypass i18n and a11y
**Learning:** Found multiple components (`JumpToBottom`, `FilePicker`) with hardcoded strings (especially Chinese). This breaks accessibility for non-Chinese users and makes the UI inconsistent. Hardcoded strings in `aria-label` also hurt screen reader users who expect the localized language.
**Action:** Always check for hardcoded strings in components. Use `useI18n` for both visible text and ARIA labels.
