# Admin Panel Features & Architecture

> **ExoDuZe Admin Dashboard**
> Version: 1.1.0 | Published: January 24, 2026

---

## 1. Overview

The ExoDuZe Admin Panel is a secured, real-time control center built to monitor platform health, user growth, and financial activity. It leverages **Socket.IO** for live updates and **Recharts** for data visualization.

---

## 2. Authentication & Security

### 2.1 "Soft" Logout
The Admin Panel implements a specialized logout flow:
- **Action**: Clicking "Sign Out" in the admin sidebar.
- **Behavior**: Navigates the user to the home page (`/`) **without** destroying the authenticated session.
- **Rationale**: Admins often need to switch between the "Player" view and "Admin" view without re-authenticating.

### 2.2 Access Control
- Routes are protected via `AdminGuard` in the backend.
- Frontend views (`AdminLayout`) check `user.role` before rendering.

---

## 3. Real-Time Dashboard (`AdminOverview`)

The overview page aggregates critical metrics using a hybrid Fetch + Socket approach.

### 3.1 Data Source Components

| Metric | Source | Update Frequency |
|--------|--------|------------------|
| **Total Users** | API (`/admin/stats`) | Initial Load + Socket Push |
| **User Growth** | API (`/users` limit 100) | Computed Client-Side |
| **Volume/TVL** | API (`/admin/stats`) | Initial Load + Socket Push |
| **System Alerts** | API (`/admin/alerts`) | Real-time Push |

### 3.2 User Growth Chart Logic
The "User Growth" chart displays the number of new users registered over the last 7 days.
- **Fetch**: `adminApi.getUsers('', 1, 100)` retrieves the last 100 users.
- **Aggregation**: The frontend maps `createdAt` timestamps to day names (e.g., "Mon", "Tue").
- **Visual**: A `BarChart` renders the daily counts.
- **Live Indicator**: A pulsing "Live Data" badge confirms the chart is using real-time production data.

### 3.3 Socket.IO Integration
The dashboard connects to a dedicated namespace for security updates, which also broadcasts system stats.

```typescript
// AdminOverview.tsx
useEffect(() => {
    const socket = adminApi.getSecuritySocket();
    
    socket.on('system_status', (data) => {
        // Optimistically update aggregate stats
        setStats(prev => ({ ...prev, ...data.stats }));
    });
}, []);
```

---

## 4. Layout Structure

The `AdminLayout` provides a persistent sidebar and header.

- **Sidebar**: Navigation links (Overview, Users, Finance, Security).
- **Mobile Responsive**: Collapses into a hamburger menu on small screens.
- **Header**: Displays the current user and global system status indicator.
