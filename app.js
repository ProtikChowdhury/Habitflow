const firebaseConfig = {
    apiKey: "AIzaSyCpPOaRQMvubDDvY2dwBsuNarAujza8GTQ",
    authDomain: "habitflow-678a6.firebaseapp.com",
    projectId: "habitflow-678a6",
    storageBucket: "habitflow-678a6.firebasestorage.app",
    messagingSenderId: "879490455402",
    appId: "1:879490455402:web:ff8cb4cc89ac8de297b713"
};

let app, auth, db;
let isFirebaseInitialized = false;

if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
    try {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        db.enablePersistence().catch((err) => {
            console.warn("Firestore offline persistence conditionally failed", err);
        });
        isFirebaseInitialized = true;
    } catch (error) {
        console.error("Firebase not configured correctly yet. Use local mode.", error);
    }
}

// ==== UI Elements ====
const authSection = document.getElementById('auth-section');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');
const toggleAuthText = document.getElementById('toggle-auth');
const authError = document.getElementById('auth-error');
const closeAuthBtn = document.getElementById('close-auth-btn');
const googleBtn = document.getElementById('google-auth-btn');

const loginSyncBtn = document.getElementById('login-sync-btn');
const loggedInState = document.getElementById('logged-in-state');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const userAvatar = document.getElementById('user-avatar');
const dateRangeDisplay = document.getElementById('date-range-display');

const openAddHabitBtn = document.getElementById('open-add-habit-btn');
const addHabitModal = document.getElementById('add-habit-modal');
const closeAddHabitBtn = document.getElementById('close-modal-btn');
const addHabitForm = document.getElementById('add-habit-form');
const newHabitInput = document.getElementById('new-habit-input');
const habitsList = document.getElementById('habits-list');
const loadingSpinner = document.getElementById('loading-habits');

let isSignup = false;
let currentUser = null;
let currentUnsubscribe = null;

const LOCAL_STORAGE_KEY = 'zen_habits_local';
const HABIT_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#0ea5e9'];
const DAYS_TO_SHOW = 14;

// ==== UTILS ====
const pad = (n) => String(n).padStart(2, '0');
const getDateString = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const getTodayString = () => getDateString(new Date());

const getLast14Days = () => {
    const dates = [];
    for (let i = DAYS_TO_SHOW - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(getDateString(d));
    }
    return dates;
};

const getDayAbbr = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short' });
};

const getDayNum = (dateStr) => dateStr.split('-')[2];

const getMonthAbbr = (dateStr) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short' });
};

const updateDateRangeDisplay = () => {
    const dates = getLast14Days();
    const first = dates[0];
    const last = dates[dates.length - 1];
    dateRangeDisplay.textContent = `${getMonthAbbr(first)} ${getDayNum(first)} - ${getMonthAbbr(last)} ${getDayNum(last)}, ${new Date().getFullYear()}`;
};

const migrateHabitData = (h) => {
    if (h.completedDates === undefined) {
        h.completedDates = [];
        if (h.completed && h.completedDate) h.completedDates.push(h.completedDate);
        delete h.completed; delete h.completedDate;
    }
    if (!h.color) {
        h.color = HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)];
    }
    return h;
};

const computeStreak = (completedDates) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let streak = 0;
    let currDate = new Date(today);

    // If today is not checked and yesterday is not checked, streak is 0
    if (!completedDates.includes(getDateString(today)) && !completedDates.includes(getDateString(yesterday))) {
        return 0;
    }

    // Start counting backwards.
    // Allow today to be missed, so start from yesterday, but if today is checked, add 1.
    if (completedDates.includes(getDateString(currDate))) {
        streak++;
    }
    
    currDate.setDate(currDate.getDate() - 1);
    
    while (true) {
        if (completedDates.includes(getDateString(currDate))) {
            streak++;
            currDate.setDate(currDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
};

// ==== LOCAL STORAGE ====
const getLocalHabits = () => {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
};

const saveLocalHabits = (habitsArray) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(habitsArray));
};

const migrateLocalToFirebase = async (uid) => {
    const habits = getLocalHabits();
    if (habits.length === 0) return;

    try {
        const batch = db.batch();
        habits.forEach(h => {
            const migrated = migrateHabitData({...h});
            const newRef = db.collection("habits").doc();
            batch.set(newRef, {
                userId: uid,
                task: migrated.task,
                completedDates: migrated.completedDates,
                color: migrated.color,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await batch.commit();
        localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch (e) {
        console.error("Migration failed", e);
    }
};

const checkAndMigrateLocalHabits = () => {
    const habits = getLocalHabits();
    let needsUpdate = false;
    habits.forEach(h => {
        if (h.completedDates === undefined || !h.color) {
            migrateHabitData(h);
            needsUpdate = true;
        }
    });
    if (needsUpdate) saveLocalHabits(habits);
};

// ==== NAVIGATION & SETUP ====
loginSyncBtn.addEventListener('click', () => {
    authSection.classList.remove('hidden');
});

closeAuthBtn.addEventListener('click', () => {
    authSection.classList.add('hidden');
});

openAddHabitBtn.addEventListener('click', () => {
    addHabitModal.classList.remove('hidden');
    newHabitInput.focus();
});

closeAddHabitBtn.addEventListener('click', () => {
    addHabitModal.classList.add('hidden');
});

const loadInitialLocalState = () => {
    checkAndMigrateLocalHabits();
    renderLocalHabits();
};

const setCloudMode = () => {
    loginSyncBtn.classList.add('hidden');
    loggedInState.classList.remove('hidden');
    
    if (userAvatar) {
        if (currentUser.photoURL) {
            userAvatar.src = currentUser.photoURL;
            userAvatar.classList.remove('hidden');
        } else {
            userAvatar.classList.add('hidden');
        }
    }
    
    userDisplay.textContent = currentUser.email;
    subscribeToHabits();
};

const setLocalMode = () => {
    loginSyncBtn.classList.remove('hidden');
    loggedInState.classList.add('hidden');
    if (currentUnsubscribe) { currentUnsubscribe(); currentUnsubscribe = null; }
    loadInitialLocalState();
};

if (isFirebaseInitialized) {
    // Fallback: If auth state doesn't resolve in 2s, assume local mode
    let authResolved = false;
    const authTimeout = setTimeout(() => {
        if (!authResolved) {
            console.warn("Auth state resolution timed out. Falling back to local mode.");
            setLocalMode();
        }
    }, 2000);

    auth.onAuthStateChanged(async (user) => {
        authResolved = true;
        clearTimeout(authTimeout);
        if (user) {
            currentUser = user;
            await migrateLocalToFirebase(user.uid);
            setCloudMode();
            authSection.classList.add('hidden');
        } else {
            currentUser = null;
            setLocalMode();
        }
    });
} else {
    setLocalMode();
}

// ==== AUTH EVENTS ====
toggleAuthText.addEventListener('click', () => {
    isSignup = !isSignup;
    authBtn.textContent = isSignup ? 'Sign Up' : 'Log In';
    toggleAuthText.textContent = isSignup ? 'Log in instead' : 'Create an account';
    document.querySelector('.auth-header h2').textContent = isSignup ? 'Create Account' : 'Sync Tracker';
    authError.textContent = '';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isFirebaseInitialized) return;
    authBtn.disabled = true;
    try {
        if (isSignup) await auth.createUserWithEmailAndPassword(emailInput.value, passwordInput.value);
        else await auth.signInWithEmailAndPassword(emailInput.value, passwordInput.value);
    } catch (error) {
        authError.textContent = error.message.replace('Firebase:', '');
    } finally {
        authBtn.disabled = false;
    }
});

googleBtn.addEventListener('click', async () => {
    if (!isFirebaseInitialized) return;
    try {
        await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (error) {
        authError.textContent = error.message.replace('Firebase:', '');
    }
});

logoutBtn.addEventListener('click', () => { if (auth) auth.signOut(); });

// ==== HABITS LOGIC ====
addHabitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = newHabitInput.value.trim();
    if (!task) return;

    const color = HABIT_COLORS[Math.floor(Math.random() * HABIT_COLORS.length)];
    newHabitInput.value = '';
    addHabitModal.classList.add('hidden');

    if (currentUser) {
        try {
            await db.collection("habits").add({
                userId: currentUser.uid,
                task: task,
                completedDates: [],
                color: color,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) { console.error(error); }
    } else {
        const habits = getLocalHabits();
        habits.push({
            id: 'local_' + Date.now().toString(),
            task: task,
            completedDates: [],
            color: color,
            createdAt: Date.now()
        });
        saveLocalHabits(habits);
        renderLocalHabits();
    }
});

const toggleHabitAction = async (id, dateStr, isCompleted) => {
    if (currentUser) {
        const habitRef = db.collection("habits").doc(id);
        try {
            await habitRef.update({
                completedDates: isCompleted ? firebase.firestore.FieldValue.arrayUnion(dateStr) : firebase.firestore.FieldValue.arrayRemove(dateStr)
            });
        } catch (e) { console.error(e); }
    } else {
        const habits = getLocalHabits();
        const h = habits.find(h => h.id === id);
        if (h) {
            if (isCompleted) {
                if (!h.completedDates.includes(dateStr)) h.completedDates.push(dateStr);
            } else {
                h.completedDates = h.completedDates.filter(d => d !== dateStr);
            }
            saveLocalHabits(habits);
            renderLocalHabits();
        }
    }
};

const deleteHabitAction = async (id) => {
    if (!confirm("Delete this habit?")) return;
    if (currentUser) {
        try { await db.collection("habits").doc(id).delete(); } catch (e) { console.error(e); }
    } else {
        let habits = getLocalHabits();
        habits = habits.filter(h => h.id !== id);
        saveLocalHabits(habits);
        renderLocalHabits();
    }
};

// ==== RENDERING ====
const renderChartHeader = () => {
    updateDateRangeDisplay();
    const chartHeader = document.getElementById('chart-header');
    if (!chartHeader) return;
    
    // Grid: drag(1) + habitname(1) + trophy(1) + flame(1) = 4 empty columns before days
    let html = `
        <div class="header-empty"></div>
        <div class="header-empty"></div>
        <div class="header-empty"></div>
        <div class="header-empty"></div>
    `;
    
    const last14 = getLast14Days();
    last14.forEach(d => {
        html += `
        <div class="header-day">
            <span class="day-name">${getDayAbbr(d)}</span>
            <span class="day-num">${getDayNum(d)}</span>
        </div>`;
    });
    chartHeader.innerHTML = html;
};

const renderLocalHabits = () => {
    renderChartHeader();
    habitsList.innerHTML = '';
    const habits = getLocalHabits();
    if (habits.length === 0) {
        habitsList.innerHTML = `<div class="empty-state">No habits tracked yet. Start by adding one!</div>`;
        return;
    }
    habits.forEach(h => appendHabitToDOM(h.id, h));
};

const subscribeToHabits = () => {
    renderChartHeader();
    loadingSpinner.style.display = 'block';
    const q = db.collection("habits").where("userId", "==", currentUser.uid).orderBy("createdAt", "asc");

    let snapshotResolved = false;
    const snapshotTimeout = setTimeout(() => {
        if (!snapshotResolved) {
            console.warn("Firestore snapshot resolution timed out. Falling back to local mode.");
            loadingSpinner.style.display = 'none';
            if (currentUnsubscribe) { currentUnsubscribe(); currentUnsubscribe = null; }
            currentUser = null;
            if (auth) auth.signOut();
            setLocalMode();
        }
    }, 2000);

    currentUnsubscribe = q.onSnapshot(
        (snapshot) => {
            snapshotResolved = true;
            clearTimeout(snapshotTimeout);
            loadingSpinner.style.display = 'none';
            habitsList.innerHTML = '';
            if (snapshot.empty) {
                habitsList.innerHTML = `<div class="empty-state">No habits tracked yet. Start by adding one!</div>`;
                return;
            }
            snapshot.forEach((docSnap) => appendHabitToDOM(docSnap.id, docSnap.data()));
        },
        (error) => {
            snapshotResolved = true;
            clearTimeout(snapshotTimeout);
            console.error("Error fetching habits from cloud. Falling back to local mode.", error);
            loadingSpinner.style.display = 'none';
            
            // Revert state back to local mode if blocked by browser/ad-blocker
            currentUser = null;
            if (auth) auth.signOut();
            setLocalMode();
        }
    );
};

const appendHabitToDOM = (id, habit) => {
    habit = migrateHabitData(habit);
    const last14 = getLast14Days();
    const todayStr = getTodayString();
    
    const streak = computeStreak(habit.completedDates);
    const total = habit.completedDates.length;

    const li = document.createElement('li');
    li.className = 'habit-item';

    // 1. Delete Button
    const delCol = document.createElement('div');
    delCol.className = 'delete-action';
    delCol.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    delCol.addEventListener('click', () => deleteHabitAction(id));
    delCol.title = "Delete this habit";
    li.appendChild(delCol);

    // 2. Habit Info (Dot + Text)
    const infoCol = document.createElement('div');
    infoCol.className = 'habit-info';
    infoCol.innerHTML = `<div class="color-dot" style="background-color: ${habit.color}"></div><span class="habit-text">${habit.task}</span>`;
    li.appendChild(infoCol);

    // 3. Trophy (Total)
    const trophyCol = document.createElement('div');
    trophyCol.className = 'stat-col trophy';
    trophyCol.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10c1.7 0 3 1.3 3 3v2c0 2.8-2.2 5-5 5H9c-2.8 0-5-2.2-5-5V7c0-1.7 1.3-3 3-3z"/></svg> <span>${total}</span>`;
    li.appendChild(trophyCol);

    // 4. Flame (Streak)
    const flameCol = document.createElement('div');
    flameCol.className = 'stat-col flame';
    flameCol.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> <span>${streak}</span>`;
    li.appendChild(flameCol);

    // 5-18. 14 Days Checkboxes
    last14.forEach(dateStr => {
        const isToday = dateStr === todayStr;
        const isChecked = habit.completedDates.includes(dateStr);
        
        const checkWrap = document.createElement('label');
        checkWrap.className = `checkbox-wrapper ${isToday ? 'today-col' : ''}`;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isChecked;
        checkbox.addEventListener('change', () => toggleHabitAction(id, dateStr, checkbox.checked));

        const circle = document.createElement('span');
        circle.className = `circle-mark active-color`;
        // Apply color dynamically when checked
        if (isChecked) {
            circle.style.backgroundColor = habit.color;
        }

        checkWrap.appendChild(checkbox);
        checkWrap.appendChild(circle);
        li.appendChild(checkWrap);
    });

    habitsList.appendChild(li);
};
