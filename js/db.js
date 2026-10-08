/**
 * Database & State Persistence Layer for Luma Oportal
 * Uses IndexedDB / LocalStorage with Firebase Cloud adapter support
 */

class LumaDB {
    constructor() {
        this.STORAGE_KEY = 'luma_oportal_db_v5';
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
     * Initialize DB and seed initial data if first time
     */
    async init() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
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

        // Check active session
        const sessionUser = sessionStorage.getItem('luma_active_session');
        if (sessionUser) {
            const user = this.data.users.find(u => u.id === sessionUser);
            if (user) this.currentUser = user;
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

                // Realtime State Sync Listener (No refresh needed)
                this.fbDB.ref('portal_state').on('value', (snapshot) => {
                    const cloudData = snapshot.val();
                    if (cloudData && typeof cloudData === 'object') {
                        // Deep merge cloud data
                        this.data = {
                            ...this.data,
                            ...cloudData,
                            users: cloudData.users || this.data.users,
                            flights: cloudData.flights || this.data.flights,
                            allocations: cloudData.allocations || this.data.allocations,
                            loaRequests: cloudData.loaRequests || this.data.loaRequests,
                            consequences: cloudData.consequences || this.data.consequences,
                            reports: cloudData.reports || this.data.reports,
                            supportTickets: cloudData.supportTickets || this.data.supportTickets
                        };
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
     * Seed initial required Founder account (No placeholders)
     */
    async seedDefaultData() {
        // Hash founder password "MICHELLE11."
        const founderPassHash = await CryptoUtils.hashPassword('MICHELLE11.');

        const now = new Date();

        this.data = {
            users: [
                {
                    id: 'usr_founder_01',
                    preferredName: 'Evan',
                    robloxUser: 'JAMIE',
                    discordUser: 'HAPPYEVBEV',
                    email: 'evanm.100000@gmail.com',
                    passwordHash: founderPassHash,
                    role: 'Head Admin', // Head Admin, Admin, Senior Staff, Staff
                    status: 'Approved', // Pending, Approved, Rejected, Suspended
                    joinedDate: now.toISOString(),
                    praisePoints: 0,
                    flightsAttended: 0,
                    weeklyStats: [0, 0, 0, 0, 0],
                    activityStatus: 'Normal', // Normal, LOA, Reduced Activity
                    loaUntil: null,
                    suspensionUntil: null,
                    suspensionReason: null
                }
            ],
            flights: [],
            allocations: [],
            loaRequests: [],
            consequences: [],
            reports: [],
            supportTickets: [],
            firebaseConfig: null
        };
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
            this.fbDB.ref('emergency_alert').set(null);
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
            suspensionReason: null
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
        sessionStorage.setItem('luma_active_session', user.id);
        return user;
    }

    logout() {
        this.currentUser = null;
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
        this.data.users = this.data.users.filter(u => u.id !== userId);
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
        const user = this.data.users.find(u => u.id === cData.userId);
        if (!user) return;

        const newConsequence = {
            id: 'csq_' + Date.now(),
            userId: cData.userId,
            userName: user.preferredName + ' (' + user.robloxUser + ')',
            level: cData.level, // C1, C2, C3, C4A, C4B, C5
            reason: cData.reason,
            issuedBy: cData.issuedBy,
            issuedDate: new Date().toISOString().split('T')[0],
            c4Date: cData.c4Date || null,
            c4Time: cData.c4Time || null,
            c4Location: cData.c4Location || null,
            c4Status: ['C4A','C4B'].includes(cData.level) ? 'Pending' : null,
            c5DurationHours: cData.c5DurationHours || null
        };

        // Handle C5 Suspension
        if (cData.level === 'C5') {
            const durationHours = parseInt(cData.c5DurationHours || 48); // default 48h = 2 days
            const suspensionExpiry = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
            user.status = 'Suspended';
            user.suspensionUntil = suspensionExpiry;
            user.suspensionReason = cData.reason;
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
}

// Instantiate global database instance
const db = new LumaDB();
