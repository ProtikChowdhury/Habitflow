import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    getDocs,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🔴 REPLACE THIS CONFIGURATION!
// Go to Firebase Console -> Project Settings -> General -> Web Apps
// ==========================================
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
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        isFirebaseInitialized = true;
    } catch (error) {
        console.error("Firebase not configured correctly yet. Use local mode.", error);
    }
} else {
    console.warn("Firebase config has dummy keys. Running in Local-Only Mode.");
}

// ==== UI Elements ====
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const authBtn = document.getElementById('auth-btn');
const toggleAuthText = document.getElementById('toggle-auth');
const authError = document.getElementById('auth-error');
const closeAuthBtn = document.getElementById('close-auth-btn');
const googleBtn = document.getElementById('google-auth-btn');

const loginSyncBtn = document.getElementById('login-sync-btn');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const currentDateDisplay = document.getElementById('current-date-display');
const addHabitForm = document.getElementById('add-habit-form');
const newHabitInput = document.getElementById('new-habit-input');
const habitsList = document.getElementById('habits-list');
const loadingSpinner = document.getElementById('loading-habits');

let isSignup = false;
let currentUser = null;
let currentUnsubscribe = null;

const LOCAL_STORAGE_KEY = 'zen_habits_local';

// ==== UTILS ====
const formatDate = (date) => {
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
};
currentDateDisplay.textContent = formatDate(new Date());

const getTodayString = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ==== LOCAL STORAGE / OFFLINE LOGIC ====
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
        const batch = writeBatch(db);
        habits.forEach(h => {
            const newRef = doc(collection(db, "habits"));
            batch.set(newRef, {
                userId: uid,
                task: h.task,
                completed: h.completed,
                createdAt: serverTimestamp(),
                completedDate: h.completedDate
            });
        });
        await batch.commit();
        localStorage.removeItem(LOCAL_STORAGE_KEY);
        console.log("Migrated local habits to Firebase.");
    } catch (e) {
        console.error("Migration failed", e);
    }
};

const checkAndResetLocalDailyHabits = () => {
    const todayStr = getTodayString();
    const habits = getLocalHabits();
    let needsUpdate = false;
    habits.forEach(h => {
        if (h.completed && h.completedDate !== todayStr) {
            h.completed = false;
            h.completedDate = null;
            needsUpdate = true;
        }
    });
    if (needsUpdate) saveLocalHabits(habits);
};

// ==== NAVIGATION & SETUP ====
loginSyncBtn.addEventListener('click', () => {
    dashboardSection.classList.add('hidden');
    authSection.classList.remove('hidden');
});

closeAuthBtn.addEventListener('click', () => {
    authSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
});

const loadInitialLocalState = () => {
    checkAndResetLocalDailyHabits();
    renderLocalHabits();
};

const setCloudMode = () => {
    loginSyncBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
    userDisplay.textContent = currentUser.email;
    subscribeToHabits();
};

const setLocalMode = () => {
    loginSyncBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    userDisplay.textContent = "Local Mode (Not Syncing)";
    if (currentUnsubscribe) {
        currentUnsubscribe();
        currentUnsubscribe = null;
    }
    loadInitialLocalState();
};

if (isFirebaseInitialized) {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser = user;
            // On sign in, migrate any pending local data to user's account
            await migrateLocalToFirebase(user.uid);
            checkAndResetDailyHabits();
            setCloudMode();
            // Automatically close auth panel if it was open
            authSection.classList.add('hidden');
            dashboardSection.classList.remove('hidden');
        } else {
            currentUser = null;
            setLocalMode();
        }
    });
} else {
    // Purely local execution if firebase isn't setup
    setLocalMode();
}

// ==== AUTHENTICATION EVENTS ====
toggleAuthText.addEventListener('click', () => {
    isSignup = !isSignup;
    authBtn.textContent = isSignup ? 'Sign Up' : 'Log In';
    toggleAuthText.textContent = isSignup ? 'Log in instead' : 'Create an account';
    document.querySelector('.auth-header h2').textContent = isSignup ? 'Join HabitFlow' : 'HabitFlow';
    document.querySelector('.auth-header p').textContent = isSignup ? 'Sign up to sync your local data to the cloud.' : 'Sign in to sync your local data to the cloud.';
    authError.textContent = '';
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isFirebaseInitialized) {
        authError.textContent = "Please configure Firebase API keys in app.js!";
        return;
    }

    authError.textContent = '';
    authBtn.disabled = true;
    authBtn.textContent = 'Processing...';

    try {
        if (isSignup) {
            await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        } else {
            await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        }
    } catch (error) {
        authError.textContent = error.message.replace('Firebase:', '');
    } finally {
        authBtn.disabled = false;
        authBtn.textContent = isSignup ? 'Sign Up' : 'Log In';
    }
});

googleBtn.addEventListener('click', async () => {
    if (!isFirebaseInitialized) {
        authError.textContent = "Please configure Firebase API keys first!";
        return;
    }
    authError.textContent = '';
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        authError.textContent = error.message.replace('Firebase:', '');
    }
});

logoutBtn.addEventListener('click', () => {
    if (auth) signOut(auth);
});

// ==== HABITS LOGIC: ROUTING LOCAL VS DB ====
addHabitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const task = newHabitInput.value.trim();
    if (!task) return;

    newHabitInput.value = '';

    if (currentUser) {
        const addBtn = document.getElementById('add-habit-btn');
        addBtn.disabled = true;
        try {
            await addDoc(collection(db, "habits"), {
                userId: currentUser.uid,
                task: task,
                completed: false,
                createdAt: serverTimestamp(),
                completedDate: null
            });
        } catch (error) {
            console.error("Error adding habit: ", error);
        } finally {
            addBtn.disabled = false;
        }
    } else {
        // Local add
        const habits = getLocalHabits();
        habits.push({
            id: 'local_' + Date.now().toString(),
            task: task,
            completed: false,
            createdAt: Date.now(),
            completedDate: null
        });
        saveLocalHabits(habits);
        renderLocalHabits();
    }
});

const toggleHabitAction = async (id, isCompleted) => {
    if (currentUser) {
        const habitRef = doc(db, "habits", id);
        try {
            await updateDoc(habitRef, {
                completed: isCompleted,
                completedDate: isCompleted ? getTodayString() : null
            });
        } catch (e) { console.error(e); }
    } else {
        const habits = getLocalHabits();
        const h = habits.find(h => h.id === id);
        if (h) {
            h.completed = isCompleted;
            h.completedDate = isCompleted ? getTodayString() : null;
            saveLocalHabits(habits);
        }
    }
};

const deleteHabitAction = async (id) => {
    if (!confirm("Are you sure you want to delete this habit?")) return;

    if (currentUser) {
        const habitRef = doc(db, "habits", id);
        try {
            await deleteDoc(habitRef);
        } catch (e) { console.error(e); }
    } else {
        let habits = getLocalHabits();
        habits = habits.filter(h => h.id !== id);
        saveLocalHabits(habits);
        renderLocalHabits();
    }
};

// ==== RENDERING ====
const renderLocalHabits = () => {
    habitsList.innerHTML = '';
    const habits = getLocalHabits();
    if (habits.length === 0) {
        habitsList.innerHTML = `<div class="empty-state">No habits tracked yet.<br>Start by adding one above!</div>`;
        return;
    }
    // Sort oldest first roughly
    habits.forEach(h => appendHabitToDOM(h.id, h));
};

const subscribeToHabits = () => {
    loadingSpinner.style.display = 'block';
    const q = query(
        collection(db, "habits"),
        where("userId", "==", currentUser.uid),
        orderBy("createdAt", "asc")
    );

    currentUnsubscribe = onSnapshot(q, (snapshot) => {
        loadingSpinner.style.display = 'none';
        habitsList.innerHTML = '';

        if (snapshot.empty) {
            habitsList.innerHTML = `<div class="empty-state">No habits tracked yet.<br>Start by adding one above!</div>`;
            return;
        }

        snapshot.forEach((doc) => {
            appendHabitToDOM(doc.id, doc.data());
        });
    }, (error) => {
        console.error("Listener error", error);
        loadingSpinner.style.display = 'none';
    });
};

const appendHabitToDOM = (id, habit) => {
    const li = document.createElement('li');
    li.className = `habit-item ${habit.completed ? 'completed' : ''}`;

    const checkWrap = document.createElement('label');
    checkWrap.className = 'checkbox-wrapper';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = habit.completed;
    checkbox.addEventListener('change', () => toggleHabitAction(id, checkbox.checked));

    const checkmark = document.createElement('span');
    checkmark.className = 'checkmark';

    checkWrap.appendChild(checkbox);
    checkWrap.appendChild(checkmark);

    const textSpan = document.createElement('span');
    textSpan.className = 'habit-text';
    textSpan.textContent = habit.task;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 7L18.1327 19.1425C18.0579 20.1891 17.187 21 16.1378 21H7.86224C6.81296 21 5.94208 20.1891 5.86732 19.1425L5 7M10 11V17M14 11V17M15 7V4C15 3.44772 14.5523 3 14 3H10C9.44772 3 9 3.44772 9 4V7M4 7H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    delBtn.addEventListener('click', () => deleteHabitAction(id));

    li.appendChild(checkWrap);
    li.appendChild(textSpan);
    li.appendChild(delBtn);
    habitsList.appendChild(li);
};

// Cloud daily reset logic
const checkAndResetDailyHabits = async () => {
    if (!currentUser) return;
    const todayStr = getTodayString();

    const q = query(collection(db, "habits"), where("userId", "==", currentUser.uid));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let needsUpdate = false;

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data.completed && data.completedDate !== todayStr) {
            batch.update(docSnap.ref, { completed: false, completedDate: null });
            needsUpdate = true;
        }
    });

    if (needsUpdate) await batch.commit();
};
