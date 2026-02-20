# Testing Diff/File Change Consistency

This document describes how to manually test the Diff/File change consistency fix for P2 bug #11.

## Issue Description
Diff views and actual file changes were inconsistent because:
1. The backend's `acceptFileChange` and `rejectFileChange` methods were NO-OPs
2. No `file_change` update with `proposed: false` was sent to clear the UI state
3. This caused pending file changes to persist in the UI even after being accepted/rejected

## Test Scenarios

### Test 1: Accept File Change
1. Start a conversation that proposes a file change (e.g., ask AI to create/modify a file)
2. Wait for the pending file change to appear in the Pending Changes Bar
3. Click the "Review" button to expand the diff view
4. Verify the diff is displayed correctly
5. Click "Accept" button
6. **Expected**: The pending change should be removed from the list immediately
7. **Actual (before fix)**: The pending change persisted in the UI

### Test 2: Reject File Change
1. Start a conversation that proposes a file change
2. Wait for the pending file change to appear in the Pending Changes Bar
3. Click the "Review" button to expand the diff view
4. Click "Reject" button
5. **Expected**: The pending change should be removed from the list immediately
6. **Actual (before fix)**: The pending change persisted in the UI

### Test 3: Multiple File Changes
1. Ask AI to modify multiple files in one conversation turn
2. Wait for all pending changes to appear in the Pending Changes Bar
3. Accept some changes and reject others
4. **Expected**:
   - Accepted changes are removed from pending list
   - Rejected changes are removed from pending list
   - Only unhandled changes remain
5. **Actual (before fix)**: All changes persisted in the UI

### Test 4: Session Switch with Pending Changes
1. Start a session with pending file changes
2. Don't accept or reject them
3. Switch to a different session
4. **Expected**: Pending changes are isolated per session
5. Switch back to original session
6. **Expected**: Pending changes are still there
7. Accept/reject them
8. **Expected**: They are removed from the list

## Files Modified

### `/packages/server/src/claude/wrapper.ts`
- Lines 1368-1403: Implemented `acceptFileChange` and `rejectFileChange` methods
- **What it does**: Sends `file_change` update with `proposed: false` to clear pending changes from UI
- **Why it fixes the issue**: Previously these were NO-OPs, so the UI never knew the change was handled

### `/packages/extension/webview/src/store/useStore.ts`
- Lines 1334-1359: Enhanced `file_change` handling to create new array references
- **What it does**:
  - Filters out the existing change for the path
  - Only adds the change if `proposed: true`
  - Creates new array references to ensure React detects changes
- **Why it fixes the issue**: Ensures React properly detects state changes and re-renders

## Verification Checklist

- [ ] Accepting a file change removes it from the pending list immediately
- [ ] Rejecting a file change removes it from the pending list immediately
- [ ] Multiple file changes can be handled individually
- [ ] Pending changes are properly isolated per session
- [ ] Diff view shows accurate and current changes
- [ ] UI state updates are consistent across all components
- [ ] No stale pending changes persist after accept/reject

## Additional Notes

### How It Works
1. When Claude proposes a file change, a `file_change` update with `proposed: true` is sent
2. The UI adds it to `pendingFileChanges` and displays it in the Pending Changes Bar
3. When user clicks Accept/Reject, the request is sent to the backend
4. The backend now sends a `file_change` update with `proposed: false` for that path
5. The UI filters out the change from `pendingFileChanges` (because `proposed: false`)
6. React detects the new array reference and re-renders
7. The pending change disappears from the UI

### Edge Cases Handled
- Same file path with multiple changes: Only the latest change is kept
- Session isolation: Changes are tracked per session ID
- React re-rendering: New array references ensure proper re-renders
- Concurrent changes: Filter-then-maybe-add pattern prevents duplicates
