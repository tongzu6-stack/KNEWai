# Firestore Security Specification

This document defines the security rules and data invariants for our chatbot application containing chat sessions and message subcollections.

## 1. Data Invariants

1. **Owner-Only Isolation**: A user can only access, create, update, or delete chat sessions where the `userId` matches their authenticated UID.
2. **Session Inheritance**: A message can only be added or read under a session if the current user is the owner of that parent session.
3. **Immutability of Author**: The ID of the owner (`userId`) and the creation timestamp (`createdAt`) are immutable after session establishment.
4. **Action-Based Updates**: ChatSession titles can be renamed, or the session updated, but only by the session owner.

## 2. The Dirty Dozen Payloads

Here are 12 malicious payloads that should be blocked by our security rules:

1. **Anonymous Read Attempt**: Try to read another user's session without signing in.
2. **Cross-User Session Overwrite**: Trying to update or overwrite another user's session document `userId`.
3. **Session Spoofing (ownerId injection)**: Creating a chat session with an owner UID pointing to a different user.
4. **Invalid Character ID Poisoning**: Creating a session using a 2KB junk character ID.
5. **Junk Fields Injection**: Creating a session containing random fields not defined in the schema (e.g., `hasPaidAccess: true`).
6. **Immutable Field Altering**: Attempting to alter a session's original `userId` or `createdAt` after creation.
7. **Future Timestamp Forgery**: Creating a message with a client-side timestamp in the future instead of `request.time`.
8. **Malicious Role Promotion**: Setting user role to a fake value inside a chat session message (e.g. promoting self to administrator).
9. **Orphaned Message Entry**: Forging a write to a message subcollection where the parent session doesn't exist or is owned by someone else.
10. **Empty Message Payload**: Violating the minimum content length properties (e.g., message content size 0, or missing required keys).
11. **Client-Side Message Rule Hijack**: Trying to read list of all messages across all possible user sessions without session-specific scoping.
12. **Supermassive Text Attack**: Sending a message with an excessively large content body (e.g., > 1MB) violating content limits.

All of these payloads must return `PERMISSION_DENIED` under correct rules.
