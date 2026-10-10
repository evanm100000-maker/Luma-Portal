/**
 * Database & State Persistence Layer for Luma Oportal
 * Uses IndexedDB / LocalStorage with Firebase Cloud adapter support
 */

class LumaDB {
    constructor() {
        this.STORAGE_KEY = 'luma_oportal_production_db';
        this.data = {
            users: [],
            flights: [],
            allocations: [],
            loaRequests: [],
            consequences: [],
            reports: [],
            supportTickets: [],
            firebaseConfig: null
        };
        this.currentUser = null;
    }

    /**
     * Initialize DB, restore session, and preserve all user-created data
     */
    async init() {
        // Try main persistent storage key first
        let stored = localStorage.getItem(this.STORAGE_KEY);
        
        // Migration check from previous keys if main key is empty
        if (!stored) {
            const oldKeys = ['luma_oportal_db_v5', 'luma_oportal_db_v3', 'luma_oportal_db_v1'];
            for (const key of oldKeys) {
                const legacy = localStorage.getItem(key);
                if (legacy) {
                    stored = legacy;
                    localStorage.setItem(this.STORAGE_KEY, legacy);
                    break;
                }
            }
        }

        if (stored) {
            try {
                this.data = JSON.parse(stored);
            } catch (e) {
                console.error("Failed to parse stored DB data", e);
                await this.seedDefaultData();
            }
        } else {
            await this.seedDefaultData();
        }

        // Restore active user session across refresh / tab close
        const activeUserId = localStorage.getItem('luma_active_session') || sessionStorage.getItem('luma_active_session');
        if (activeUserId) {
            const user = this.data.users.find(u => u.id === activeUserId);
            if (user) {
                this.currentUser = user;
            }
        }

        this.processAutoExpiries();

        // 1. Cross-Tab Realtime LocalStorage Listener (Instant sync across tabs/windows)
        window.addEventListener('storage', (e) => {
            if (e.key === this.STORAGE_KEY && e.newValue) {
                try {
                    this.data = JSON.parse(e.newValue);
                    if (this.currentUser) {
                        const updatedUser = this.data.users.find(u => u.id === this.currentUser.id);
                        if (updatedUser) this.currentUser = updatedUser;
                    }
                    if (window.app && typeof app.onRealtimeSync === 'function') {
                        app.onRealtimeSync();
                    }
                } catch (err) {
                    console.error("Error parsing cross-tab storage sync:", err);
                }
            }
        });

        // 2. Initialize Firebase Cloud Sync
        this.initFirebase();

        this.save();
    }

    /**
     * Helper to safely normalize array or Firebase RTDB object values into clean Arrays
     */
    normalizeArray(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === 'object') return Object.values(val).filter(Boolean);
        return [];
    }

    /**
     * Merge items by ID while respecting deleted IDs across local & cloud state
     */
    mergePreservingDeletions(localArr = [], cloudArr = [], deletedIds = []) {
        const deletedSet = new Set(deletedIds || []);
        const normCloud = this.normalizeArray(cloudArr);
        const normLocal = this.normalizeArray(localArr);
        const map = new Map();

        normCloud.forEach(item => {
            if (item && item.id && !deletedSet.has(item.id)) {
                map.set(item.id, item);
            }
        });

        normLocal.forEach(item => {
            if (item && item.id && !deletedSet.has(item.id)) {
                const existing = map.get(item.id);
                map.set(item.id, existing ? { ...existing, ...item } : item);
            }
        });

        return Array.from(map.values());
    }

    /**
     * Initialize Firebase Cloud Connection & Realtime Listeners
     */
    initFirebase() {
        try {
            if (typeof firebase !== 'undefined' && firebase.apps) {
                const firebaseConfig = {
                    apiKey: "AIzaSyBPVZnBUo4uVOHAePhquKWkZCctNgYFgO0",
                    authDomain: "luma-oportal-23434.firebaseapp.com",
                    databaseURL: "https://luma-oportal-23434-default-rtdb.europe-west1.firebasedatabase.app",
                    projectId: "luma-oportal-23434",
                    storageBucket: "luma-oportal-23434.firebasestorage.app",
                    messagingSenderId: "937502080851",
                    appId: "1:937502080851:web:0d6f255a32c9a71871eba6",
                    measurementId: "G-VYZN0NKTRG"
                };

                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }

                this.fbDB = firebase.database();

                // Realtime State Sync Listener (Robust Cloud Sync)
                this.fbDB.ref('portal_state').on('value', (snapshot) => {
                    const cloudData = snapshot.val();
                    
                    // If cloud state is empty on fresh DB, seed cloud with local data
                    if (!cloudData) {
                        this.save();
                        return;
                    }

                    if (cloudData && typeof cloudData === 'object') {
                        const cloudDeleted = this.normalizeArray(cloudData.deletedIds);
                        const localDeleted = this.normalizeArray(this.data.deletedIds);
                        const allDeletedIds = Array.from(new Set([...localDeleted, ...cloudDeleted]));
                        this.data.deletedIds = allDeletedIds;

                        this.data.users = this.mergePreservingDeletions(this.data.users, cloudData.users, allDeletedIds);
                        this.data.flights = this.mergePreservingDeletions(this.data.flights, cloudData.flights, allDeletedIds);
                        this.data.allocations = this.mergePreservingDeletions(this.data.allocations, cloudData.allocations, allDeletedIds);
                        this.data.loaRequests = this.mergePreservingDeletions(this.data.loaRequests, cloudData.loaRequests, allDeletedIds);
                        this.data.consequences = this.mergePreservingDeletions(this.data.consequences, cloudData.consequences, allDeletedIds);
                        this.data.reports = this.mergePreservingDeletions(this.data.reports, cloudData.reports, allDeletedIds);
                        this.data.supportTickets = this.mergePreservingDeletions(this.data.supportTickets, cloudData.supportTickets, allDeletedIds);

                        if (cloudData.activeWarningBanner !== undefined) this.data.activeWarningBanner = cloudData.activeWarningBanner;
                        if (cloudData.maintenanceMode !== undefined) this.data.maintenanceMode = cloudData.maintenanceMode;

                        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
                        
                        // Re-verify current session user
                        if (this.currentUser) {
                            const updatedUser = this.data.users.find(u => u.id === this.currentUser.id);
                            if (updatedUser) this.currentUser = updatedUser;
                        }

                        // Trigger UI Live Update
                        if (window.app && typeof app.onRealtimeSync === 'function') {
                            app.onRealtimeSync();
                        }
                    }
                });

                // Emergency Alert Realtime Listener
                this.fbDB.ref('emergency_alert').on('value', (snapshot) => {
                    const alertData = snapshot.val();
                    this.data.activeEmergencyAlert = alertData || null;
                    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
                    if (window.app && typeof app.onEmergencyAlertReceived === 'function') {
                        app.onEmergencyAlertReceived(alertData);
                    }
                });

                console.log("🔥 Firebase Realtime Database connected successfully!");
            }
        } catch (err) {
            console.warn("Firebase initialization notice:", err.message);
        }
    }

    /**
     * Seed initial required Founder account (Never overwrites existing users)
     */
    async seedDefaultData() {
        if (!this.data) {
            this.data = { users: [], flights: [], allocations: [], loaRequests: [], consequences: [], reports: [], supportTickets: [], firebaseConfig: null };
        }
        if (!this.data.users) this.data.users = [];

        const founderEmail = 'evanm.100000@gmail.com';
        let founder = this.data.users.find(u => u.email.toLowerCase() === founderEmail);

        if (!founder) {
            const founderPassHash = await CryptoUtils.hashPassword('MICHELLE11.');
            founder = {
                id: 'usr_founder_01',
                preferredName: 'Evan',
                robloxUser: 'JAMIE',
                discordUser: 'HAPPYEVBEV',
                email: founderEmail,
                passwordHash: founderPassHash,
                role: 'Head Admin',
                status: 'Approved',
                joinedDate: new Date().toISOString(),
                praisePoints: 0,
                flightsAttended: 0,
                weeklyStats: [0, 0, 0, 0, 0],
                activityStatus: 'Normal',
                loaUntil: null,
                suspensionUntil: null,
                suspensionReason: null,
                tutorialCompleted: true
            };
            this.data.users.push(founder);
        }
    }

    /**
     * Utility to format relative date strings YYYY-MM-DD
     */
    getRelativeDateStr(offsetDays) {
        const d = new Date();
        d.setDate(d.getDate() + offsetDays);
        return d.toISOString().split('T')[0];
    }

    /**
     * Automatically update LOA & Suspension expiries
     */
    processAutoExpiries() {
        const todayStr = new Date().toISOString().split('T')[0];
        const nowMs = Date.now();

        this.data.users.forEach(user => {
            // Check LOA/Reduced Activity end date
            if (user.loaUntil && user.loaUntil < todayStr) {
                user.activityStatus = 'Normal';
                user.loaUntil = null;
            }

            // Check Suspension expiry
            if (user.suspensionUntil) {
                const expiryMs = new Date(user.suspensionUntil).getTime();
                if (nowMs >= expiryMs) {
                    user.status = 'Approved';
                    user.suspensionUntil = null;
                    user.suspensionReason = null;
                }
            }
        });
    }

    /**
     * Save data state to LocalStorage (and trigger Firebase push)
     */
    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        if (this.fbDB) {
            try {
                this.fbDB.ref('portal_state').set(this.data);
            } catch (err) {
                console.warn("Firebase save sync notice:", err.message);
            }
        }
    }

    updateUserSettings(userId, { preferredName, theme, showClock }) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            if (preferredName) user.preferredName = preferredName;
            if (theme) user.theme = theme;
            user.showClock = showClock;
            if (this.currentUser && this.currentUser.id === userId) {
                this.currentUser = user;
            }
            this.save();
        }
        return user;
    }

    completeUserTutorial(userId) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            user.tutorialCompleted = true;
            if (this.currentUser && this.currentUser.id === userId) {
                this.currentUser = user;
            }
            this.save();
        }
        return user;
    }

    setWarningBanner({ type, header, description, author }) {
        const banner = {
            id: 'banner_' + Date.now(),
            type, // 'Warning', 'Severe warning', 'Resolved'
            header,
            description,
            author,
            createdAt: new Date().toISOString(),
            active: true
        };
        this.data.activeWarningBanner = banner;
        this.save();
        return banner;
    }

    clearWarningBanner() {
        this.data.activeWarningBanner = null;
        this.save();
    }

    setMaintenanceMode(enabled) {
        this.data.maintenanceMode = !!enabled;
        this.save();
    }

    broadcastEmergencyAlert(message, senderName) {
        const alertObj = {
            id: 'alert_' + Date.now(),
            message,
            senderName,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            active: true
        };

        if (this.fbDB) {
            this.fbDB.ref('emergency_alert').set(alertObj);
        }

        this.data.activeEmergencyAlert = alertObj;
        this.save();
        return alertObj;
    }

    clearEmergencyAlert() {
        if (this.fbDB) {
            try {
                this.fbDB.ref('emergency_alert').set(null);
                this.fbDB.ref('portal_state/activeEmergencyAlert').set(null);
            } catch (err) {
                console.warn("Firebase clear alert notice:", err.message);
            }
        }
        this.data.activeEmergencyAlert = null;
        this.save();
    }

    // --- USER METHODS ---

    findUserByEmail(email) {
        return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase().trim());
    }

    async registerUser(userData) {
        // Check duplicate email
        if (this.findUserByEmail(userData.email)) {
            throw new Error("An account with this email address already exists.");
        }

        const passHash = await CryptoUtils.hashPassword(userData.password);

        const newUser = {
            id: 'usr_' + Date.now(),
            preferredName: userData.preferredName.trim(),
            robloxUser: userData.robloxUser.trim(),
            discordUser: userData.discordUser.trim(),
            email: userData.email.trim(),
            passwordHash: passHash,
            role: 'Staff',
            status: 'Pending', // Requires Admin approval
            joinedDate: new Date().toISOString(),
            praisePoints: 0,
            flightsAttended: 0,
            weeklyStats: [0, 0, 0, 0, 0],
            activityStatus: 'Normal',
            loaUntil: null,
            suspensionUntil: null,
            suspensionReason: null,
            tutorialCompleted: true
        };

        this.data.users.push(newUser);
        this.save();
        return newUser;
    }

    async loginUser(email, password) {
        if (!email || !password) {
            throw new Error("Please enter both email address and password.");
        }

        const user = this.findUserByEmail(email);
        if (!user) {
            throw new Error("No user account found matching this email address. Please check your spelling or register.");
        }

        const cleanPass = password.trim();
        let match = await CryptoUtils.verifyPassword(cleanPass, user.passwordHash);

        // Fallback check for founder account variations if needed
        if (!match && user.email.toLowerCase() === 'evanm.100000@gmail.com') {
            if (cleanPass === 'MICHELLE11.' || cleanPass === 'MICHELLE11' || cleanPass.toLowerCase() === 'michelle11.') {
                match = true;
                // re-save correct hash
                user.passwordHash = await CryptoUtils.hashPassword('MICHELLE11.');
                this.save();
            }
        }

        if (!match) {
            throw new Error("Incorrect password entered. Please try again.");
        }

        this.currentUser = user;
        localStorage.setItem('luma_active_session', user.id);
        sessionStorage.setItem('luma_active_session', user.id);
        return user;
    }

    logout() {
        this.currentUser = null;
        localStorage.removeItem('luma_active_session');
        sessionStorage.removeItem('luma_active_session');
    }

    updateUserRole(userId, newRole) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            user.role = newRole;
            this.save();
        }
    }

    approveUser(userId) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            user.status = 'Approved';
            this.save();
        }
    }

    rejectUser(userId) {
        this.trackDeletedId(userId);
        this.data.users = (this.data.users || []).filter(u => u.id !== userId);
        this.save();
    }

    deleteUser(userId) {
        this.trackDeletedId(userId);
        this.data.users = (this.data.users || []).filter(u => u.id !== userId);
        this.save();
    }

    // --- FLIGHT & ALLOCATION METHODS ---

    createFlight(flightData) {
        const newFlight = {
            id: 'flt_' + Date.now(),
            code: flightData.code.toUpperCase(),
            host: flightData.host,
            aircraft: flightData.aircraft,
            airport: flightData.airport,
            airportLink: flightData.airportLink,
            date: flightData.date,
            time: flightData.time,
            createdDate: new Date().toISOString()
        };
        this.data.flights.push(newFlight);
        this.save();
        return newFlight;
    }

    setAllocation(flightId, userId, userName, status, role = 'Cabin crew', reason = '') {
        // Find existing allocation
        let alloc = this.data.allocations.find(a => a.flightId === flightId && a.userId === userId);
        if (alloc) {
            alloc.status = status;
            alloc.role = role;
            alloc.reason = reason;
        } else {
            alloc = {
                id: 'alloc_' + Date.now(),
                flightId,
                userId,
                userName,
                status,
                role,
                reason
            };
            this.data.allocations.push(alloc);
        }

        // Update flights attended count if Present
        if (status === 'Attending') {
            const user = this.data.users.find(u => u.id === userId);
            if (user) {
                user.flightsAttended = (user.flightsAttended || 0) + 1;
                // Increment current week stat
                if (user.weeklyStats && user.weeklyStats.length > 0) {
                    user.weeklyStats[user.weeklyStats.length - 1] += 1;
                }
            }
        }

        this.save();
        return alloc;
    }

    markAllocationAttendance(allocId, verifiedStatus, adminName) {
        const alloc = this.data.allocations.find(a => a.id === allocId);
        if (!alloc) return null;
        alloc.attendanceVerified = verifiedStatus; // 'Present' or 'Absent'
        alloc.verifiedBy = adminName;
        alloc.verifiedAt = new Date().toISOString();
        this.save();
        return alloc;
    }

    // --- LOA & REDUCED ACTIVITY METHODS ---

    submitLOARequest(requestData) {
        const newReq = {
            id: 'loa_' + Date.now(),
            userId: requestData.userId,
            userName: requestData.userName,
            type: requestData.type, // LOA or Reduced Activity
            startDate: requestData.startDate,
            endDate: requestData.endDate,
            reason: requestData.reason,
            status: 'Approved', // Auto approved or admin review
            submittedDate: new Date().toISOString()
        };

        // Apply immediately to user profile
        const user = this.data.users.find(u => u.id === requestData.userId);
        if (user) {
            user.activityStatus = requestData.type;
            user.loaUntil = requestData.endDate;
        }

        this.data.loaRequests.push(newReq);
        this.save();
        return newReq;
    }

    forceLOA(userId, type, endDate, reason = 'Admin Action') {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            user.activityStatus = type;
            user.loaUntil = endDate;

            this.data.loaRequests.push({
                id: 'loa_' + Date.now(),
                userId: user.id,
                userName: user.preferredName,
                type: type,
                startDate: new Date().toISOString().split('T')[0],
                endDate: endDate,
                reason: reason + ' (Admin Assigned)',
                status: 'Approved',
                submittedDate: new Date().toISOString()
            });

            this.save();
        }
    }

    // --- CONSEQUENCES & SUSPENSIONS ---

    assignConsequence(cData) {
        if (!cData || !cData.userId) return null;
        const user = this.data.users.find(u => u.id === cData.userId);
        if (!user) return null;

        const newConsequence = {
            id: 'csq_' + Date.now(),
            userId: cData.userId,
            userName: user.preferredName + ' (' + user.robloxUser + ')',
            level: cData.level, // C1, C2, C3, C4A, C4B, C5
            reason: cData.reason || 'No reason specified',
            issuedBy: cData.issuedBy,
            issuedDate: new Date().toISOString().split('T')[0],
            c4Date: cData.c4Date || null,
            c4Time: cData.c4Time || null,
            c4Location: cData.c4Location || null,
            c4Status: ['C4A','C4B'].includes(cData.level) ? 'Pending' : null,
            c5DurationHours: cData.c5DurationHours || null
        };

        // Handle C5 Suspension (Account Lockout)
        if (cData.level === 'C5') {
            const parsed = parseInt(cData.c5DurationHours);
            const durationHours = (!isNaN(parsed) && parsed > 0) ? parsed : 48; // default 48h = 2 days
            const suspensionExpiry = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
            user.status = 'Suspended';
            user.suspensionUntil = suspensionExpiry;
            user.suspensionReason = cData.reason || 'C5 Suspension Action Issued';
        }

        this.data.consequences.push(newConsequence);
        this.save();
        return { consequence: newConsequence, targetUser: user };
    }

    markC4DetentionResult(cId, result) {
        const csq = this.data.consequences.find(c => c.id === cId);
        if (!csq) return null;

        const user = this.data.users.find(u => u.id === csq.userId);

        if (result === 'Passed') {
            csq.c4Status = 'Passed';
            this.save();
            return { action: 'Passed', csq, user };
        } else if (result === 'Failed') {
            if (csq.level === 'C4A') {
                // Fail C4A -> Escalate to C4B (40 Mins Detention)
                csq.level = 'C4B';
                csq.c4Status = 'Pending';
                csq.reason = csq.reason + ' [C4A Failed -> Escalated to C4B]';
                this.save();
                return { action: 'EscalatedToC4B', csq, user };
            } else if (csq.level === 'C4B') {
                // Fail C4B -> Escalate to 2-Day (48 Hour) C5 Suspension!
                csq.c4Status = 'Failed';
                if (user) {
                    user.status = 'Suspended';
                    const expiry = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
                    user.suspensionUntil = expiry;
                    user.suspensionReason = 'Failed C4B Detention Attendance / Evaluation';
                }
                this.save();
                return { action: 'Suspended2Days', csq, user };
            }
        }
    }

    removeSuspension(userId) {
        const user = this.data.users.find(u => u.id === userId);
        if (user) {
            user.status = 'Approved';
            user.suspensionUntil = null;
            user.suspensionReason = null;
            this.save();
        }
    }

    // --- REPORTS METHODS ---

    submitReport(reportData) {
        const newReport = {
            id: 'rep_' + Date.now(),
            reporterId: reportData.reporterId,
            reporterName: reportData.reporterName,
            targetUser: reportData.targetUser,
            offense: reportData.offense,
            description: reportData.description,
            imageUrl: reportData.imageUrl || '',
            status: 'Processing', // Processing, In review, Closed
            submittedDate: new Date().toISOString().split('T')[0],
            replies: []
        };
        this.data.reports.push(newReport);
        this.save();
        return newReport;
    }

    updateReportStatus(reportId, newStatus, adminReply = null) {
        const report = this.data.reports.find(r => r.id === reportId);
        if (report) {
            report.status = newStatus;
            if (adminReply) {
                report.replies.push({
                    author: adminReply.author,
                    message: adminReply.message,
                    date: new Date().toISOString()
                });
            }
            this.save();
        }
    }

    // --- SUPPORT TICKET METHODS ---

    createSupportTicket(ticketData) {
        const newTicket = {
            id: 'tkt_' + Date.now(),
            creatorId: ticketData.creatorId,
            creatorName: ticketData.creatorName,
            subject: ticketData.subject,
            category: ticketData.category,
            status: 'Open', // Open, Escalated, Closed
            assignedAdminId: null,
            assignedAdminName: 'Unassigned',
            createdDate: new Date().toISOString().split('T')[0],
            messages: [
                {
                    senderId: ticketData.creatorId,
                    senderName: ticketData.creatorName,
                    role: 'Staff',
                    text: ticketData.message,
                    timestamp: new Date().toISOString()
                }
            ]
        };
        this.data.supportTickets.push(newTicket);
        this.save();
        return newTicket;
    }

    addTicketMessage(ticketId, senderId, senderName, role, text) {
        const ticket = this.data.supportTickets.find(t => t.id === ticketId);
        if (ticket) {
            ticket.messages.push({
                senderId,
                senderName,
                role,
                text,
                timestamp: new Date().toISOString()
            });
            this.save();
            return ticket;
        }
    }

    updateTicketStatus(ticketId, status, adminUser = null) {
        const ticket = this.data.supportTickets.find(t => t.id === ticketId);
        if (ticket) {
            ticket.status = status;
            if (adminUser) {
                ticket.assignedAdminId = adminUser.id;
                ticket.assignedAdminName = adminUser.preferredName + ' (' + adminUser.robloxUser + ')';
            }
            this.save();
        }
    }

    // --- DELETION METHODS ---

    trackDeletedId(id) {
        if (!id) return;
        this.data.deletedIds = this.data.deletedIds || [];
        if (!this.data.deletedIds.includes(id)) {
            this.data.deletedIds.push(id);
        }
    }

    deleteFlight(flightId) {
        this.trackDeletedId(flightId);
        const deletedAllocations = (this.data.allocations || []).filter(a => a.flightId === flightId);
        deletedAllocations.forEach(a => this.trackDeletedId(a.id));

        this.data.flights = (this.data.flights || []).filter(f => f.id !== flightId);
        this.data.allocations = (this.data.allocations || []).filter(a => a.flightId !== flightId);
        this.save();
    }

    deleteReport(reportId) {
        this.trackDeletedId(reportId);
        this.data.reports = (this.data.reports || []).filter(r => r.id !== reportId);
        this.save();
    }

    deleteSupportTicket(ticketId) {
        this.trackDeletedId(ticketId);
        this.data.supportTickets = (this.data.supportTickets || []).filter(t => t.id !== ticketId);
        this.save();
    }

    deleteConsequence(consequenceId) {
        this.trackDeletedId(consequenceId);
        this.data.consequences = (this.data.consequences || []).filter(c => c.id !== consequenceId);
        this.save();
    }

    deleteLOARequest(loaId) {
        this.trackDeletedId(loaId);
        const req = (this.data.loaRequests || []).find(r => r.id === loaId);
        if (req) {
            const user = (this.data.users || []).find(u => u.id === req.userId);
            if (user) {
                user.activityStatus = 'Normal';
                user.loaUntil = null;
            }
        }
        this.data.loaRequests = (this.data.loaRequests || []).filter(r => r.id !== loaId);
        this.save();
    }
}

// Instantiate global database instance
const db = new LumaDB();
