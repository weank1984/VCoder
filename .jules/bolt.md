## 2024-05-23 - Zustand Selector Optimization
**Learning:** Using `useStore()` without a selector subscribes components to the *entire* state. In high-frequency update scenarios (like streaming chat messages), this causes excessive re-renders even for components that don't depend on the changing data.
**Action:** Use `useShallow` with a selector to pick only necessary state slices. Example: `useStore(useShallow(state => ({ prop: state.prop })))`.
