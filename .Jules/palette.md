## 2024-05-24 - Modals Missing Keyboard Support
**Learning:** The application uses overlay/modal patterns (like HistoryPanel) without standard keyboard accessibility support (Escape to close, Focus trap).
**Action:** When creating or modifying modals, always add `Escape` key listener and appropriate ARIA roles (`dialog`, `aria-modal`) to ensure keyboard users can exit the state.
