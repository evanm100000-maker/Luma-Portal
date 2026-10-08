# Luma Oportal - Roblox Airline Staff Operations Portal

Welcome to **Luma Oportal**, the official, fully animated, responsive staff portal application built for Luma Roblox Airline.

---

## 🔑 Authentication & Admin System

### **Founder & Head Admin Account**
- **Role:** `Head Admin`
- **Status:** `Approved`
- Pre-seeded with Founder account credentials. Use your founder email & password to access the full parent Admin Command Center.

### **Role Promotion Security Password Gate**
- **Promotion Password:** `Luma2025` *(Encrypted & Verified via Web Crypto API SHA-256)*
- **Usage:** Required whenever a Head Admin or Admin attempts to promote/demote a staff member on the Admin Panel.

---

## 🌟 Modules & Features

### 1. **Authentication & Registration**
- **Log In:** Authenticate via Email & Password.
- **Registration:** Applicants submit Preferred Name, Roblox Username, Discord Username, Email, and Password.
- **Approval Workflow:** Newly registered accounts enter `Pending` status and appear on the **Admin Panel -> Staff Requests** list. Staff can only access the portal once an Admin accepts their request.
- **Suspension Protection (C5):** Suspended users are locked out of the portal and presented with a dedicated **Suspension Screen** displaying a live countdown timer and system error code `(Summer)`. Access is automatically restored when the timer reaches zero or when an Admin removes the suspension.

### 2. **Dashboard Hub (3-Length Grid)**
- Features a welcome header: **`Hello [Preferred Name] 👋`** along with active role and LOA badges.
- Dynamic weekly flight quota indicator (*Normal: 3 flights/week*, *Reduced Activity: 1 flight/week*, *LOA: 0 flights needed*).
- 3-column responsive grid layout of animated portal module cards with subtle hover glows and slide-up transitions.

### 3. **Calendar**
- Monthly view highlighting days with scheduled flights.
- Click any flight date to inspect all flights for that day.
- Mark attendance status: `Attending`, `Unsure`, `Absent`.
- **Mandatory Absence Reasons:** Marking `Absent` requires typing a reason, which is automatically saved and sent under that flight log in the Admin Panel.

### 4. **Allocations**
- Comprehensive list of upcoming flights.
- Staff can allocate `Attending`, `Unsure`, or `Absent` (with mandatory reason).
- When marking `Attending`, staff MUST select their duty role:
  - `Cabin crew`
  - `Ground crew`
  - `First officer`
  - `Captain`
  - `Security`
  - `Other` *(Allows entering custom role text)*
- Roster categorization: Grouped crew lists rendered under each duty role header for every flight. Fully synchronized with the Calendar module.

### 5. **LOA & Reduced Activity**
- Apply for Leave of Absence (LOA - 0 flights/week) or Reduced Activity (1 flight/week).
- Active users display a prominent `LOA` or `REDUCED ACTIVITY` badge next to their name across the portal.
- **Automatic Expiry:** LOA status automatically expires when the set end date passes.
- **Consequence Confirmation Notice:** If a user receives a consequence while on LOA or Reduced Activity, a popup modal asks for confirmation stating:
  > *"Flight quota does not apply to this user until: [Requested date]"*
- **Admin Force Option:** Admins can force any staff member onto LOA or Reduced Activity manually.

### 6. **Consequences & Disciplinary Ledger**
- Tracks disciplinary actions:
  - **C1 - C2:** Warnings
  - **C3:** Informal Sanctions
  - **C4:** Detentions (*C4A = 20 minutes*, *C4B = 40 minutes*). Displays under **Upcoming Sanctions** with Date, Time, Type (C4A/B), and Location.
  - **C5:** Suspension *(Triggers complete portal lockout, live countdown timer, and error code `(Summer)`)*.
- Live tally cards tracking total consequences per level.

### 7. **Reports**
- Staff can file reports against players or staff members.
- Fields: Target Roblox Username, Offense Category, Detailed Description, Evidence Image (File upload with Base64 preview or URL).
- Admin moderation: Review reports, post official admin replies, update status (`Processing`, `In review`, `Closed`).

### 8. **My Stats**
- **5-Week Flight Activity Graph:** Interactive Chart.js line graph tracking flight attendance progression over the past 5 weeks (showing peaks & dips).
- Counter cards for Total Flights, Praise Points, Reports Filed, and Total Staff Tenure (calculated automatically from join date).

### 9. **Support Desk**
- 1-to-1 live support ticket messaging system between staff members and Admins.
- Admins can Join, Claim, or Escalate tickets.
- Closed tickets are preserved on file and can be reopened at any time.

### 10. **Admin Panel (Parent Control Center)**
- Accessible to Admins & Head Admins.
- **Staff Requests Tab:** Review pending applicant details (Preferred Name, Roblox Username, Discord Username, Email) and Accept/Reject requests.
- **Staff Roster & Roles:** Promote/Demote staff members (gated by encrypted security password `Luma2025`), force LOA/Reduced Activity, and assign C1-C5 consequences.
- **Flight Management:** Schedule flights with Flight Code, Host, Aircraft, Airport Name, Date/Time, and direct Roblox Airport Join Links (allows staff to jump into the airport game with 1 click!).
- **Reports Moderation & Support Ticket Desk.**
- **Firebase Sync Launcher:** Includes configuration drawer to plug in Firebase credentials for real-time cloud database synchronization.

---

## 🛠️ File Structure

```
Luma Oportal/
├── index.html           # Main SPA HTML structure with Tailwind CSS & components
├── css/
│   └── styles.css       # Custom animations, glassmorphism theme, and scrollbars
├── js/
│   ├── crypto-utils.js  # SHA-256 Web Crypto API password hashing & security verification
│   ├── db.js            # State management engine & IndexedDB/LocalStorage persistence
│   └── app.js           # Main application logic, controllers, modals & Chart.js graph
└── README.md            # System documentation
```

---

## 🚀 Quick Start Instructions

1. Simply double-click `index.html` or open it in any web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari).
2. Log in with your Founder credentials.
3. Experience the full **Luma Oportal** staff hub!
