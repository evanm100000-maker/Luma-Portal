/**
 * Main Application Controller for Luma Oportal
 */

class LumaApp {
    constructor() {
        this.currentMonth = new Date().getMonth();
        this.currentYear = new Date().getFullYear();
        this.selectedTicketId = null;
        this.statsChart = null;
        this.suspensionTimerInterval = null;
        this.uploadedImageBase64 = null;
    }

    /**
     * Bootstraps application
     */
    async init() {
        await db.init();
        this.checkAuth();
        this.startRealtimeHeartbeat();
    }

    /**
     * Continuous 1.5-second Realtime Polling Heartbeat
     * Guarantees the entire portal stays 100% updated constantly without page refresh!
     */
    startRealtimeHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
            if (db.currentUser) {
                db.processAutoExpiries();
                this.onRealtimeSync();
            }
        }, 1500);
    }

    /**
     * Check active session status and show corresponding viewport view
     */
    checkAuth() {
        const user = db.currentUser;
        const topNav = document.getElementById('top-navbar');
        const authScreen = document.getElementById('auth-screen');
        const suspensionScreen = document.getElementById('suspension-screen');

        if (!user) {
            topNav.classList.add('hidden');
            authScreen.classList.remove('hidden');
            suspensionScreen.classList.add('hidden');
            this.hideAllPages();
            return;
        }

        // Check if user is suspended (C5)
        if (user.status === 'Suspended') {
            topNav.classList.remove('hidden');
            authScreen.classList.add('hidden');
            this.hideAllPages();
            this.showSuspensionScreen(user);
            return;
        }

        // Check if pending approval
        if (user.status === 'Pending') {
            db.logout();
            Swal.fire({
                icon: 'warning',
                title: 'Registration Pending Approval',
                text: 'Your registration details have been submitted to the Admin Panel. An Admin must approve your account before you can log in.',
                confirmButtonColor: '#0284c7'
            });
            this.checkAuth();
            return;
        }

        // User is logged in & approved!
        topNav.classList.remove('hidden');
        authScreen.classList.add('hidden');
        suspensionScreen.classList.add('hidden');

        // Update Top Nav user badges
        this.renderNavUserBadges(user);

        // Default to Dashboard view
        this.navigateTo('dashboard');
    }

    /**
     * Render nav bar badges & admin button
     */
    renderNavUserBadges(user) {
        const badgesContainer = document.getElementById('nav-user-badges');
        const adminBtn = document.getElementById('nav-admin-btn');
        const emergencyBtn = document.getElementById('nav-emergency-btn');

        let html = `<span class="text-xs font-bold text-slate-300 mr-2">${user.preferredName} (${user.robloxUser})</span>`;

        if (user.role === 'Head Admin') {
            html += `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold badge-head-admin">HEAD ADMIN</span>`;
            adminBtn.classList.remove('hidden');
            if (emergencyBtn) emergencyBtn.classList.remove('hidden');
        } else if (user.role === 'Admin') {
            html += `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold badge-admin">ADMIN</span>`;
            adminBtn.classList.remove('hidden');
            if (emergencyBtn) emergencyBtn.classList.remove('hidden');
        } else {
            html += `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">STAFF</span>`;
            adminBtn.classList.add('hidden');
            if (emergencyBtn) emergencyBtn.classList.add('hidden');
        }

        if (user.activityStatus === 'LOA') {
            html += `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold badge-loa">LOA</span>`;
        } else if (user.activityStatus === 'Reduced Activity') {
            html += `<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold badge-reduced">REDUCED ACTIVITY</span>`;
        }

        badgesContainer.innerHTML = html;
    }

    /**
     * Triggered automatically by Firebase Realtime Database on any cloud state change
     * Ensures full site is constantly up to date without page refresh!
     */
    onRealtimeSync() {
        if (!db.currentUser) return;
        this.renderNavUserBadges(db.currentUser);

        // Update active screen elements dynamically
        const activeScreenId = ['dashboard-screen', 'page-calendar', 'page-allocations', 'page-loa', 'page-consequences', 'page-reports', 'page-stats', 'page-support', 'page-admin']
            .find(id => {
                const el = document.getElementById(id);
                return el && !el.classList.contains('hidden');
            });

        if (activeScreenId) {
            switch (activeScreenId) {
                case 'dashboard-screen': this.renderDashboard(); break;
                case 'page-calendar': this.renderCalendar(); break;
                case 'page-allocations': this.renderAllocations(); break;
                case 'page-loa': this.renderLOAPage(); break;
                case 'page-consequences': this.renderConsequencesPage(); break;
                case 'page-reports': this.renderReportsPage(); break;
                case 'page-stats': this.renderStatsPage(); break;
                case 'page-support': this.renderSupportPage(); break;
                case 'page-admin': this.renderAdminPanel(); break;
            }
        }
    }

    /**
     * Broadcast Emergency Alert (Admin Action)
     */
    promptEmergencyAlert() {
        const user = db.currentUser;
        if (!['Head Admin', 'Admin'].includes(user.role)) return;

        Swal.fire({
            title: '🚨 Dispatch Emergency Alert',
            text: 'Type emergency broadcast message. This will immediately trigger an alarming popup sound on ALL staff screens:',
            input: 'textarea',
            inputPlaceholder: 'ATTENTION ALL CREW: Report to Airport Security immediately...',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'BROADCAST EMERGENCY ALERT'
        }).then(result => {
            if (result.isConfirmed && result.value && result.value.trim()) {
                const alertObj = db.broadcastEmergencyAlert(result.value.trim(), `${user.preferredName} (${user.role})`);
                Swal.fire('Broadcast Dispatched!', 'Emergency Alert sent to all staff members.', 'success');
            }
        });
    }

    /**
     * Triggered when an Emergency Alert is received (Real-time Firebase Event)
     */
    onEmergencyAlertReceived(alertData) {
        const modal = document.getElementById('modal-emergency-alert');
        if (!modal) return;

        if (alertData && alertData.active !== false && alertData.message) {
            document.getElementById('emergency-alert-text').textContent = alertData.message;
            document.getElementById('emergency-alert-sender').textContent = `Issued by: ${alertData.senderName || 'Command Center'}`;
            document.getElementById('emergency-alert-time').textContent = `Broadcasted: ${alertData.time || 'Just now'}`;

            modal.classList.remove('hidden');

            // Play looping alarm sound MP3
            const audioEl = document.getElementById('emergency-alarm-audio');
            if (audioEl) {
                audioEl.currentTime = 0;
                audioEl.loop = true;
                const playPromise = audioEl.play();
                if (playPromise !== undefined) {
                    playPromise.catch(err => {
                        console.warn("Audio autoplay blocked by browser policy, starting Web Audio synth fallback:", err);
                        this.startEmergencySynthAlarm();
                    });
                }
            }
        } else {
            this.dismissEmergencyAlert(false);
        }
    }

    /**
     * Dismiss Emergency Alert & Stop Sound Loop
     */
    dismissEmergencyAlert(isUserClick = true) {
        const modal = document.getElementById('modal-emergency-alert');
        if (modal) modal.classList.add('hidden');

        // Stop audio element
        const audioEl = document.getElementById('emergency-alarm-audio');
        if (audioEl) {
            audioEl.pause();
            audioEl.currentTime = 0;
        }

        // Stop synth oscillator if running
        if (this.synthOscillator) {
            try { this.synthOscillator.stop(); } catch (e) {}
            this.synthOscillator = null;
        }
        if (this.synthInterval) {
            clearInterval(this.synthInterval);
            this.synthInterval = null;
        }

        // If admin clicked dismiss, offer option to clear globally
        if (isUserClick && db.currentUser && ['Head Admin', 'Admin'].includes(db.currentUser.role)) {
            Swal.fire({
                title: 'Clear Global Emergency Alert?',
                text: 'Would you like to deactivate this Emergency Alert globally for all other staff members?',
                showCancelButton: true,
                confirmButtonText: 'Yes, Clear Alert Globally',
                cancelButtonText: 'Keep Active For Others',
                confirmButtonColor: '#ef4444'
            }).then(result => {
                if (result.isConfirmed) {
                    db.clearEmergencyAlert();
                    Swal.fire('Alert Cleared', 'Emergency alert deactivated across all devices.', 'success');
                }
            });
        }
    }

    /**
     * Web Audio API Emergency Siren Synth Fallback
     */
    startEmergencySynthAlarm() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            gain.gain.setValueAtTime(0.3, ctx.currentTime);

            osc.connect(gain);
            gain.connect(ctx.destination);

            let high = false;
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.start();

            this.synthOscillator = osc;
            this.synthInterval = setInterval(() => {
                high = !high;
                if (osc && ctx) {
                    osc.frequency.setValueAtTime(high ? 950 : 650, ctx.currentTime);
                }
            }, 300);
        } catch (e) {
            console.error("Audio synth error:", e);
        }
    }

    /**
     * Handle Login / Register Tab Toggle
     */
    switchAuthTab(tab) {
        const tabLogin = document.getElementById('tab-login');
        const tabRegister = document.getElementById('tab-register');
        const formLogin = document.getElementById('form-login');
        const formRegister = document.getElementById('form-register');

        if (tab === 'login') {
            tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 bg-luma-600 text-white shadow-md";
            tabRegister.className = "flex-1 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:text-white transition-all duration-200";
            formLogin.classList.remove('hidden');
            formRegister.classList.add('hidden');
        } else {
            tabRegister.className = "flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 bg-emerald-600 text-white shadow-md";
            tabLogin.className = "flex-1 py-2 rounded-lg text-sm font-semibold text-slate-400 hover:text-white transition-all duration-200";
            formRegister.classList.remove('hidden');
            formLogin.classList.add('hidden');
        }
    }

    /**
     * Handle Login submit
     */
    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            const user = await db.loginUser(email, password);
            this.checkAuth();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Authentication Failed',
                text: err.message,
                confirmButtonColor: '#ef4444'
            });
        }
    }

    /**
     * Handle Registration submit
     */
    async handleRegister(e) {
        e.preventDefault();
        const preferredName = document.getElementById('reg-preferred-name').value;
        const robloxUser = document.getElementById('reg-roblox-user').value;
        const discordUser = document.getElementById('reg-discord-user').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        try {
            await db.registerUser({ preferredName, robloxUser, discordUser, email, password });
            Swal.fire({
                icon: 'success',
                title: 'Registration Submitted!',
                text: 'Your registration request has been submitted to the Admin Panel for review. An admin will accept your request shortly.',
                confirmButtonColor: '#10b981'
            });
            this.switchAuthTab('login');
            document.getElementById('form-register').reset();
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Registration Error',
                text: err.message,
                confirmButtonColor: '#ef4444'
            });
        }
    }

    /**
     * Log out active user
     */
    logout() {
        db.logout();
        if (this.suspensionTimerInterval) clearInterval(this.suspensionTimerInterval);
        this.checkAuth();
    }

    /**
     * Navigation Controller between portal screens
     */
    navigateTo(pageId) {
        if (!db.currentUser && pageId !== 'auth') return;

        // Check suspension
        if (db.currentUser && db.currentUser.status === 'Suspended') {
            this.showSuspensionScreen(db.currentUser);
            return;
        }

        this.hideAllPages();

        const dashBtn = document.getElementById('nav-dash-btn');
        if (pageId === 'dashboard') {
            dashBtn.classList.add('hidden');
            document.getElementById('dashboard-screen').classList.remove('hidden');
            this.renderDashboard();
        } else {
            dashBtn.classList.remove('hidden');
            const targetPage = document.getElementById(`page-${pageId}`);
            if (targetPage) {
                targetPage.classList.remove('hidden');
                // Trigger page-specific renderers
                switch (pageId) {
                    case 'calendar': this.renderCalendar(); break;
                    case 'allocations': this.renderAllocations(); break;
                    case 'loa': this.renderLOAPage(); break;
                    case 'consequences': this.renderConsequencesPage(); break;
                    case 'reports': this.renderReportsPage(); break;
                    case 'stats': this.renderStatsPage(); break;
                    case 'support': this.renderSupportPage(); break;
                    case 'admin': this.renderAdminPanel(); break;
                }
            }
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    hideAllPages() {
        const pages = ['dashboard-screen', 'page-calendar', 'page-allocations', 'page-loa', 'page-consequences', 'page-reports', 'page-stats', 'page-support', 'page-admin'];
        pages.forEach(p => {
            const el = document.getElementById(p);
            if (el) el.classList.add('hidden');
        });
    }

    /**
     * Render C5 Suspension Screen with Countdown Timer & Error Code (Summer)
     */
    showSuspensionScreen(user) {
        this.hideAllPages();
        document.getElementById('suspension-screen').classList.remove('hidden');

        const timerEl = document.getElementById('suspension-timer');
        if (this.suspensionTimerInterval) clearInterval(this.suspensionTimerInterval);

        const expiryMs = new Date(user.suspensionUntil).getTime();

        const updateTimer = () => {
            const nowMs = Date.now();
            const diff = expiryMs - nowMs;

            if (diff <= 0) {
                clearInterval(this.suspensionTimerInterval);
                db.removeSuspension(user.id);
                Swal.fire('Suspension Lifted!', 'Your suspension period has completed. Re-authenticating...', 'success')
                    .then(() => app.checkAuth());
                return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            timerEl.textContent = `${days.toString().padStart(2, '0')}d ${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m ${secs.toString().padStart(2, '0')}s`;
        };

        updateTimer();
        this.suspensionTimerInterval = setInterval(updateTimer, 1000);
    }

    /**
     * Render Dashboard Hub
     */
    renderDashboard() {
        const user = db.currentUser;
        document.getElementById('dash-user-name').textContent = user.preferredName;
        document.getElementById('dash-user-role').textContent = user.role;

        // Calculate attended flight allocations
        const attendedCount = db.data.allocations.filter(a => a.userId === user.id && a.status === 'Attending').length;

        // Render quota widget
        const quotaEl = document.getElementById('dash-quota-status');
        if (user.activityStatus === 'LOA') {
            quotaEl.innerHTML = `<span class="text-amber-400 font-bold">0/0 (LOA Active)</span>`;
        } else if (user.activityStatus === 'Reduced Activity') {
            const isMet = attendedCount >= 1;
            quotaEl.innerHTML = `<span class="${isMet ? 'text-emerald-400' : 'text-sky-400'} font-extrabold">${attendedCount}/1 Completed</span>`;
        } else {
            const isMet = attendedCount >= 3;
            quotaEl.innerHTML = `<span class="${isMet ? 'text-emerald-400' : 'text-sky-400'} font-extrabold">${attendedCount}/3 Completed</span>`;
        }

        // Check if consequence alert popup applies for LOA/Reduced Activity user
        this.checkLOAConsequenceNotice(user);
    }

    /**
     * Check if user on LOA received a consequence and show confirmation notice
     */
    checkLOAConsequenceNotice(user) {
        if (user.activityStatus === 'LOA' || user.activityStatus === 'Reduced Activity') {
            const hasUnseenNotice = localStorage.getItem(`loa_consequence_notice_seen_${user.id}`);
            const recentConsequences = db.data.consequences.filter(c => c.userId === user.id);
            if (recentConsequences.length > 0 && !hasUnseenNotice) {
                Swal.fire({
                    icon: 'info',
                    title: 'Flight Quota Exception Notice',
                    html: `<div class="text-left space-y-2 text-sm text-slate-300">
                        <p class="font-bold text-amber-400">Flight quota does not apply to this user until: ${user.loaUntil || 'End of LOA Period'}</p>
                        <p>You have received a consequence notice, but your active ${user.activityStatus} status maintains your current adjusted quota obligations.</p>
                    </div>`,
                    confirmButtonText: 'I Confirm & Acknowledge',
                    confirmButtonColor: '#f59e0b'
                }).then(() => {
                    localStorage.setItem(`loa_consequence_notice_seen_${user.id}`, 'true');
                });
            }
        }
    }

    // ==========================================
    // 1. CALENDAR PAGE RENDERER & ACTIONS
    // ==========================================

    changeMonth(delta) {
        this.currentMonth += delta;
        if (this.currentMonth < 0) {
            this.currentMonth = 11;
            this.currentYear--;
        } else if (this.currentMonth > 11) {
            this.currentMonth = 0;
            this.currentYear++;
        }
        this.renderCalendar();
    }

    renderCalendar() {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        document.getElementById('calendar-month-year').textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;

        const grid = document.getElementById('calendar-days-grid');
        grid.innerHTML = '';

        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

        // Empty cells before start day
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement('div');
            empty.className = "bg-slate-950/40 rounded-xl border border-slate-900 min-h-[70px]";
            grid.appendChild(empty);
        }

        // Render days
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${this.currentYear}-${(this.currentMonth + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            const dayFlights = db.data.flights.filter(f => f.date === dateStr);

            const dayCell = document.createElement('div');
            const hasFlights = dayFlights.length > 0;

            dayCell.className = `calendar-day-cell p-2 rounded-xl border flex flex-col justify-between min-h-[70px] cursor-pointer transition-all ${
                hasFlights ? 'bg-sky-950/30 border-sky-500/40 hover:bg-sky-900/40' : 'bg-slate-900/60 border-slate-800'
            }`;

            dayCell.onclick = () => this.showCalendarDayFlights(dateStr, dayFlights);

            let contentHtml = `<span class="text-xs font-bold ${hasFlights ? 'text-sky-300' : 'text-slate-400'}">${day}</span>`;
            if (hasFlights) {
                contentHtml += `<div class="mt-1 flex items-center gap-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] px-1.5 py-0.5 rounded font-bold">
                    <i class="fa-solid fa-plane text-[9px]"></i> ${dayFlights.length} Flight${dayFlights.length > 1 ? 's' : ''}
                </div>`;
            }

            dayCell.innerHTML = contentHtml;
            grid.appendChild(dayCell);
        }
    }

    showCalendarDayFlights(dateStr, flights) {
        const modal = document.getElementById('calendar-flight-modal');
        const modalDate = document.getElementById('modal-flight-date');
        const modalList = document.getElementById('modal-flight-list');

        modalDate.textContent = dateStr;
        modal.classList.remove('hidden');

        if (flights.length === 0) {
            modalList.innerHTML = `<p class="text-slate-400 text-xs text-center py-6">No scheduled flights for this date.</p>`;
            return;
        }

        modalList.innerHTML = flights.map(f => this.renderFlightCardHTML(f)).join('');
    }

    // ==========================================
    // 2. ALLOCATIONS PAGE RENDERER & LOGIC
    // ==========================================

    renderAllocations() {
        const container = document.getElementById('allocations-flight-container');
        if (db.data.flights.length === 0) {
            container.innerHTML = `<p class="text-slate-400 text-center py-10 bg-luma-card rounded-2xl border border-slate-800">No upcoming flights scheduled. Check back later!</p>`;
            return;
        }
        container.innerHTML = db.data.flights.map(f => this.renderFlightCardHTML(f)).join('');
    }

    /**
     * Shared HTML Card Renderer for Flights with Allocations & Role Lists
     */
    renderFlightCardHTML(flight) {
        const user = db.currentUser;
        const alloc = db.data.allocations.find(a => a.flightId === flight.id && a.userId === user.id);
        const currentStatus = alloc ? alloc.status : 'None';
        const currentRole = alloc ? alloc.role : 'Cabin crew';

        // Categorized Allocations Roster for this flight
        const flightAllocations = db.data.allocations.filter(a => a.flightId === flight.id);
        const attendingList = flightAllocations.filter(a => a.status === 'Attending');
        const unsureList = flightAllocations.filter(a => a.status === 'Unsure');
        const absentList = flightAllocations.filter(a => a.status === 'Absent');

        // Group attending staff by role
        const roles = ['Captain', 'First officer', 'Cabin crew', 'Ground crew', 'Security', 'Other'];
        const roleGroupHTML = roles.map(roleName => {
            const crewInRole = attendingList.filter(a => a.role === roleName || (roleName === 'Other' && !['Captain', 'First officer', 'Cabin crew', 'Ground crew', 'Security'].includes(a.role)));
            if (crewInRole.length === 0) return '';
            return `
                <div class="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
                    <p class="text-[11px] font-bold text-sky-400 uppercase tracking-wider mb-2 border-b border-slate-800 pb-1">
                        <i class="fa-solid fa-user-tag text-xs mr-1"></i> ${roleName} (${crewInRole.length})
                    </p>
                    <div class="flex flex-wrap gap-2">
                        ${crewInRole.map(c => `
                            <span class="px-2.5 py-1 bg-slate-900 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5">
                                <i class="fa-solid fa-circle text-[8px] text-emerald-400"></i> ${c.userName} ${c.role !== roleName ? `(${c.role})` : ''}
                            </span>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');

        return `
            <div class="bg-luma-card border border-slate-800 hover:border-slate-700 rounded-2xl p-6 shadow-xl space-y-5">
                <!-- Flight Header & Roblox Airport Link -->
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                    <div>
                        <div class="flex items-center gap-3">
                            <span class="px-3 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/30 font-black text-sm rounded-lg">${flight.code}</span>
                            <h3 class="text-xl font-bold text-white">${flight.airport}</h3>
                        </div>
                        <p class="text-xs text-slate-400 mt-1">
                            <i class="fa-solid fa-plane text-sky-400 mr-1"></i> Aircraft: <span class="text-slate-200 font-semibold">${flight.aircraft}</span> | Host: <span class="text-sky-300 font-bold">${flight.host}</span>
                        </p>
                    </div>

                    <div class="flex items-center gap-3">
                        <div class="text-right text-xs">
                            <p class="text-slate-400 font-medium">Flight Date & Time</p>
                            <p class="text-white font-bold">${flight.date} @ ${flight.time}</p>
                        </div>
                        <a href="${flight.airportLink}" target="_blank" class="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-all">
                            <i class="fa-solid fa-arrow-up-right-from-square"></i> Join Airport
                        </a>
                    </div>
                </div>

                <!-- Allocation Controls for Current User -->
                <div class="bg-slate-900/90 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <p class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Your Attendance Allocation</p>
                        <p class="text-xs text-slate-400">Mark present, unsure, or absent. Reason is mandatory for absences.</p>
                    </div>

                    <div class="flex flex-wrap items-center gap-2 w-full md:w-auto">
                        <!-- Role Selector (If Attending) -->
                        <select id="role-select-${flight.id}" class="bg-slate-950 border border-slate-800 focus:border-sky-500 rounded-lg px-3 py-2 text-xs text-white outline-none">
                            <option value="Cabin crew" ${currentRole === 'Cabin crew' ? 'selected' : ''}>Cabin crew</option>
                            <option value="Ground crew" ${currentRole === 'Ground crew' ? 'selected' : ''}>Ground crew</option>
                            <option value="First officer" ${currentRole === 'First officer' ? 'selected' : ''}>First officer</option>
                            <option value="Captain" ${currentRole === 'Captain' ? 'selected' : ''}>Captain</option>
                            <option value="Security" ${currentRole === 'Security' ? 'selected' : ''}>Security</option>
                            <option value="Other" ${!['Cabin crew','Ground crew','First officer','Captain','Security'].includes(currentRole) ? 'selected' : ''}>Other Role...</option>
                        </select>

                        <!-- Action Buttons -->
                        <button onclick="app.submitAllocation('${flight.id}', 'Attending')" class="px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${currentStatus === 'Attending' ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}">
                            <i class="fa-solid fa-circle-check"></i> Attending
                        </button>
                        <button onclick="app.submitAllocation('${flight.id}', 'Unsure')" class="px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${currentStatus === 'Unsure' ? 'bg-amber-600 text-white shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}">
                            <i class="fa-solid fa-circle-question"></i> Unsure
                        </button>
                        <button onclick="app.promptAbsenceReason('${flight.id}')" class="px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${currentStatus === 'Absent' ? 'bg-rose-600 text-white shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}">
                            <i class="fa-solid fa-circle-xmark"></i> Absent
                        </button>
                    </div>
                </div>

                <!-- Categorized Duty Roles Roster -->
                <div class="space-y-3 pt-2">
                    <p class="text-xs font-bold text-slate-400 uppercase tracking-wider">Flight Crew Roster & Duty Roles</p>
                    ${roleGroupHTML || '<p class="text-xs text-slate-500 italic">No staff members assigned to duty roles yet.</p>'}

                    <!-- Unsure / Absent Summary -->
                    <div class="flex flex-wrap gap-4 text-xs pt-2 text-slate-400">
                        <span><strong class="text-amber-400">Unsure (${unsureList.length}):</strong> ${unsureList.map(u => u.userName).join(', ') || 'None'}</span>
                        <span><strong class="text-rose-400">Absent (${absentList.length}):</strong> ${absentList.map(u => `${u.userName} (${u.reason || 'No reason'})`).join(', ') || 'None'}</span>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Submit allocation for a flight
     */
    submitAllocation(flightId, status, customReason = '') {
        const user = db.currentUser;
        let selectedRole = document.getElementById(`role-select-${flightId}`) ? document.getElementById(`role-select-${flightId}`).value : 'Cabin crew';

        if (selectedRole === 'Other') {
            Swal.fire({
                title: 'Specify Custom Role',
                input: 'text',
                inputPlaceholder: 'Enter custom role name...',
                showCancelButton: true,
                confirmButtonColor: '#0284c7'
            }).then(result => {
                if (result.isConfirmed && result.value) {
                    db.setAllocation(flightId, user.id, `${user.preferredName} (${user.robloxUser})`, status, result.value, customReason);
                    Swal.fire('Allocation Saved!', `Status set to ${status} as ${result.value}`, 'success');
                    this.renderAllocations();
                }
            });
            return;
        }

        db.setAllocation(flightId, user.id, `${user.preferredName} (${user.robloxUser})`, status, selectedRole, customReason);
        Swal.fire({
            icon: 'success',
            title: 'Allocation Recorded!',
            text: `Status updated to ${status} for flight.`,
            toast: true,
            position: 'top-end',
            timer: 2000,
            showConfirmButton: false
        });
        this.renderAllocations();
    }

    /**
     * Mandatory absence reason prompt
     */
    promptAbsenceReason(flightId) {
        Swal.fire({
            title: 'Mandatory Absence Reason',
            text: 'Staff marking absent MUST provide a reason. This reason will be logged on the Admin Panel.',
            input: 'textarea',
            inputPlaceholder: 'Type your reason for absence here...',
            inputValidator: (value) => {
                if (!value || !value.trim()) {
                    return 'You MUST provide a reason for absence!';
                }
            },
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            confirmButtonText: 'Submit Absence'
        }).then(result => {
            if (result.isConfirmed && result.value) {
                this.submitAllocation(flightId, 'Absent', result.value);
            }
        });
    }

    // ==========================================
    // 3. LOA & REDUCED ACTIVITY RENDERER
    // ==========================================

    renderLOAPage() {
        const container = document.getElementById('loa-list-container');
        const user = db.currentUser;
        const requests = db.data.loaRequests;

        if (requests.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-8">No LOA or Reduced Activity requests filed.</p>`;
            return;
        }

        container.innerHTML = requests.map(r => `
            <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="px-2.5 py-0.5 rounded text-[10px] font-extrabold ${r.type === 'LOA' ? 'badge-loa' : 'badge-reduced'}">${r.type}</span>
                        <h4 class="text-sm font-bold text-white">${r.userName}</h4>
                    </div>
                    <p class="text-xs text-slate-400 mt-1">Reason: ${r.reason}</p>
                    <p class="text-[11px] text-slate-500 mt-0.5"><i class="fa-solid fa-calendar text-amber-400 mr-1"></i> Active: ${r.startDate} to ${r.endDate}</p>
                </div>
                <div>
                    <span class="px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-bold">
                        ${r.status}
                    </span>
                </div>
            </div>
        `).join('');
    }

    handleLOASubmit(e) {
        e.preventDefault();
        const user = db.currentUser;
        const type = document.getElementById('loa-type').value;
        const startDate = document.getElementById('loa-start-date').value;
        const endDate = document.getElementById('loa-end-date').value;
        const reason = document.getElementById('loa-reason').value;

        db.submitLOARequest({
            userId: user.id,
            userName: `${user.preferredName} (${user.robloxUser})`,
            type,
            startDate,
            endDate,
            reason
        });

        Swal.fire('Request Submitted!', `Your ${type} application has been activated until ${endDate}.`, 'success');
        e.target.reset();
        this.renderLOAPage();
        this.renderNavUserBadges(db.currentUser);
    }

    // ==========================================
    // 4. CONSEQUENCES PAGE RENDERER
    // ==========================================

    renderConsequencesPage() {
        const user = db.currentUser;
        const userConsequences = db.data.consequences.filter(c => c.userId === user.id);

        // Update Tally Cards
        document.getElementById('tally-warnings').textContent = userConsequences.filter(c => ['C1','C2'].includes(c.level)).length;
        document.getElementById('tally-c3').textContent = userConsequences.filter(c => c.level === 'C3').length;
        document.getElementById('tally-c4').textContent = userConsequences.filter(c => ['C4A','C4B'].includes(c.level)).length;
        document.getElementById('tally-c5').textContent = userConsequences.filter(c => c.level === 'C5').length;

        // Upcoming C4 Sanctions (Detentions)
        const c4List = document.getElementById('c4-sanctions-list');
        const upcomingC4 = userConsequences.filter(c => ['C4A','C4B'].includes(c.level));

        if (upcomingC4.length === 0) {
            c4List.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No upcoming C4 detentions assigned.</p>`;
        } else {
            c4List.innerHTML = upcomingC4.map(c => `
                <div class="bg-rose-950/30 border border-rose-500/40 p-4 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="px-2.5 py-0.5 bg-rose-500 text-white font-extrabold text-xs rounded">${c.level === 'C4A' ? 'C4A (20 Mins)' : 'C4B (40 Mins)'}</span>
                        <span class="text-xs text-rose-300 font-bold">${c.c4Date} @ ${c.c4Time}</span>
                    </div>
                    <p class="text-xs text-slate-300"><strong>Location:</strong> ${c.c4Location || 'TBD Facility'}</p>
                    <p class="text-xs text-slate-400"><strong>Reason:</strong> ${c.reason}</p>
                </div>
            `).join('');
        }

        // Full Ledger
        const historyList = document.getElementById('consequence-history-list');
        if (userConsequences.length === 0) {
            historyList.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">Clean record! No consequences on file.</p>`;
        } else {
            historyList.innerHTML = userConsequences.map(c => `
                <div class="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between text-xs">
                    <div>
                        <span class="font-bold text-rose-400">${c.level}</span> - <span class="text-slate-200">${c.reason}</span>
                        <p class="text-[10px] text-slate-500 mt-0.5">Issued by ${c.issuedBy} on ${c.issuedDate}</p>
                    </div>
                </div>
            `).join('');
        }
    }

    // ==========================================
    // 5. REPORTS PAGE RENDERER & LOGIC
    // ==========================================

    renderReportsPage() {
        const container = document.getElementById('reports-list-container');
        const user = db.currentUser;
        const reports = db.data.reports;

        if (reports.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-10 bg-luma-card rounded-2xl border border-slate-800">No reports filed in system.</p>`;
            return;
        }

        container.innerHTML = reports.map(r => `
            <div class="bg-luma-card border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
                <div class="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div class="flex items-center gap-3">
                        <span class="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg">${r.offense}</span>
                        <h4 class="text-base font-bold text-white">Target: ${r.targetUser}</h4>
                    </div>
                    <span class="px-2.5 py-1 rounded-lg text-xs font-bold ${
                        r.status === 'Processing' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                        r.status === 'In review' ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30' : 'bg-emerald-500/20 text-emerald-400'
                    }">${r.status}</span>
                </div>

                <p class="text-xs text-slate-300 leading-relaxed">${r.description}</p>

                ${r.imageUrl ? `
                    <div class="mt-2">
                        <p class="text-[11px] font-bold text-slate-400 mb-1">Evidence Attachment:</p>
                        <img src="${r.imageUrl}" alt="Evidence" class="max-h-48 rounded-xl border border-slate-800 object-cover cursor-pointer" onclick="Swal.fire({imageUrl: '${r.imageUrl}', showConfirmButton: false})">
                    </div>
                ` : ''}

                <!-- Admin Replies -->
                ${r.replies && r.replies.length > 0 ? `
                    <div class="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-2 mt-2">
                        <p class="text-[11px] font-bold text-sky-400 uppercase tracking-wider">Admin Moderator Replies:</p>
                        ${r.replies.map(rep => `
                            <div class="text-xs text-slate-300">
                                <span class="font-bold text-white">${rep.author}:</span> ${rep.message}
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    toggleReportForm() {
        const form = document.getElementById('report-form-container');
        form.classList.toggle('hidden');
    }

    handleImageUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            this.uploadedImageBase64 = event.target.result;
            const previewBox = document.getElementById('report-image-preview-box');
            const previewImg = document.getElementById('report-image-preview');
            previewImg.src = this.uploadedImageBase64;
            previewBox.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    }

    handleReportSubmit(e) {
        e.preventDefault();
        const user = db.currentUser;
        const targetUser = document.getElementById('report-target-user').value;
        const offense = document.getElementById('report-offense').value;
        const description = document.getElementById('report-description').value;
        const urlInput = document.getElementById('report-image-url').value;

        const imageUrl = this.uploadedImageBase64 || urlInput || '';

        db.submitReport({
            reporterId: user.id,
            reporterName: user.preferredName,
            targetUser,
            offense,
            description,
            imageUrl
        });

        Swal.fire('Report Filed!', 'Your report has been submitted to the Admin Panel for review.', 'success');
        e.target.reset();
        this.uploadedImageBase64 = null;
        document.getElementById('report-image-preview-box').classList.add('hidden');
        this.toggleReportForm();
        this.renderReportsPage();
    }

    // ==========================================
    // 6. MY STATS PAGE RENDERER (CHART.JS)
    // ==========================================

    renderStatsPage() {
        const user = db.currentUser;
        document.getElementById('stat-total-flights').textContent = user.flightsAttended || 0;
        document.getElementById('stat-praise-points').textContent = user.praisePoints || 0;
        document.getElementById('stat-total-reports').textContent = db.data.reports.filter(r => r.reporterId === user.id).length;

        // Calculate tenure
        const joined = new Date(user.joinedDate);
        const diffDays = Math.floor((new Date() - joined) / (1000 * 60 * 60 * 24));
        document.getElementById('stat-tenure').textContent = `${diffDays} Days`;

        // Render 5-Week Chart
        const ctx = document.getElementById('flight-stats-chart').getContext('2d');
        if (this.statsChart) this.statsChart.destroy();

        const weeklyData = user.weeklyStats || [3, 4, 5, 2, 4];

        this.statsChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5 (Current)'],
                datasets: [{
                    label: 'Flights Attended',
                    data: weeklyData,
                    borderColor: '#38bdf8',
                    backgroundColor: 'rgba(56, 189, 248, 0.15)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#38bdf8',
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    },
                    x: {
                        grid: { color: 'rgba(255, 255, 255, 0.05)' },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    // ==========================================
    // 7. SUPPORT DESK RENDERER & LIVE CHAT
    // ==========================================

    renderSupportPage() {
        const ticketList = document.getElementById('support-ticket-list');
        const user = db.currentUser;
        const isStaff = user.role === 'Staff';
        const userTickets = isStaff ? db.data.supportTickets.filter(t => t.creatorId === user.id) : db.data.supportTickets;

        if (userTickets.length === 0) {
            ticketList.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No support tickets found.</p>`;
            return;
        }

        ticketList.innerHTML = userTickets.map(t => `
            <div onclick="app.selectSupportTicket('${t.id}')" class="p-3 rounded-xl border cursor-pointer transition-all ${
                this.selectedTicketId === t.id ? 'bg-purple-950/40 border-purple-500/50 shadow-md' : 'bg-slate-900 border-slate-800 hover:bg-slate-800'
            }">
                <div class="flex items-center justify-between">
                    <span class="text-xs font-bold text-white truncate max-w-[140px]">${t.subject}</span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded ${
                        t.status === 'Open' ? 'bg-emerald-500/20 text-emerald-400' :
                        t.status === 'Escalated' ? 'bg-rose-500/20 text-rose-400' : 'bg-slate-700 text-slate-400'
                    }">${t.status}</span>
                </div>
                <p class="text-[11px] text-slate-400 mt-1">By: ${t.creatorName} | ${t.category}</p>
            </div>
        `).join('');

        if (this.selectedTicketId) {
            this.renderSupportChat(this.selectedTicketId);
        }
    }

    selectSupportTicket(ticketId) {
        this.selectedTicketId = ticketId;
        this.renderSupportPage();
    }

    renderSupportChat(ticketId) {
        const ticket = db.data.supportTickets.find(t => t.id === ticketId);
        if (!ticket) return;

        const subjectEl = document.getElementById('chat-ticket-subject');
        const metaEl = document.getElementById('chat-ticket-meta');
        const messagesBox = document.getElementById('ticket-messages-box');
        const replyForm = document.getElementById('ticket-reply-form');
        const actionsBox = document.getElementById('chat-ticket-actions');

        subjectEl.textContent = ticket.subject;
        metaEl.textContent = `Category: ${ticket.category} | Created by ${ticket.creatorName} | Assigned Admin: ${ticket.assignedAdminName}`;

        replyForm.classList.remove('hidden');
        actionsBox.classList.remove('hidden');

        const user = db.currentUser;
        const isAdmin = ['Head Admin', 'Admin'].includes(user.role);

        // Actions: Close, Reopen, Escalate, Join
        let actionsHtml = '';
        if (ticket.status !== 'Closed') {
            actionsHtml += `<button onclick="app.setTicketStatus('${ticket.id}', 'Closed')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg">Close Ticket</button>`;
            if (isAdmin) {
                actionsHtml += `<button onclick="app.setTicketStatus('${ticket.id}', 'Escalated')" class="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg">Escalate</button>`;
                actionsHtml += `<button onclick="app.claimTicket('${ticket.id}')" class="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg">Join / Claim</button>`;
            }
        } else {
            actionsHtml += `<button onclick="app.setTicketStatus('${ticket.id}', 'Open')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg">Reopen Ticket</button>`;
        }
        actionsBox.innerHTML = actionsHtml;

        // Render messages
        messagesBox.innerHTML = ticket.messages.map(m => `
            <div class="p-3 rounded-xl max-w-[85%] text-xs space-y-1 ${
                m.senderId === user.id ? 'bg-purple-600/30 border border-purple-500/30 ml-auto text-right' : 'bg-slate-900 border border-slate-800'
            }">
                <div class="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                    <span class="font-bold ${m.role === 'Head Admin' ? 'text-rose-400' : m.role === 'Admin' ? 'text-purple-400' : 'text-sky-300'}">${m.senderName} (${m.role})</span>
                    <span>${new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p class="text-white leading-relaxed">${m.text}</p>
            </div>
        `).join('');

        messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    handleTicketReply(e) {
        e.preventDefault();
        if (!this.selectedTicketId) return;
        const input = document.getElementById('ticket-reply-input');
        const text = input.value.trim();
        if (!text) return;

        const user = db.currentUser;
        db.addTicketMessage(this.selectedTicketId, user.id, user.preferredName, user.role, text);
        input.value = '';
        this.renderSupportChat(this.selectedTicketId);
    }

    toggleNewTicketModal() {
        document.getElementById('modal-new-ticket').classList.toggle('hidden');
    }

    handleCreateTicket(e) {
        e.preventDefault();
        const user = db.currentUser;
        const subject = document.getElementById('ticket-subject').value;
        const category = document.getElementById('ticket-category').value;
        const message = document.getElementById('ticket-message').value;

        const ticket = db.createSupportTicket({
            creatorId: user.id,
            creatorName: `${user.preferredName} (${user.robloxUser})`,
            subject,
            category,
            message
        });

        this.toggleNewTicketModal();
        e.target.reset();
        this.selectSupportTicket(ticket.id);
        Swal.fire('Ticket Opened!', 'Your ticket has been sent to the Admin team.', 'success');
    }

    claimTicket(ticketId) {
        const user = db.currentUser;
        db.updateTicketStatus(ticketId, 'Open', user);
        this.renderSupportPage();
    }

    setTicketStatus(ticketId, status) {
        db.updateTicketStatus(ticketId, status);
        this.renderSupportPage();
    }

    // ==========================================
    // 8. ADMIN PANEL PARENT CONTROLLER
    // ==========================================

    renderAdminPanel() {
        const user = db.currentUser;
        if (!['Head Admin', 'Admin'].includes(user.role)) {
            Swal.fire('Access Denied', 'Admin privileges required.', 'error');
            this.navigateTo('dashboard');
            return;
        }

        // Render Pending Requests Count
        const pendingCount = db.data.users.filter(u => u.status === 'Pending').length;
        document.getElementById('admin-pending-count').textContent = pendingCount;

        this.renderAdminRequests();
        this.renderAdminRoster();
        this.renderAdminC4Register();
        this.populateAdminLogStaffDropdown();
        this.renderAdminFlights();
        this.renderAdminReports();
        this.renderAdminTickets();
    }

    switchAdminTab(tab) {
        const sections = ['requests', 'roster', 'c4register', 'logconsequence', 'flights', 'reports', 'tickets'];
        sections.forEach(s => {
            const sec = document.getElementById(`admin-section-${s}`);
            if (sec) sec.classList.add('hidden');
            const btn = document.getElementById(`admin-tab-${s}`);
            if (btn) btn.className = "px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all";
        });

        const targetSec = document.getElementById(`admin-section-${tab}`);
        if (targetSec) targetSec.classList.remove('hidden');

        const targetBtn = document.getElementById(`admin-tab-${tab}`);
        if (targetBtn) targetBtn.className = "px-4 py-2 rounded-lg text-xs font-bold transition-all bg-amber-500 text-slate-950 shadow-md";

        if (tab === 'c4register') this.renderAdminC4Register();
        if (tab === 'logconsequence') this.populateAdminLogStaffDropdown();
    }

    renderAdminC4Register() {
        const container = document.getElementById('admin-c4-register-list');
        if (!container) return;

        const c4List = db.data.consequences.filter(c => ['C4A', 'C4B'].includes(c.level) || c.c4Status);

        if (c4List.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-8">No C4 Detentions currently logged in the register.</p>`;
            return;
        }

        container.innerHTML = c4List.map(c => `
            <div class="bg-slate-900 border border-slate-800 p-5 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
                <div class="space-y-1">
                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 bg-rose-600 text-white font-extrabold text-xs rounded-lg">${c.level}</span>
                        <h4 class="text-base font-bold text-white">${c.userName}</h4>
                        <span class="px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                            c.c4Status === 'Passed' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            c.c4Status === 'Failed' ? 'bg-red-600 text-white font-black' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }">${c.c4Status || 'Pending'}</span>
                    </div>
                    <p class="text-xs text-slate-300"><strong>Scheduled Date & Time:</strong> ${c.c4Date || 'TBD'} @ ${c.c4Time || 'TBD'}</p>
                    <p class="text-xs text-slate-400"><strong>Location:</strong> ${c.c4Location || 'Training Facility'}</p>
                    <p class="text-xs text-slate-400"><strong>Reason:</strong> ${c.reason} <span class="text-slate-500">(Issued by ${c.issuedBy})</span></p>
                </div>

                <div class="flex items-center gap-2 w-full md:w-auto">
                    <button onclick="app.evaluateC4('${c.id}', 'Passed')" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-check-circle"></i> Mark as Pass
                    </button>
                    <button onclick="app.evaluateC4('${c.id}', 'Failed')" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5">
                        <i class="fa-solid fa-times-circle"></i> Mark as Fail
                    </button>
                </div>
            </div>
        `).join('');
    }

    evaluateC4(cId, result) {
        const res = db.markC4DetentionResult(cId, result);
        if (!res) return;

        if (result === 'Passed') {
            Swal.fire('Detention Cleared!', `Marked C4 detention as PASSED for ${res.csq.userName}.`, 'success');
        } else {
            if (res.action === 'EscalatedToC4B') {
                Swal.fire('C4A Failed!', `C4A Detention failed. Escalated automatically to C4B (40 Minutes Detention) for ${res.csq.userName}.`, 'warning');
            } else if (res.action === 'Suspended2Days') {
                Swal.fire('C4B Failed - 2-Day Suspension Enforced!', `C4B Detention failed! ${res.csq.userName} has been placed on an automatic 2-Day (48 Hour) Suspension (C5) and locked out of the portal!`, 'error');
            }
        }

        this.renderAdminC4Register();
        this.renderAdminRoster();
    }

    populateAdminLogStaffDropdown() {
        const select = document.getElementById('admin-log-target-user');
        if (!select) return;

        const approvedUsers = db.data.users.filter(u => u.status === 'Approved' || u.status === 'Suspended');
        select.innerHTML = approvedUsers.map(u => `<option value="${u.id}">${u.preferredName} (${u.robloxUser}) - ${u.email}</option>`).join('');
        this.toggleAdminLogFields();
    }

    toggleAdminLogFields() {
        const level = document.getElementById('admin-log-level').value;
        const c4Fields = document.getElementById('admin-log-c4-fields');
        const c5Fields = document.getElementById('admin-log-c5-fields');

        if (!c4Fields || !c5Fields) return;

        if (['C4A', 'C4B'].includes(level)) {
            c4Fields.classList.remove('hidden');
            c5Fields.classList.add('hidden');
        } else if (level === 'C5') {
            c5Fields.classList.remove('hidden');
            c4Fields.classList.add('hidden');
        } else {
            c4Fields.classList.add('hidden');
            c5Fields.classList.add('hidden');
        }
    }

    handleAdminLogConsequence(e) {
        e.preventDefault();
        const userId = document.getElementById('admin-log-target-user').value;
        const level = document.getElementById('admin-log-level').value;
        const reason = document.getElementById('admin-log-reason').value;
        const c4Date = document.getElementById('admin-log-c4-date').value;
        const c4Time = document.getElementById('admin-log-c4-time').value;
        const c4Location = document.getElementById('admin-log-c4-location').value;
        const c5DurationHours = document.getElementById('admin-log-c5-hours').value;

        const adminUser = db.currentUser;

        db.assignConsequence({
            userId,
            level,
            reason,
            issuedBy: `${adminUser.preferredName} (${adminUser.robloxUser})`,
            c4Date,
            c4Time,
            c4Location,
            c5DurationHours
        });

        Swal.fire('Consequence Logged!', `Level ${level} action successfully logged for staff member.`, 'warning');
        e.target.reset();
        this.renderAdminPanel();
    }

    renderAdminRequests() {
        const container = document.getElementById('admin-requests-list');
        const pending = db.data.users.filter(u => u.status === 'Pending');

        if (pending.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No pending staff registration requests.</p>`;
            return;
        }

        container.innerHTML = pending.map(u => `
            <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h4 class="text-sm font-bold text-white">${u.preferredName}</h4>
                    <p class="text-xs text-slate-400">Roblox: <strong class="text-sky-300">${u.robloxUser}</strong> | Discord: <strong class="text-indigo-300">${u.discordUser}</strong></p>
                    <p class="text-xs text-slate-500">Email: ${u.email}</p>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="app.approveStaff('${u.id}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg shadow">
                        Accept Staff Member
                    </button>
                    <button onclick="app.rejectStaff('${u.id}')" class="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white font-bold text-xs rounded-lg border border-rose-500/30">
                        Reject Request
                    </button>
                </div>
            </div>
        `).join('');
    }

    approveStaff(userId) {
        db.approveUser(userId);
        Swal.fire('Staff Approved!', 'User can now log into Luma Oportal.', 'success');
        this.renderAdminPanel();
    }

    rejectStaff(userId) {
        db.rejectUser(userId);
        Swal.fire('Request Rejected', 'Applicant removed from list.', 'info');
        this.renderAdminPanel();
    }

    /**
     * Admin Staff Roster & Promotion Password Gate ("Luma2025" SHA-256)
     */
    renderAdminRoster() {
        const container = document.getElementById('admin-roster-list');
        const approvedUsers = db.data.users.filter(u => u.status === 'Approved' || u.status === 'Suspended');

        container.innerHTML = approvedUsers.map(u => `
            <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <div class="flex items-center gap-2">
                        <h4 class="text-sm font-bold text-white">${u.preferredName} (${u.robloxUser})</h4>
                        <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            u.role === 'Head Admin' ? 'badge-head-admin' : u.role === 'Admin' ? 'badge-admin' : 'bg-slate-800 text-slate-300'
                        }">${u.role}</span>
                        ${u.status === 'Suspended' ? '<span class="px-2 py-0.5 bg-rose-600 text-white text-[10px] font-black rounded">SUSPENDED</span>' : ''}
                    </div>
                    <p class="text-xs text-slate-400 mt-1">Discord: ${u.discordUser} | Email: ${u.email}</p>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <!-- Promote / Demote Button -->
                    <button onclick="app.promptPromotionPassword('${u.id}', '${u.role === 'Admin' ? 'Staff' : 'Admin'}')" class="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/30 text-xs font-bold rounded-lg transition-all">
                        <i class="fa-solid fa-key mr-1"></i> ${u.role === 'Admin' ? 'Demote to Staff' : 'Promote to Admin'}
                    </button>

                    <!-- Force LOA -->
                    <button onclick="app.promptForceLOA('${u.id}')" class="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600 text-sky-300 hover:text-white border border-sky-500/30 text-xs font-bold rounded-lg">
                        Force LOA
                    </button>

                    <!-- Issue Consequence -->
                    <button onclick="app.openConsequenceModal('${u.id}', '${u.preferredName}')" class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow">
                        Issue Consequence
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Password Gate for Role Promotions: Verifies encrypted "Luma2025"
     */
    promptPromotionPassword(targetUserId, targetRole) {
        Swal.fire({
            title: 'Security Authentication Required',
            text: 'Enter the encrypted promotion security password to alter user privileges:',
            input: 'password',
            inputPlaceholder: 'Enter Security Password...',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'Verify & Change Role'
        }).then(async result => {
            if (result.isConfirmed) {
                const pass = result.value;
                const match = await CryptoUtils.verifyPassword(pass, CryptoUtils.PROMOTION_PASSWORD_HASH);
                if (match) {
                    db.updateUserRole(targetUserId, targetRole);
                    Swal.fire('Role Updated!', `User privilege changed to ${targetRole}.`, 'success');
                    this.renderAdminPanel();
                } else {
                    Swal.fire('Access Denied', 'Incorrect security password. Promotion blocked.', 'error');
                }
            }
        });
    }

    promptForceLOA(userId) {
        Swal.fire({
            title: 'Force LOA / Reduced Activity',
            html: `
                <select id="force-loa-type" class="swal2-input">
                    <option value="LOA">Leave of Absence (LOA)</option>
                    <option value="Reduced Activity">Reduced Activity</option>
                </select>
                <input type="date" id="force-loa-date" class="swal2-input" placeholder="End Date">
            `,
            showCancelButton: true,
            confirmButtonColor: '#0284c7'
        }).then(result => {
            if (result.isConfirmed) {
                const type = document.getElementById('force-loa-type').value;
                const date = document.getElementById('force-loa-date').value || db.getRelativeDateStr(7);
                db.forceLOA(userId, type, date);
                Swal.fire('LOA Enforced!', `User forced onto ${type} until ${date}.`, 'success');
                this.renderAdminPanel();
            }
        });
    }

    // --- CONSEQUENCE ISSUANCE MODAL CONTROLS ---

    openConsequenceModal(userId, userName) {
        document.getElementById('consequence-target-user-id').value = userId;
        document.getElementById('consequence-target-name').textContent = userName;
        document.getElementById('modal-give-consequence').classList.remove('hidden');
        this.toggleConsequenceFields();
    }

    toggleConsequenceFields() {
        const level = document.getElementById('consequence-level').value;
        const c4Fields = document.getElementById('c4-fields');
        const c5Fields = document.getElementById('c5-fields');

        if (['C4A', 'C4B'].includes(level)) {
            c4Fields.classList.remove('hidden');
            c5Fields.classList.add('hidden');
        } else if (level === 'C5') {
            c5Fields.classList.remove('hidden');
            c4Fields.classList.add('hidden');
        } else {
            c4Fields.classList.add('hidden');
            c5Fields.classList.add('hidden');
        }
    }

    handleAssignConsequence(e) {
        e.preventDefault();
        const userId = document.getElementById('consequence-target-user-id').value;
        const level = document.getElementById('consequence-level').value;
        const reason = document.getElementById('consequence-reason').value;
        const c4Date = document.getElementById('c4-date').value;
        const c4Time = document.getElementById('c4-time').value;
        const c4Location = document.getElementById('c4-location').value;
        const c5DurationHours = document.getElementById('c5-duration-hours').value;

        const adminUser = db.currentUser;

        db.assignConsequence({
            userId,
            level,
            reason,
            issuedBy: `${adminUser.preferredName} (${adminUser.robloxUser})`,
            c4Date,
            c4Time,
            c4Location,
            c5DurationHours
        });

        document.getElementById('modal-give-consequence').classList.add('hidden');
        e.target.reset();
        Swal.fire('Consequence Issued!', `Level ${level} action assigned to user.`, 'warning');
        this.renderAdminPanel();
    }

    // --- FLIGHT CREATION & MANAGEMENT ---

    handleCreateFlight(e) {
        e.preventDefault();
        const code = document.getElementById('flight-code').value;
        const host = document.getElementById('flight-host').value;
        const aircraft = document.getElementById('flight-aircraft').value;
        const airport = document.getElementById('flight-airport').value;
        const airportLink = document.getElementById('flight-airport-link').value;
        const date = document.getElementById('flight-date').value;
        const time = document.getElementById('flight-time').value;

        db.createFlight({ code, host, aircraft, airport, airportLink, date, time });

        Swal.fire('Flight Published!', `Flight ${code} scheduled for ${date}.`, 'success');
        e.target.reset();
        this.renderAdminPanel();
    }

    renderAdminFlights() {
        const container = document.getElementById('admin-flights-list');
        const flights = db.data.flights;

        if (flights.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No flights created.</p>`;
            return;
        }

        container.innerHTML = flights.map(f => {
            const absences = db.data.allocations.filter(a => a.flightId === f.id && a.status === 'Absent');
            return `
                <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                    <div class="flex items-center justify-between">
                        <span class="px-2.5 py-1 bg-sky-500/20 text-sky-300 font-bold text-xs rounded">${f.code} - ${f.airport}</span>
                        <span class="text-xs text-slate-400 font-bold">${f.date} @ ${f.time}</span>
                    </div>
                    <p class="text-xs text-slate-300">Host: ${f.host} | Aircraft: ${f.aircraft}</p>
                    <!-- Absence Reasons List -->
                    <div class="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <p class="text-[11px] font-bold text-rose-400 uppercase tracking-wider mb-1">Submitted Absence Reasons (${absences.length}):</p>
                        ${absences.length > 0 ? absences.map(a => `<div class="text-[11px] text-slate-300">• <strong>${a.userName}:</strong> ${a.reason}</div>`).join('') : '<p class="text-[11px] text-slate-500">No staff absences logged for this flight.</p>'}
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- ADMIN REPORTS MODERATION ---

    renderAdminReports() {
        const container = document.getElementById('admin-reports-list');
        const reports = db.data.reports;

        if (reports.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No reports filed.</p>`;
            return;
        }

        container.innerHTML = reports.map(r => `
            <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl space-y-3">
                <div class="flex items-center justify-between">
                    <div>
                        <span class="font-bold text-white text-sm">Target: ${r.targetUser}</span>
                        <span class="text-xs text-slate-400 ml-2">(${r.offense})</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <select onchange="app.updateReportStatus('${r.id}', this.value)" class="bg-slate-950 border border-slate-800 text-xs text-white rounded p-1">
                            <option value="Processing" ${r.status==='Processing'?'selected':''}>Processing</option>
                            <option value="In review" ${r.status==='In review'?'selected':''}>In review</option>
                            <option value="Closed" ${r.status==='Closed'?'selected':''}>Closed</option>
                        </select>
                    </div>
                </div>
                <p class="text-xs text-slate-300">${r.description}</p>
                <button onclick="app.promptAdminReplyReport('${r.id}')" class="px-3 py-1 bg-sky-600 text-white text-xs font-bold rounded">Add Official Admin Reply</button>
            </div>
        `).join('');
    }

    updateReportStatus(reportId, newStatus) {
        db.updateReportStatus(reportId, newStatus);
        Swal.fire('Report Status Updated', `Set to ${newStatus}`, 'success');
        this.renderAdminPanel();
    }

    promptAdminReplyReport(reportId) {
        const adminUser = db.currentUser;
        Swal.fire({
            title: 'Admin Response',
            input: 'textarea',
            inputPlaceholder: 'Type reply message...',
            showCancelButton: true
        }).then(result => {
            if (result.isConfirmed && result.value) {
                db.updateReportStatus(reportId, 'In review', {
                    author: `${adminUser.preferredName} (${adminUser.role})`,
                    message: result.value
                });
                Swal.fire('Reply Added', 'Response posted on report.', 'success');
                this.renderAdminPanel();
            }
        });
    }

    renderAdminTickets() {
        const container = document.getElementById('admin-tickets-list');
        const tickets = db.data.supportTickets;

        if (tickets.length === 0) {
            container.innerHTML = `<p class="text-slate-500 text-xs text-center py-6">No support tickets.</p>`;
            return;
        }

        container.innerHTML = tickets.map(t => `
            <div class="bg-slate-900 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                <div>
                    <h4 class="text-xs font-bold text-white">${t.subject} (${t.category})</h4>
                    <p class="text-[11px] text-slate-400">Created by: ${t.creatorName} | Assigned: ${t.assignedAdminName}</p>
                </div>
                <button onclick="app.navigateTo('support'); app.selectSupportTicket('${t.id}')" class="px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded">
                    Open Chat
                </button>
            </div>
        `).join('');
    }

    // --- FIREBASE CONFIG MODAL ---

    openFirebaseConfigModal() {
        document.getElementById('modal-firebase-config').classList.remove('hidden');
    }

    closeFirebaseConfigModal() {
        document.getElementById('modal-firebase-config').classList.add('hidden');
    }

    saveFirebaseConfig(e) {
        e.preventDefault();
        const apiKey = document.getElementById('fb-apiKey').value;
        const authDomain = document.getElementById('fb-authDomain').value;
        const projectId = document.getElementById('fb-projectId').value;

        db.data.firebaseConfig = { apiKey, authDomain, projectId };
        db.save();

        this.closeFirebaseConfigModal();
        Swal.fire('Firebase Configured!', 'Credentials stored. Realtime bridge active.', 'success');
    }
}

// Global Application Instance
const app = new LumaApp();

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});
