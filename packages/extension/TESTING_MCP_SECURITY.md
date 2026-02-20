# Testing Built-in MCP Server Security

This document describes how to manually test the built-in MCP server security improvements for P2 bug #12.

## Issue Description
The built-in MCP server had several security vulnerabilities that could allow unauthorized access or malicious operations:
1. **No authentication**: Any process on localhost could call the MCP server
2. **Weak CORS policy**: Allowed any localhost origin
3. **Path traversal vulnerability**: Insufficient validation of file paths
4. **No input validation**: Regex patterns and file patterns not validated
5. **No permission boundaries**: All tools marked as `requiresPermission: false`

## Security Improvements

### 1. Authentication Token
- Generated secure random token (32 bytes, hex-encoded)
- Required for all requests except health check
- Included in `Authorization` header as Bearer token
- Token is private to the MCP server instance

### 2. Strict CORS Policy
- Only allows `http://127.0.0.1` and `http://localhost` origins
- Validates origin header before allowing access
- Prevents cross-site requests from malicious websites

### 3. Localhost-Only Connections
- Verifies remote address is localhost (127.0.0.1, ::1, or ::ffff:127.0.0.1)
- Rejects all connections from non-localhost addresses
- Prevents remote network access

### 4. Path Traversal Protection
- Uses `path.resolve()` to normalize paths
- Uses `path.relative()` to check if path escapes workspace
- Rejects paths containing `..` or absolute paths outside workspace
- Prevents access to files outside workspace directory

### 5. Input Validation
- Search patterns limited to 1000 characters
- File patterns limited to 500 characters
- Patterns containing `..` are rejected
- Regex patterns tested for validity before use
- Maximum results capped at 1000 to prevent resource exhaustion

### 6. Permission Boundaries
- Read-only tools: Safe operations (search, list, status)
- Permission-required tools: User-visible operations (open file in editor)
- No write/delete operations exposed
- Clear documentation in tool descriptions

## Test Scenarios

### Test 1: Authentication Enforcement
1. Start the extension with builtin MCP server enabled
2. Try to call `/mcp/tools` without Authorization header
3. **Expected**: 401 Unauthorized error
4. Try to call with invalid token
5. **Expected**: 401 Unauthorized error
6. Try to call with correct token
7. **Expected**: 200 OK with tools list

### Test 2: Path Traversal Protection
1. Call `workspace/openFile` with path `../../etc/passwd`
2. **Expected**: Error "Path is outside workspace. Attempted path traversal detected."
3. Call `workspace/openFile` with path `../../../sensitive.txt`
4. **Expected**: Same error
5. Call `workspace/openFile` with valid path `src/index.ts`
6. **Expected**: File opens successfully

### Test 3: Input Validation - Malicious Regex
1. Call `workspace/searchText` with pattern `(.*)*` (ReDoS pattern)
2. **Expected**: Error caught and reported as "Invalid search pattern"
3. Call `workspace/searchText` with 2000-character pattern
4. **Expected**: Error "Search pattern too long"
5. Call `workspace/searchText` with valid pattern `function`
6. **Expected**: Results returned successfully

### Test 4: Input Validation - File Pattern
1. Call `workspace/listFiles` with pattern `../../../*`
2. **Expected**: Error "File pattern cannot contain .."
3. Call `workspace/listFiles` with 1000-character pattern
4. **Expected**: Error "File pattern too long"
5. Call `workspace/listFiles` with valid pattern `**/*.ts`
6. **Expected**: Files listed successfully

### Test 5: CORS Policy
1. Try to call MCP server from a website (not localhost)
2. **Expected**: CORS error, no Access-Control-Allow-Origin header
3. Try to call from `http://127.0.0.1`
4. **Expected**: Success, proper CORS headers

### Test 6: Rate Limiting
1. Send 150 requests in 1 minute
2. **Expected**: First 100 succeed, remaining get 429 Rate Limit Exceeded
3. Wait 1 minute
4. **Expected**: Requests succeed again

### Test 7: Localhost-Only Connections
1. Try to connect from remote machine (if on network)
2. **Expected**: 403 Forbidden "Only localhost connections allowed"
3. Connect from localhost
4. **Expected**: Success

## Files Modified

### `/packages/extension/src/services/builtinMcpServer.ts`

#### Lines 1-19: Added security documentation
- Documented security features in file header
- Imported crypto module for token generation

#### Lines 46-58: Added authentication token
```typescript
private authToken: string | null = null;
constructor(private context: vscode.ExtensionContext) {
    this.authToken = crypto.randomBytes(32).toString('hex');
}
```

#### Lines 117-130: Added auth token to server config
```typescript
getServerConfig(): McpServerConfig {
    return {
        type: 'http',
        url: `http://127.0.0.1:${this.port}/mcp`,
        name: 'VSCode Built-in Tools',
        headers: {
            'Authorization': `Bearer ${this.authToken}`,
        },
    };
}
```

#### Lines 135-198: Enhanced request security
- Added strict CORS policy
- Added localhost-only verification
- Added authentication check
- Added comprehensive error messages

#### Lines 479-509: Improved path traversal protection
- Use `path.resolve()` for normalization
- Use `path.relative()` for boundary checking
- Clear error messages for security violations

#### Lines 427-481: Added input validation
- Pattern length limits
- Path traversal character rejection
- Regex validation before execution
- Result count limits

#### Lines 290-367: Updated tool permissions
- Clear documentation for read-only operations
- `workspace/openFile` marked as `requiresPermission: true`
- All tool descriptions include security context

## Verification Checklist

- [ ] Authentication token required for all requests (except health)
- [ ] Invalid/missing token returns 401 Unauthorized
- [ ] Path traversal attempts are blocked
- [ ] Malicious regex patterns are caught and rejected
- [ ] File patterns with `..` are rejected
- [ ] CORS only allows localhost origins
- [ ] Non-localhost connections are rejected
- [ ] Rate limiting prevents abuse (100 requests/minute)
- [ ] All tools are properly scoped to workspace
- [ ] No write/delete operations are exposed

## Security Boundaries

### What MCP Server CAN Do:
- Read files within workspace
- List files within workspace
- Search text within workspace
- Get git status/branch info
- Get editor selection/active file
- Open files in editor (with permission)

### What MCP Server CANNOT Do:
- Access files outside workspace
- Write/modify files
- Delete files
- Execute arbitrary commands
- Access network resources
- Bypass authentication
- Accept connections from non-localhost

## Additional Notes

### Authentication Flow
1. MCP server generates random token on startup
2. Token is included in server config for agent
3. Agent includes token in Authorization header
4. Server validates token on each request
5. Invalid token = 401 Unauthorized

### Path Security Model
```
Workspace: /home/user/project
Allowed:   /home/user/project/src/file.ts ✓
Allowed:   /home/user/project/docs/readme.md ✓
Blocked:   /home/user/project/../etc/passwd ✗
Blocked:   /home/user/../sensitive.txt ✗
Blocked:   /etc/passwd ✗
```

### Defense in Depth
Multiple layers of security:
1. Authentication (token)
2. Network isolation (localhost-only)
3. CORS policy (origin validation)
4. Input validation (pattern/length limits)
5. Path validation (workspace boundary)
6. Rate limiting (abuse prevention)
7. Permission system (operation classification)
