# AI Coding Agent Custom Rules for Templatesvilla

This file contains custom instructions and rules for developers and coding assistants working on the Templatesvilla repository. These guidelines are automatically loaded and followed by system agents to ensure consistency, security, and stability.

## Custom System Rules and Architectural Directives

- **Auto-Healing JIT Google Drive Token Refresh**:
  I have successfully implemented and compiled a robust, automated Just-in-Time (JIT) token validation fix in both the User Dashboard and Admin Dashboard:
  - **Live Refresh Hook**: Whenever a user or admin clicks on the Upload button (for Sample reference files or Final videos), the application now queries `/api/drive/config` immediately before starting any Google Drive API requests.
  - **Server-Assisted Token Grace**: The server reviews the token's age. If it is 45 minutes or older, the backend automatically uses your persistent Refresh Token to securely fetch a fresh access token from Google, updates your local database, and feeds the renewed token directly back to your upload process. This occurs completely in the background without needing you to log out and log back in, making your connection permanent.
  - **Self-Healing Fail-Safe Retry**: If any direct Google Drive API operation encounters an authentication error (e.g., 410, 401 Unauthorized, or invalid token), the frontend triggers `?forceRefresh=true` query on `/api/drive/config` to immediately force-refresh the access token on the backend, updates local states, and retries the upload sequence cleanly, ensuring permanent reliable upload connection.
