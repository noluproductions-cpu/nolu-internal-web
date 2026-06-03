/* ==========================================================================
   NOLU Studio Internal Web PWA - Custom JavaScript Logic
   ========================================================================== */

// MARK: - State Management
let state = {
    clients: [],
    projects: [],
    transactions: [],
    ideas: [],
    events: []
};

// Temp hooks list for the Add Idea form
let tempHooksList = [];

// Selected items for detail views
let activeProjectId = null;
let activeClientId = null;
let activeIdeaId = null;

// Firebase State Variables
let db = null;
let isFirebaseConnected = false;
let firebaseConfig = null;
let fbListeners = [];

// Selected filter for transactions (0 = All, 1 = Income, 2 = Expense)
let currentTxFilter = 0;
// Selected filter status for projects
let currentProjStatus = 'preProduction';

// MARK: - Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    // 1. Register PWA Service Worker
    registerServiceWorker();
    
    // 2. Try to load Firebase Configuration
    loadFirebaseConfigFromLocalStorage();
    
    // 3. Connect to Firebase if config exists, otherwise load locally
    if (firebaseConfig) {
        connectToFirebase(firebaseConfig);
    } else {
        loadStateFromLocalStorage();
        if (state.clients.length === 0 && state.projects.length === 0 && state.transactions.length === 0) {
            loadMockData();
        }
        updateDbStatusUI(false);
        renderAll();
    }
    
    // 4. Set up form dates default and tx categories
    setDefaultFormDates();
    toggleTxCategories();
    
    // 5. Bind Client Search Input listener
    document.getElementById('client-search').addEventListener('input', (e) => {
        renderClients(e.target.value.trim());
    });
});

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js')
                .then(reg => console.log('Service Worker zaregistrován úspěšně.', reg.scope))
                .catch(err => console.error('Chyba registrace Service Workera:', err));
        });
    }
}

// MARK: - Firebase Helper Functions
function loadFirebaseConfigFromLocalStorage() {
    const raw = localStorage.getItem('nolu_firebase_config');
    if (raw) {
        try {
            firebaseConfig = JSON.parse(raw);
        } catch (e) {
            console.error('Nepodařilo se parsovat Firebase config:', e);
        }
    }
}

function updateDbStatusUI(connected) {
    const statusDot = document.getElementById('db-status-dot');
    const statusText = document.getElementById('db-status-text');
    const settingsStatusDot = document.getElementById('settings-status-dot');
    const settingsStatusText = document.getElementById('settings-status-text');
    const migrationBox = document.getElementById('migration-box');
    
    if (connected) {
        if (statusDot) {
            statusDot.className = 'status-dot firebase';
            statusText.textContent = 'Firebase';
        }
        if (settingsStatusDot) {
            settingsStatusDot.className = 'status-dot firebase';
            settingsStatusText.textContent = 'Připojeno k Firebase Firestore (Cloud)';
        }
        if (migrationBox) {
            migrationBox.style.display = 'block';
        }
        
        // Populate configuration values in settings sheet inputs
        const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        fields.forEach(f => {
            const input = document.getElementById(`fb-${f}`);
            if (input && firebaseConfig) {
                input.value = firebaseConfig[f] || '';
            }
        });
    } else {
        if (statusDot) {
            statusDot.className = 'status-dot local';
            statusText.textContent = 'Lokální';
        }
        if (settingsStatusDot) {
            settingsStatusDot.className = 'status-dot local';
            settingsStatusText.textContent = 'Lokální režim (Odpojeno)';
        }
        if (migrationBox) {
            migrationBox.style.display = 'none';
        }
    }
}

function connectToFirebase(config) {
    if (typeof firebase === 'undefined') {
        console.error('Firebase SDK není načteno!');
        updateDbStatusUI(false);
        loadStateFromLocalStorage();
        renderAll();
        return;
    }
    
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(config);
        }
        db = firebase.firestore();
        
        // Enable offline persistence for PWA support
        db.enablePersistence({ synchronizeTabs: true })
            .catch(err => {
                if (err.code == 'failed-precondition') {
                    console.warn("Více otevřených tabů, persistence povolena jen v jednom.");
                } else if (err.code == 'unimplemented') {
                    console.warn("Prohlížeč nepodporuje offline persistenci Firestore.");
                }
            });
            
        isFirebaseConnected = true;
        updateDbStatusUI(true);
        setupFirestoreListeners();
        
    } catch (e) {
        console.error('Chyba při připojování k Firebase:', e);
        isFirebaseConnected = false;
        updateDbStatusUI(false);
        alert('Připojení k Firebase selhalo. Zkontrolujte prosím konfigurační údaje.');
        loadStateFromLocalStorage();
        renderAll();
    }
}

function setupFirestoreListeners() {
    fbListeners.forEach(unsub => unsub());
    fbListeners = [];
    
    const collections = ['clients', 'projects', 'transactions', 'ideas', 'events'];
    
    collections.forEach(colName => {
        const unsub = db.collection(colName).onSnapshot(snapshot => {
            const dataList = [];
            snapshot.forEach(doc => {
                dataList.push({ id: doc.id, ...doc.data() });
            });
            
            state[colName] = dataList;
            renderAll();
            
            // Refresh details sheets if they are active
            if (colName === 'clients' && activeClientId) {
                const client = state.clients.find(c => c.id === activeClientId);
                if (client) viewClientDetail(activeClientId);
            } else if (colName === 'projects' && activeProjectId) {
                const proj = state.projects.find(p => p.id === activeProjectId);
                if (proj) renderProjectDetailBody(proj);
            } else if (colName === 'ideas' && activeIdeaId) {
                const idea = state.ideas.find(i => i.id === activeIdeaId);
                if (idea) viewIdeaDetail(activeIdeaId);
            }
        }, err => {
            console.error(`Chyba firestore listeneru pro ${colName}:`, err);
        });
        fbListeners.push(unsub);
    });
}

function saveFirebaseConfig(e) {
    e.preventDefault();
    
    const config = {
        apiKey: document.getElementById('fb-apiKey').value.trim(),
        authDomain: document.getElementById('fb-authDomain').value.trim(),
        projectId: document.getElementById('fb-projectId').value.trim(),
        storageBucket: document.getElementById('fb-storageBucket').value.trim(),
        messagingSenderId: document.getElementById('fb-messagingSenderId').value.trim(),
        appId: document.getElementById('fb-appId').value.trim()
    };
    
    localStorage.setItem('nolu_firebase_config', JSON.stringify(config));
    firebaseConfig = config;
    location.reload();
}

function clearFirebaseConfig() {
    if (confirm('Opravdu chcete odpojit Firebase a přejít zpět do lokálního režimu?')) {
        localStorage.removeItem('nolu_firebase_config');
        location.reload();
    }
}

function migrateLocalDataToFirebase() {
    if (!isFirebaseConnected || !db) {
        alert('Firebase není připojeno!');
        return;
    }
    
    const rawLocal = localStorage.getItem('nolu_studio_state');
    if (!rawLocal) {
        alert('Nenalezena žádná lokální data k migraci.');
        return;
    }
    
    let localState;
    try {
        localState = JSON.parse(rawLocal);
    } catch(e) {
        alert('Chyba při načítání lokálních dat.');
        return;
    }
    
    const collections = ['clients', 'projects', 'transactions', 'ideas', 'events'];
    let totalItems = 0;
    
    collections.forEach(colName => {
        if (localState[colName] && Array.isArray(localState[colName])) {
            totalItems += localState[colName].length;
        }
    });
    
    if (totalItems === 0) {
        alert('Lokální data jsou prázdná, není co migrovat.');
        return;
    }
    
    if (confirm(`Chcete nahrát ${totalItems} položek z tohoto zařízení do Firebase cloudu?`)) {
        const batch = db.batch();
        let addedCount = 0;
        
        collections.forEach(colName => {
            const items = localState[colName];
            if (items && Array.isArray(items)) {
                items.forEach(item => {
                    const docRef = db.collection(colName).doc(item.id);
                    batch.set(docRef, item);
                    addedCount++;
                });
            }
        });
        
        batch.commit()
            .then(() => {
                alert(`Úspěšně nahráno ${addedCount} položek do Firebase. Data jsou nyní sdílená.`);
            })
            .catch(err => {
                console.error('Chyba migrace dat:', err);
                alert('Chyba při nahrávání dat do databáze. Zkontrolujte prosím Firestore Rules.');
            });
    }
}

// MARK: - LocalStorage persistence
function saveStateToLocalStorage() {
    localStorage.setItem('nolu_studio_state', JSON.stringify(state));
}

function loadStateFromLocalStorage() {
    const raw = localStorage.getItem('nolu_studio_state');
    if (raw) {
        try {
            state = JSON.parse(raw);
        } catch (e) {
            console.error('Nepodařilo se parsovat data z localStorage:', e);
        }
    }
}

// MARK: - Navigation Control
function switchTab(index, btnEl) {
    // Update active tab styling
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(t => t.classList.remove('active'));
    btnEl.classList.add('active');
    
    // Show selected screen
    const screens = [
        'screen-dashboard',
        'screen-projects',
        'screen-clients',
        'screen-finances',
        'screen-ideas'
    ];
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screens[index]);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Trigger specific render updates if needed
    renderAll();
}

function openSheet(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden'; // prevent bg scrolling
    }
}

function closeSheet(id) {
    const overlay = document.getElementById(id);
    if (overlay) {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

function setDefaultFormDates() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('tx-date').value = today;
    document.getElementById('project-deadline').value = today;
    
    // Set event datetime local
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('event-date').value = now.toISOString().slice(0, 16);
}

// MARK: - Mock Data Builder
function loadMockData() {
    state.clients = [
        { id: "c1", name: "Teodor Novák", company: "VOŠ a SPŠE Plzeň", email: "skola@spse.cz", phone: "+420 123 456 789", status: "active", notes: "Dlouhodobý klient, správa sociálních sítí." },
        { id: "c2", name: "Jiří Král", company: "Culture Coworking", email: "info@culturecowork.ie", phone: "+353 87 123 4567", status: "completed", notes: "Irský co-working, úspěšná marketingová kampaň." },
        { id: "c3", name: "Petr Novotný", company: "RoboVehicle 2025", email: "petr@robovehicle.cz", phone: "+420 987 654 321", status: "completed", notes: "Jednorázové pokrytí akce." }
    ];
    
    state.projects = [
        {
            id: "p1",
            title: "Správa Sítí SPŠE",
            clientName: "VOŠ a SPŠE Plzeň",
            tag: "Social Media",
            status: "editing",
            deadline: new Date(Date.now() + 86400000 * 14).toISOString().split('T')[0],
            budget: 15000,
            role: "PR & Produkce",
            desc: "Každodenní tvorba obsahu, příprava grafiky, mentoring studentského týmu a správa rozpočtů.",
            tasks: [
                { id: "t1_1", title: "Natočit reels ze soutěže", isCompleted: true },
                { id: "t1_2", title: "Sestříhat školní podcast", isCompleted: false },
                { id: "t1_3", title: "Připravit grafiky na příští týden", isCompleted: false }
            ],
            deliverables: ["10x Reels měsíčně", "2x Podcast", "Grafická kampaň"]
        },
        {
            id: "p2",
            title: "Cinematic Recap RoboVehicle",
            clientName: "RoboVehicle 2025",
            tag: "Video",
            status: "delivered",
            deadline: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
            budget: 25000,
            role: "Kamera & Střih",
            desc: "Kompletní video a fotodokumentace pětidenní mezinárodní soutěže. Denní recapy do 12 hodin od konce akce.",
            tasks: [
                { id: "t2_1", title: "Natáčení finále", isCompleted: true },
                { id: "t2_2", title: "Střih hlavního recap videa", isCompleted: true },
                { id: "t2_3", title: "Odevzdání fotek klientovi", isCompleted: true }
            ],
            deliverables: ["Cinematic Promo Video", "5x Daily Recap", "100x Upravená fotka"]
        }
    ];
    
    state.transactions = [
        { id: "tx1", title: "Záloha - RoboVehicle", amount: 12500, type: "income", category: "Projekty", date: new Date(Date.now() - 86400000 * 10).toISOString().split('T')[0] },
        { id: "tx2", title: "Doplatek - RoboVehicle", amount: 12500, type: "income", category: "Projekty", date: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0] },
        { id: "tx3", title: "Měsíční paušál - SPŠE Plzeň", amount: 15000, type: "income", category: "Projekty", date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0] },
        { id: "tx4", title: "Nákup DJI MIC 2", amount: 9200, type: "expense", category: "Technika", date: new Date(Date.now() - 86400000 * 8).toISOString().split('T')[0] },
        { id: "tx5", title: "Cestovné a benzín - natáčení Plzeň", amount: 1200, type: "expense", category: "Cestovné", date: new Date(Date.now() - 86400000 * 4).toISOString().split('T')[0] }
    ];
    
    state.ideas = [
        { id: "id1", title: "TikTok Trend - Jak točíme na iPhone", category: "reels", script: "Ukázat zákulisí natáčení na iPhone 16 Pro, rychlý střih, přechody a výsledek za 15 sekund.", hooks: ["„Tohle video bylo natočené na iPhone...“", "„Proč už s sebou netaháme těžkou kameru?“"] },
        { id: "id2", title: "Branding koncept pro lokální kavárnu", category: "branding", script: "Minimalistické logo, zemité barvy (béžová, tmavě hnědá), zaměření na organický dosah přes lokální komunitu.", hooks: ["„Vizuál, který voní kávou.“"] }
    ];
    
    state.events = [
        { id: "e1", title: "Natáčení podcastu SPŠE", type: "shooting", date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16), durationHours: 3.0, location: "Ateliér SPŠE Plzeň", notes: "Nahrávání rozhovoru s ředitelem školy." },
        { id: "e2", title: "Schůzka s novým klientem", type: "meeting", date: new Date(Date.now() + 86400000 * 4).toISOString().slice(0, 16), durationHours: 1.5, location: "Kavárna Družba", notes: "Projednání možného brandingu kavárny." },
        { id: "e3", title: "Odevzdání videa SPŠE Plzeň", type: "deadline", date: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 16), durationHours: 0, location: "Online", notes: "Odeslání finálního sestřihu PR videa." }
    ];
    
    saveStateToLocalStorage();
}

// MARK: - Global Rendering Router
function renderAll() {
    renderDashboard();
    renderProjects();
    renderClients();
    renderFinances();
    renderIdeas();
}

// MARK: - Render Dashboard Screen
function renderDashboard() {
    // Calculate Monthly Profit
    const incomeSum = state.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenseSum = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netProfit = incomeSum - expenseSum;
    
    const profitEl = document.getElementById('dash-profit');
    profitEl.textContent = `${netProfit.toLocaleString('cs-CZ')} Kč`;
    profitEl.className = `profit-value ${netProfit >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('dash-income').textContent = `+${incomeSum.toLocaleString('cs-CZ')} Kč`;
    document.getElementById('dash-expense').textContent = `-${expenseSum.toLocaleString('cs-CZ')} Kč`;
    
    // Active Counters
    const activeProjectsCount = state.projects.filter(p => p.status !== 'delivered').length;
    const activeClientsCount = state.clients.filter(c => c.status === 'active').length;
    
    document.getElementById('count-projects').textContent = activeProjectsCount;
    document.getElementById('count-clients').textContent = activeClientsCount;
    
    // Render Agenda / Events
    const agendaEl = document.getElementById('dash-agenda');
    const upcomingEvents = state.events
        .filter(ev => new Date(ev.date) >= new Date())
        .sort((a, b) => new Date(a.date) - new Date(b.date));
        
    if (upcomingEvents.length === 0) {
        agendaEl.innerHTML = `
            <div style="font-size:12px; color:var(--text-secondary); text-align:center; padding:12px; background:var(--card-bg); border-radius:10px;">
                Žádné blížící se události.
            </div>`;
    } else {
        agendaEl.innerHTML = upcomingEvents.slice(0, 3).map(ev => {
            const dateObj = new Date(ev.date);
            const formattedDate = dateObj.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long' });
            const formattedTime = dateObj.toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' });
            
            return `
                <div class="agenda-item">
                    <div class="agenda-badge ${ev.type}">
                        ${getEventIcon(ev.type)}
                    </div>
                    <div class="agenda-info">
                        <div class="agenda-name">${ev.title}</div>
                        <div class="agenda-meta">${ev.location}</div>
                    </div>
                    <div class="agenda-date">
                        <div class="agenda-day">${formattedDate}</div>
                        <div class="agenda-time">${formattedTime}</div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Render Ongoing Projects in Dashboard list
    const activeProjListEl = document.getElementById('dash-projects-list');
    const ongoingProjects = state.projects.filter(p => p.status !== 'delivered');
    
    if (ongoingProjects.length === 0) {
        activeProjListEl.innerHTML = `
            <div style="font-size:12px; color:var(--text-secondary); text-align:center; padding:12px; background:var(--card-bg); border-radius:10px;">
                Všechny zakázky jsou odevzdané!
            </div>`;
    } else {
        activeProjListEl.innerHTML = ongoingProjects.map(proj => {
            return `
                <div class="client-list-item" onclick="viewProjectDetail('${proj.id}')">
                    <div class="client-info">
                        <h4>${proj.title}</h4>
                        <p>${proj.clientName}</p>
                    </div>
                    <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--accent-indigo); padding:4px 8px; background:rgba(99,102,241,0.15); border-radius:6px;">
                        ${getProjectStatusLabel(proj.status)}
                    </div>
                </div>
            `;
        }).join('');
    }
}

// Helpers
function getEventIcon(type) {
    switch (type) {
        case 'shooting': return '🎥';
        case 'meeting': return '🤝';
        case 'deadline': return '⏰';
        default: return '📌';
    }
}

function getProjectStatusLabel(status) {
    switch (status) {
        case 'idea': return 'Nápad';
        case 'preProduction': return 'Předprodukce';
        case 'shooting': return 'Natáčení';
        case 'editing': return 'Střih';
        case 'delivered': return 'Odevzdáno';
        default: return status;
    }
}

// MARK: - Render Projects Screen
function renderProjects() {
    // Render Segment Selector
    const segmentEl = document.getElementById('project-segment-control');
    const statuses = [
        { id: 'idea', name: 'Nápad' },
        { id: 'preProduction', name: 'Předprodukce' },
        { id: 'shooting', name: 'Natáčení' },
        { id: 'editing', name: 'Střih' },
        { id: 'delivered', name: 'Odevzdáno' }
    ];
    
    segmentEl.innerHTML = statuses.map(s => {
        return `
            <button class="segment-btn ${currentProjStatus === s.id ? 'active' : ''}" 
                    onclick="filterProjectsByStatus('${s.id}')">${s.name}</button>
        `;
    }).join('');
    
    // Filter and Render projects
    const listEl = document.getElementById('projects-list-container');
    const filtered = state.projects.filter(p => p.status === currentProjStatus);
    
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
                <div style="font-size:40px; margin-bottom:12px;">📂</div>
                <p>V této fázi nemáte žádný projekt.</p>
            </div>`;
    } else {
        listEl.innerHTML = filtered.map(proj => {
            const completedTasks = proj.tasks ? proj.tasks.filter(t => t.isCompleted).length : 0;
            const totalTasks = proj.tasks ? proj.tasks.length : 0;
            const progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            
            return `
                <div class="glass-card project-list-card" onclick="viewProjectDetail('${proj.id}')">
                    <div class="project-card-header">
                        <span class="project-card-tag">${proj.tag}</span>
                        <span class="project-card-budget">${proj.budget.toLocaleString('cs-CZ')} Kč</span>
                    </div>
                    <h3 class="project-title">${proj.title}</h3>
                    <div class="project-card-client">${proj.clientName}</div>
                    
                    ${totalTasks > 0 ? `
                    <div class="progress-container">
                        <div class="progress-header">
                            <span>Úkoly: ${completedTasks}/${totalTasks}</span>
                            <span>${Math.round(progress)}%</span>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: ${progress}%"></div>
                        </div>
                    </div>
                    ` : ''}
                </div>
            `;
        }).join('');
    }
}

function filterProjectsByStatus(status) {
    currentProjStatus = status;
    renderProjects();
}

// MARK: - Render Clients Screen (CRM)
function renderClients(filterQuery = '') {
    const listEl = document.getElementById('clients-list-container');
    
    let filtered = state.clients;
    if (filterQuery) {
        filtered = state.clients.filter(c => 
            c.name.toLowerCase().includes(filterQuery.toLowerCase()) || 
            c.company.toLowerCase().includes(filterQuery.toLowerCase())
        );
    }
    
    if (filtered.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
                <div style="font-size:40px; margin-bottom:12px;">👥</div>
                <p>Žádní klienti nenalezeni.</p>
            </div>`;
        return;
    }
    
    const statuses = [
        { id: 'lead', name: 'Potenciální', color: 'lead' },
        { id: 'active', name: 'Aktivní', color: 'active' },
        { id: 'completed', name: 'Dokončený', color: 'completed' },
        { id: 'inactive', name: 'Neaktivní', color: 'inactive' }
    ];
    
    listEl.innerHTML = statuses.map(s => {
        const groupClients = filtered.filter(c => c.status === s.id);
        if (groupClients.length === 0) return '';
        
        const itemsHtml = groupClients.map(c => {
            return `
                <div class="client-list-item" onclick="viewClientDetail('${c.id}')">
                    <div class="client-info">
                        <h4>${c.name}</h4>
                        <p>${c.company}</p>
                    </div>
                    <span class="client-status-dot ${s.color}"></span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="group-header">${s.name}</div>
            ${itemsHtml}
        `;
    }).join('');
}

// MARK: - Render Finances Screen
function renderFinances() {
    // 1. Calculate Summary
    const incomeSum = state.transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const expenseSum = state.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
    const netBalance = incomeSum - expenseSum;
    
    const netEl = document.getElementById('finance-net');
    netEl.textContent = `${netBalance.toLocaleString('cs-CZ')} Kč`;
    netEl.className = `profit-value ${netBalance >= 0 ? 'positive' : 'negative'}`;
    
    document.getElementById('finance-income').textContent = `+${incomeSum.toLocaleString('cs-CZ')} Kč`;
    document.getElementById('finance-expense').textContent = `-${expenseSum.toLocaleString('cs-CZ')} Kč`;
    
    // 2. Generate Chart categories
    const categoriesSum = {};
    state.transactions.forEach(tx => {
        if (!categoriesSum[tx.category]) {
            categoriesSum[tx.category] = { income: 0, expense: 0 };
        }
        if (tx.type === 'income') {
            categoriesSum[tx.category].income += tx.amount;
        } else {
            categoriesSum[tx.category].expense += tx.amount;
        }
    });
    
    const chartEl = document.getElementById('finance-chart');
    const catKeys = Object.keys(categoriesSum);
    
    if (catKeys.length === 0) {
        chartEl.innerHTML = `
            <div style="font-size:11px; color:var(--text-secondary); text-align:center; width:100%; margin:auto;">
                Žádná data pro graf.
            </div>`;
    } else {
        // Find max category value to scale chart height
        const maxVal = Math.max(...catKeys.map(k => Math.max(categoriesSum[k].income, categoriesSum[k].expense)));
        
        chartEl.innerHTML = catKeys.map(cat => {
            const data = categoriesSum[cat];
            const isIncomePrimary = data.income >= data.expense;
            const primaryVal = isIncomePrimary ? data.income : data.expense;
            const percentageHeight = maxVal > 0 ? (primaryVal / maxVal) * 100 : 0;
            
            return `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar-fill ${isIncomePrimary ? 'income' : 'expense'}" 
                         style="height: ${Math.max(4, percentageHeight)}%"></div>
                    <span class="chart-label">${cat}</span>
                </div>
            `;
        }).join('');
    }
    
    // 3. Render Ledger List
    const ledgerEl = document.getElementById('ledger-list-container');
    let filtered = state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (currentTxFilter === 1) {
        filtered = filtered.filter(t => t.type === 'income');
    } else if (currentTxFilter === 2) {
        filtered = filtered.filter(t => t.type === 'expense');
    }
    
    if (filtered.length === 0) {
        ledgerEl.innerHTML = `
            <div style="text-align:center; padding:30px; color:var(--text-secondary);">
                Žádné transakce neodpovídají filtru.
            </div>`;
    } else {
        ledgerEl.innerHTML = filtered.map(tx => {
            const formattedDate = new Date(tx.date).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' });
            return `
                <div class="ledger-item">
                    <div class="ledger-info">
                        <h4>${tx.title}</h4>
                        <p>${tx.category} • ${formattedDate}</p>
                    </div>
                    <span class="ledger-amount ${tx.type}">
                        ${tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString('cs-CZ')} Kč
                    </span>
                </div>
            `;
        }).join('');
    }
}

function filterTransactions(type, btnEl) {
    const btns = btnEl.parentElement.querySelectorAll('.segment-btn');
    btns.forEach(b => b.classList.remove('active'));
    btnEl.classList.add('active');
    
    currentTxFilter = type;
    renderFinances();
}

function toggleTxCategories() {
    const typeSelect = document.getElementById('tx-type');
    const catSelect = document.getElementById('tx-category');
    
    const incomeCats = ["Projekty", "Sponzoring", "Ostatní"];
    const expenseCats = ["Technika", "Cestovné", "Nájem", "Marketing", "Software", "Ostatní"];
    
    const cats = typeSelect.value === 'income' ? incomeCats : expenseCats;
    catSelect.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

// MARK: - Render Ideas Screen
function renderIdeas() {
    const listEl = document.getElementById('ideas-list-container');
    if (state.ideas.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:40px 20px; color:var(--text-secondary);">
                <div style="font-size:40px; margin-bottom:12px;">💡</div>
                <p>Zatím žádné nápady. Klikněte na + a vytvořte první.</p>
            </div>`;
        return;
    }
    
    const categories = [
        { id: 'reels', name: 'Reels / TikTok' },
        { id: 'campaign', name: 'Kampaň' },
        { id: 'branding', name: 'Branding' },
        { id: 'other', name: 'Ostatní' }
    ];
    
    listEl.innerHTML = categories.map(cat => {
        const catIdeas = state.ideas.filter(i => i.category === cat.id);
        if (catIdeas.length === 0) return '';
        
        const itemsHtml = catIdeas.map(idea => {
            const hookText = idea.hooks.length > 0 ? idea.hooks[0] : 'Žádný hook';
            return `
                <div class="client-list-item" onclick="viewIdeaDetail('${idea.id}')">
                    <div class="client-info">
                        <h4>${idea.title}</h4>
                        <p style="font-size:11px;">Hook: ${hookText}</p>
                    </div>
                    <span style="font-size:12px;">⚡</span>
                </div>
            `;
        }).join('');
        
        return `
            <div class="group-header">${cat.name}</div>
            ${itemsHtml}
        `;
    }).join('');
}

// MARK: - Create / Save Record Functions

// Save Client Form Submission
function saveClient(e) {
    e.preventDefault();
    
    const name = document.getElementById('client-name').value.trim();
    const company = document.getElementById('client-company').value.trim();
    const status = document.getElementById('client-status').value;
    const email = document.getElementById('client-email').value.trim();
    const phone = document.getElementById('client-phone').value.trim();
    const notes = document.getElementById('client-notes').value.trim();
    
    const newClient = {
        id: 'c_' + Date.now(),
        name,
        company,
        status,
        email,
        phone,
        notes
    };
    
    if (isFirebaseConnected && db) {
        db.collection('clients').doc(newClient.id).set(newClient)
            .catch(err => console.error("Chyba při ukládání klienta:", err));
    } else {
        state.clients.push(newClient);
        saveStateToLocalStorage();
        renderAll();
    }
    
    // Reset Form & Close
    document.getElementById('form-add-client').reset();
    closeSheet('sheet-add-client');
}

// Save Project Form Submission
function saveProject(e) {
    e.preventDefault();
    
    const title = document.getElementById('project-title').value.trim();
    const clientName = document.getElementById('project-client').value.trim();
    const tag = document.getElementById('project-tag').value;
    const status = document.getElementById('project-status').value;
    const budget = parseFloat(document.getElementById('project-budget').value) || 0;
    const deadline = document.getElementById('project-deadline').value;
    const role = document.getElementById('project-role').value.trim();
    const desc = document.getElementById('project-desc').value.trim();
    
    const newProj = {
        id: 'p_' + Date.now(),
        title,
        clientName,
        tag,
        status,
        budget,
        deadline,
        role,
        desc,
        tasks: [],
        deliverables: []
    };
    
    if (isFirebaseConnected && db) {
        db.collection('projects').doc(newProj.id).set(newProj)
            .catch(err => console.error("Chyba při ukládání projektu:", err));
    } else {
        state.projects.push(newProj);
        saveStateToLocalStorage();
        renderAll();
    }
    
    document.getElementById('form-add-project').reset();
    setDefaultFormDates();
    closeSheet('sheet-add-project');
}

// Save Transaction Form Submission
function saveTransaction(e) {
    e.preventDefault();
    
    const title = document.getElementById('tx-title').value.trim();
    const amount = parseFloat(document.getElementById('tx-amount').value) || 0;
    const type = document.getElementById('tx-type').value;
    const category = document.getElementById('tx-category').value;
    const date = document.getElementById('tx-date').value;
    
    const newTx = {
        id: 'tx_' + Date.now(),
        title,
        amount,
        type,
        category,
        date
    };
    
    if (isFirebaseConnected && db) {
        db.collection('transactions').doc(newTx.id).set(newTx)
            .catch(err => console.error("Chyba při ukládání transakce:", err));
    } else {
        state.transactions.push(newTx);
        saveStateToLocalStorage();
        renderAll();
    }
    
    document.getElementById('form-add-transaction').reset();
    setDefaultFormDates();
    closeSheet('sheet-add-transaction');
}

// Save Event Form Submission
function saveEvent(e) {
    e.preventDefault();
    
    const title = document.getElementById('event-title').value.trim();
    const type = document.getElementById('event-type').value;
    const date = document.getElementById('event-date').value;
    const durationHours = parseFloat(document.getElementById('event-duration').value) || 0;
    const location = document.getElementById('event-location').value.trim();
    const notes = document.getElementById('event-notes').value.trim();
    
    const newEvent = {
        id: 'e_' + Date.now(),
        title,
        type,
        date,
        durationHours,
        location,
        notes
    };
    
    if (isFirebaseConnected && db) {
        db.collection('events').doc(newEvent.id).set(newEvent)
            .catch(err => console.error("Chyba při ukládání události:", err));
    } else {
        state.events.push(newEvent);
        saveStateToLocalStorage();
        renderAll();
    }
    
    document.getElementById('form-add-event').reset();
    setDefaultFormDates();
    closeSheet('sheet-add-event');
}

// Save Idea / Scripts Form Submission
function saveIdea(e) {
    e.preventDefault();
    
    const title = document.getElementById('idea-title').value.trim();
    const category = document.getElementById('idea-category').value;
    const script = document.getElementById('idea-script').value.trim();
    
    const newIdea = {
        id: 'id_' + Date.now(),
        title,
        category,
        script,
        hooks: [...tempHooksList]
    };
    
    if (isFirebaseConnected && db) {
        db.collection('ideas').doc(newIdea.id).set(newIdea)
            .catch(err => console.error("Chyba při ukládání nápadu:", err));
    } else {
        state.ideas.push(newIdea);
        saveStateToLocalStorage();
        renderAll();
    }
    
    // Clear temp list & reset
    tempHooksList = [];
    document.getElementById('idea-hooks-temp-container').innerHTML = '';
    document.getElementById('form-add-idea').reset();
    closeSheet('sheet-add-idea');
}

// Dynamic hook list item adding
function addHookToList() {
    const input = document.getElementById('idea-hook-input');
    const val = input.value.trim();
    if (!val) return;
    
    tempHooksList.push(val);
    input.value = '';
    
    renderTempHooks();
}

function deleteTempHook(idx) {
    tempHooksList.splice(idx, 1);
    renderTempHooks();
}

function renderTempHooks() {
    const container = document.getElementById('idea-hooks-temp-container');
    container.innerHTML = tempHooksList.map((h, i) => {
        return `
            <div class="temp-hook-item">
                <span>⚡ ${h}</span>
                <span class="temp-hook-delete" onclick="deleteTempHook(${i})">Smazat</span>
            </div>
        `;
    }).join('');
}


// MARK: - Detail Sheets Views

// 1. Client Detail View Rendering
function viewClientDetail(id) {
    activeClientId = id;
    const client = state.clients.find(c => c.id === id);
    if (!client) return;
    
    document.getElementById('detail-client-company').textContent = client.company;
    
    const body = document.getElementById('detail-client-body');
    body.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <div style="font-size:32px; width:70px; height:70px; line-height:70px; text-align:center; background:rgba(99,102,241,0.15); color:var(--accent-indigo); border-radius:50%; margin:0 auto 12px auto; font-weight:700;">
                ${client.name.substring(0,2).toUpperCase()}
            </div>
            <h3 style="font-size:20px; font-weight:700; color:var(--text-primary);">${client.name}</h3>
            <p style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${client.company}</p>
        </div>

        <div class="form-group">
            <label class="form-label">Stav spolupráce</label>
            <select class="form-input form-select" id="detail-client-status" onchange="updateClientStatus('${client.id}', this.value)">
                <option value="lead" ${client.status === 'lead' ? 'selected' : ''}>Potenciální</option>
                <option value="active" ${client.status === 'active' ? 'selected' : ''}>Aktivní</option>
                <option value="completed" ${client.status === 'completed' ? 'selected' : ''}>Dokončený</option>
                <option value="inactive" ${client.status === 'inactive' ? 'selected' : ''}>Neaktivní</option>
            </select>
        </div>

        <div class="glass-card" style="margin-bottom:16px;">
            <div class="metrics-title">Kontaktní informace</div>
            <div class="contact-quick-actions">
                <a href="mailto:${client.email}" class="btn-contact-action">
                    <span>✉</span> E-mail: ${client.email}
                </a>
            </div>
            <div class="contact-quick-actions" style="margin-top:8px;">
                <a href="tel:${client.phone.replace(/\s/g, '')}" class="btn-contact-action">
                    <span>📞</span> Tel: ${client.phone}
                </a>
            </div>
        </div>

        <div class="glass-card">
            <div class="metrics-title">Interní poznámky ke spolupráci</div>
            <textarea class="form-input" id="detail-client-notes-field" style="height:120px; background:transparent;" onblur="updateClientNotes('${client.id}', this.value)">${client.notes || ''}</textarea>
            <span style="font-size:10px; color:var(--text-secondary); margin-top:4px; display:block;">Poznámky se ukládají automaticky při opuštění pole.</span>
        </div>

        <button class="btn-delete-item" onclick="deleteClient('${client.id}')">Smazat klienta ze systému</button>
    `;
    
    openSheet('sheet-client-detail');
}

function updateClientStatus(id, newStatus) {
    if (isFirebaseConnected && db) {
        db.collection('clients').doc(id).update({ status: newStatus })
            .catch(err => console.error("Chyba při aktualizaci stavu klienta:", err));
    } else {
        const idx = state.clients.findIndex(c => c.id === id);
        if (idx !== -1) {
            state.clients[idx].status = newStatus;
            saveStateToLocalStorage();
            renderClients();
            renderDashboard();
        }
    }
}

function updateClientNotes(id, notes) {
    if (isFirebaseConnected && db) {
        db.collection('clients').doc(id).update({ notes: notes })
            .catch(err => console.error("Chyba při aktualizaci poznámek klienta:", err));
    } else {
        const idx = state.clients.findIndex(c => c.id === id);
        if (idx !== -1) {
            state.clients[idx].notes = notes;
            saveStateToLocalStorage();
            renderClients();
        }
    }
}

function deleteClient(id) {
    if (confirm('Opravdu chcete tohoto klienta smazat?')) {
        if (isFirebaseConnected && db) {
            db.collection('clients').doc(id).delete()
                .then(() => closeSheet('sheet-client-detail'))
                .catch(err => console.error("Chyba při mazání klienta:", err));
        } else {
            state.clients = state.clients.filter(c => c.id !== id);
            saveStateToLocalStorage();
            closeSheet('sheet-client-detail');
            renderClients();
            renderDashboard();
        }
    }
}


// 2. Project Detail View Rendering
function viewProjectDetail(id) {
    activeProjectId = id;
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    
    document.getElementById('detail-project-title').textContent = proj.title;
    renderProjectDetailBody(proj);
    openSheet('sheet-project-detail');
}

function renderProjectDetailBody(proj) {
    const container = document.getElementById('detail-project-body');
    const deadlineDate = new Date(proj.deadline).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
    
    // Checklist HTML
    let checklistHtml = '';
    if (proj.tasks && proj.tasks.length > 0) {
        checklistHtml = proj.tasks.map((task, idx) => {
            return `
                <div class="task-check-item" onclick="toggleProjectTask('${proj.id}', ${idx})">
                    <span class="check-circle">${task.isCompleted ? '✓' : '◯'}</span>
                    <span class="task-text ${task.isCompleted ? 'completed' : ''}">${task.title}</span>
                </div>
            `;
        }).join('');
    } else {
        checklistHtml = '<div style="font-size:12px; color:var(--text-secondary);">Žádné úkoly. Přidejte první níže.</div>';
    }

    container.innerHTML = `
        <div class="detail-meta-row">
            <div class="meta-box">
                <div class="meta-box-label">ROZPOČET</div>
                <div class="meta-box-value" style="color:var(--success-color);">${proj.budget.toLocaleString('cs-CZ')} Kč</div>
            </div>
            <div class="meta-box">
                <div class="meta-box-label">TERMÍN</div>
                <div class="meta-box-value" style="color:var(--danger-color);">${deadlineDate}</div>
            </div>
        </div>

        <div class="form-group">
            <label class="form-label">Aktuální fáze zakázky</label>
            <select class="form-input form-select" onchange="updateProjectStatus('${proj.id}', this.value)">
                <option value="idea" ${proj.status === 'idea' ? 'selected' : ''}>Nápad</option>
                <option value="preProduction" ${proj.status === 'preProduction' ? 'selected' : ''}>Předprodukce</option>
                <option value="shooting" ${proj.status === 'shooting' ? 'selected' : ''}>Natáčení</option>
                <option value="editing" ${proj.status === 'editing' ? 'selected' : ''}>Střih</option>
                <option value="delivered" ${proj.status === 'delivered' ? 'selected' : ''}>Odevzdáno</option>
            </select>
        </div>

        <div class="glass-card" style="margin-bottom:16px;">
            <div class="metrics-title">Kontrolní seznam úkolů</div>
            <div class="tasks-checklist">
                ${checklistHtml}
            </div>
            
            <div class="add-task-inline">
                <input type="text" class="form-input" id="detail-project-new-task-title" placeholder="Nový úkol...">
                <button type="button" class="btn-icon-add" onclick="addInlineTask('${proj.id}')">+</button>
            </div>
        </div>

        <div class="glass-card">
            <div class="metrics-title">Popis a specifikace zakázky</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-bottom:8px;">
                Klient: <b>${proj.clientName}</b> | Naše role: <b>${proj.role}</b>
            </div>
            <p style="font-size:13px; line-height:1.5;">${proj.desc || 'Bez podrobného popisu.'}</p>
        </div>

        <button class="btn-delete-item" onclick="deleteProject('${proj.id}')">Odstranit zakázku ze systému</button>
    `;
}

function updateProjectStatus(id, newStatus) {
    if (isFirebaseConnected && db) {
        db.collection('projects').doc(id).update({ status: newStatus })
            .catch(err => console.error("Chyba při aktualizaci stavu projektu:", err));
    } else {
        const idx = state.projects.findIndex(p => p.id === id);
        if (idx !== -1) {
            state.projects[idx].status = newStatus;
            saveStateToLocalStorage();
            renderProjects();
            renderDashboard();
        }
    }
}

function toggleProjectTask(projId, taskIdx) {
    const projIdx = state.projects.findIndex(p => p.id === projId);
    if (projIdx !== -1) {
        const tasks = [...state.projects[projIdx].tasks];
        tasks[taskIdx].isCompleted = !tasks[taskIdx].isCompleted;
        
        if (isFirebaseConnected && db) {
            db.collection('projects').doc(projId).update({ tasks: tasks })
                .catch(err => console.error("Chyba při přepnutí úkolu:", err));
        } else {
            state.projects[projIdx].tasks = tasks;
            saveStateToLocalStorage();
            renderProjects();
            renderProjectDetailBody(state.projects[projIdx]);
        }
    }
}

function addInlineTask(projId) {
    const input = document.getElementById('detail-project-new-task-title');
    const title = input.value.trim();
    if (!title) return;
    
    const projIdx = state.projects.findIndex(p => p.id === projId);
    if (projIdx !== -1) {
        const newTask = {
            id: 't_' + Date.now(),
            title,
            isCompleted: false
        };
        const tasks = [...(state.projects[projIdx].tasks || []), newTask];
        
        if (isFirebaseConnected && db) {
            db.collection('projects').doc(projId).update({ tasks: tasks })
                .then(() => { input.value = ''; })
                .catch(err => console.error("Chyba při přidání úkolu:", err));
        } else {
            state.projects[projIdx].tasks = tasks;
            saveStateToLocalStorage();
            input.value = '';
            renderProjects();
            renderProjectDetailBody(state.projects[projIdx]);
        }
    }
}

function deleteProject(id) {
    if (confirm('Opravdu chcete tuto zakázku smazat?')) {
        if (isFirebaseConnected && db) {
            db.collection('projects').doc(id).delete()
                .then(() => closeSheet('sheet-project-detail'))
                .catch(err => console.error("Chyba při mazání projektu:", err));
        } else {
            state.projects = state.projects.filter(p => p.id !== id);
            saveStateToLocalStorage();
            closeSheet('sheet-project-detail');
            renderProjects();
            renderDashboard();
        }
    }
}


// 3. Idea Detail View Rendering
function viewIdeaDetail(id) {
    activeIdeaId = id;
    const idea = state.ideas.find(i => i.id === id);
    if (!idea) return;
    
    document.getElementById('detail-idea-title').textContent = idea.title;
    
    const body = document.getElementById('detail-idea-body');
    const categoryName = idea.category === 'reels' ? 'Reels / TikTok' : 
                         idea.category === 'campaign' ? 'Kampaň' :
                         idea.category === 'branding' ? 'Branding' : 'Ostatní';
                         
    const hooksHtml = idea.hooks && idea.hooks.length > 0 
        ? idea.hooks.map(h => `<div class="hook-bullet"><span>⚡</span><span>${h}</span></div>`).join('')
        : '<div style="font-size:12px; color:var(--text-secondary);">Žádné háčky/hooky.</div>';

    body.innerHTML = `
        <div style="font-size:10px; font-weight:700; text-transform:uppercase; color:var(--accent-purple); margin-bottom:8px;">
            Kategorie: ${categoryName}
        </div>
        
        <div class="glass-card" style="margin-bottom:16px;">
            <div class="metrics-title">Hooky pro první 3 sekundy</div>
            <div class="hooks-list">
                ${hooksHtml}
            </div>
        </div>

        <div class="glass-card">
            <div class="metrics-title">Scénář / Osnova videa</div>
            <textarea class="form-input" style="height:180px; background:transparent; line-height:1.5;" onblur="updateIdeaScript('${idea.id}', this.value)">${idea.script || ''}</textarea>
            <span style="font-size:10px; color:var(--text-secondary); margin-top:4px; display:block;">Scénář se ukládá automaticky při opuštění pole.</span>
        </div>

        <button class="btn-delete-item" onclick="deleteIdea('${idea.id}')">Smazat tento koncept</button>
    `;
    
    openSheet('sheet-idea-detail');
}

function updateIdeaScript(id, script) {
    if (isFirebaseConnected && db) {
        db.collection('ideas').doc(id).update({ script: script })
            .catch(err => console.error("Chyba při aktualizaci scénáře:", err));
    } else {
        const idx = state.ideas.findIndex(i => i.id === id);
        if (idx !== -1) {
            state.ideas[idx].script = script;
            saveStateToLocalStorage();
            renderIdeas();
        }
    }
}

function deleteIdea(id) {
    if (confirm('Opravdu chcete tento nápad smazat?')) {
        if (isFirebaseConnected && db) {
            db.collection('ideas').doc(id).delete()
                .then(() => closeSheet('sheet-idea-detail'))
                .catch(err => console.error("Chyba při mazání nápadu:", err));
        } else {
            state.ideas = state.ideas.filter(i => i.id !== id);
            saveStateToLocalStorage();
            closeSheet('sheet-idea-detail');
            renderIdeas();
        }
    }
}
