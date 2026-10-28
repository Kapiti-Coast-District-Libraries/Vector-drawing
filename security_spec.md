# Security Specification: Vector Design Cloud Documents

## 1. Data Invariants
1. **Identity & Ownership Invariant**: A document must always have an `ownerId` that strictly matches `request.auth.uid`. A user cannot forge ownership or assign documents to another user.
2. **Immutable Identity Invariant**: Once created, `ownerId` and `createdAt` are immutable and cannot be changed during updates.
3. **Temporal Invariant**: Creation must set `createdAt == request.time` and updates must set `updatedAt == request.time`. Client-supplied past/future timestamps are rejected.
4. **Boundary Invariant**: All strings (`title`, `studentName`, `lessonName`, `unit`, `thumbnailSvg`) must adhere strictly to defined minimum and maximum size boundaries to prevent denial-of-wallet payload attacks.
5. **Array Integrity Invariant**: The `layers` array must not exceed 50 layers, preventing memory exhaustion or unbounded writes.
6. **Query Containment Invariant**: List queries must be filtered strictly by `resource.data.ownerId == request.auth.uid` so no user can snoop or scrape other learners' work without permission.
7. **Default Deny Invariant**: Any unspecified collection or rogue root documents are completely denied.

## 2. The "Dirty Dozen" Payloads (Designed to Fail)
1. **Unauthenticated Write**: Creating a document without `request.auth`.
2. **Spoofed Owner UID**: Authenticated as `user_abc`, but payload provides `ownerId: "user_xyz"`.
3. **Unverified Email / Missing Verification**: Attempting write without verified email token.
4. **Altering Immutable Owner**: Updating an existing document with a changed `ownerId`.
5. **Altering Immutable Creation Time**: Updating an existing document with a mutated `createdAt`.
6. **Untrusted Client Timestamp**: Creating a document with a static/fake `createdAt` string instead of `request.time`.
7. **Ghost Field Injection (Shadow Update)**: Updating a document with unauthorized fields like `isAdmin: true` or `role: "admin"`.
8. **Oversized String Attack (Denial of Wallet)**: Submitting a `title` exceeding 100 characters or `thumbnailSvg` exceeding 20000 characters.
9. **Malformed Document ID Attack**: Targeting an ID with invalid characters (e.g., path traversal or non-alphanumeric).
10. **Blanket Query Snooping**: Attempting to query `list` without `ownerId == request.auth.uid`.
11. **Unauthorized Deletion**: User attempting to delete another student's document.
12. **Admin Email Spoofing**: Attempting admin operations with forged email claims lacking `email_verified == true`.
