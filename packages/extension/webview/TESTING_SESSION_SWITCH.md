# Testing Session Switch Context Refresh

This document describes how to manually test the session switching context refresh fix for P2 bug #10.

## Issue Description
When switching sessions, the UI may display stale context information from the previous session, including:
- Error messages from previous session
- Loading state from previous session
- Incorrect scroll position
- Stale active user message reference

## Test Scenarios

### Test 1: Error State Cleanup
1. Start a new session (Session A)
2. Trigger an error (e.g., cancel a running operation)
3. Verify error banner is displayed
4. Create a new session (Session B) or switch to another session
5. **Expected**: Error banner should disappear
6. **Actual (before fix)**: Error banner persists from Session A

### Test 2: Loading State Cleanup
1. Start a new session (Session A)
2. Send a prompt and let it start processing (loading state)
3. Quickly switch to a different session (Session B)
4. **Expected**: Loading indicator should be cleared
5. **Actual (before fix)**: Loading indicator may persist

### Test 3: Scroll Position Reset
1. Start a session with many messages (Session A)
2. Scroll to middle of conversation
3. Switch to a new/different session (Session B)
4. **Expected**: Scroll position should be at top
5. **Actual (before fix)**: May maintain scroll position from Session A

### Test 4: Active User Message Reset
1. Start a session with multiple user prompts (Session A)
2. Scroll to see sticky user prompt
3. Switch to a different session (Session B)
4. **Expected**: Sticky user prompt should reset to latest (or none if empty)
5. **Actual (before fix)**: May show user message from Session A

## Files Modified

### `/packages/extension/webview/src/store/useStore.ts`
- Line 976-1017: Added `error: null` and `isLoading: false` to state cleanup in `setCurrentSession`
- Ensures error state and loading state are cleared when switching sessions

### `/packages/extension/src/providers/chatViewProvider.ts`
- Line 141-148: Added session list refresh after switching sessions
- Ensures UI has the latest session information after switch

### `/packages/extension/webview/src/App.tsx`
- Line 152-162: Enhanced session change effect to:
  - Reset both regular and virtual container scroll positions
  - Clear active user message reference
  - Ensure complete UI state reset

## Verification Checklist

- [ ] Error state is cleared when switching sessions
- [ ] Loading state is cleared when switching sessions
- [ ] Scroll position is reset to top when switching sessions
- [ ] Active user message reference is cleared when switching sessions
- [ ] No memory leaks from text buffers (existing cleanup still works)
- [ ] Session data is properly isolated (no data bleed between sessions)

## Additional Notes

The fix ensures that when switching sessions:
1. Old session's text buffers are flushed and cleaned up (existing behavior)
2. UI state (error, loading, scroll) is completely reset (new behavior)
3. Session list is refreshed to show latest state (new behavior)
4. All session-specific UI components are properly reinitialized (enhanced behavior)
