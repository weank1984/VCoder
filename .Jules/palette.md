## 2024-05-23 - Accessibility in Custom Popups
**Learning:** Custom popup menus like `FilePicker` often miss basic ARIA roles, making them invisible to screen readers even if they are keyboard accessible.
**Action:** Always ensure custom popups have `role="listbox"` (or `menu`), and items have `role="option"` (or `menuitem`) with `aria-selected` state. Also, the trigger element must have `aria-haspopup` and `aria-expanded`.
