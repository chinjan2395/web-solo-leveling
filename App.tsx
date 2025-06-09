import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

const App = () => {
  // Firebase state
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);

  // Game state
  const [level, setLevel] = useState(1);
  const [xp, setXp] = useState(0);
  const [xpToNextLevel, setXpToNextLevel] = useState(100);
  const [stats, setStats] = useState({
    focus: 10,       // Ability to concentrate on tasks
    energy: 10,      // Physical and mental stamina
    creativity: 10,  // Problem-solving and innovative thinking
    health: 10,      // General well-being and resistance to fatigue
    dexterity: 10,   // Typing speed, coding efficiency
    mentalResilience: 10, // Ability to handle stress and setbacks
  });
  const [availablePoints, setAvailablePoints] = useState(0);
  const [dailyQuests, setDailyQuests] = useState([]);
  const [dungeons, setDungeons] = useState([]); // New state for dungeons
  const [lastLoginDate, setLastLoginDate] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState('');

  // Manual Health Input State
  const [exerciseDuration, setExerciseDuration] = useState('');
  const [waterGlasses, setWaterGlasses] = useState('');
  const [sleepHours, setSleepHours] = useState('');

  // LLM generation states
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [isGeneratingAffirmation, setIsGeneratingAffirmation] = useState(false);


  // References for Firebase global variables
  const appIdRef = useRef(null);
  const firebaseConfigRef = useRef(null);
  const initialAuthTokenRef = useRef(null);

  // Initialize Firebase and Auth
  useEffect(() => {
    appIdRef.current = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    firebaseConfigRef.current = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
    initialAuthTokenRef.current = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    if (firebaseConfigRef.current) {
      try {
        const app = initializeApp(firebaseConfigRef.current);
        const firestore = getFirestore(app);
        const authentication = getAuth(app);
        setDb(firestore);
        setAuth(authentication);

        onAuthStateChanged(authentication, async (user) => {
          if (user) {
            setUserId(user.uid);
          } else {
            try {
              if (initialAuthTokenRef.current) {
                await signInWithCustomToken(authentication, initialAuthTokenRef.current);
              } else {
                await signInAnonymously(authentication);
              }
            } catch (authError) {
              console.error("Firebase Auth Error during onAuthStateChanged:", authError);
              // Fallback for user ID if auth fails in this specific listener path
              setUserId(crypto.randomUUID());
            }
          }
          setIsAuthReady(true); // Always set auth ready after initial auth check or attempt
        });
      } catch (initError) {
        console.error("Firebase Initialization Error:", initError);
        // If Firebase init fails, set a fallback userId and mark auth ready
        setUserId(crypto.randomUUID());
        setIsAuthReady(true);
        setLoading(false); // Crucially, set loading to false here if init fails
      }
    } else {
      console.error("Firebase config is not available. Running in non-persistent mode.");
      setUserId(crypto.randomUUID()); // Use a random ID if Firebase isn't configured
      setIsAuthReady(true);
      setLoading(false); // Also set loading to false here immediately
    }
  }, []); // Run once on component mount

  // Load user data and set up snapshot listener
  useEffect(() => {
    // Only attempt to load from Firestore if db is available and auth is ready
    if (isAuthReady && userId && db) {
      const userDocRef = doc(db, `artifacts/${appIdRef.current}/users/${userId}/developer_system/profile`);

      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLevel(data.level || 1);
          setXp(data.xp || 0);
          setXpToNextLevel(data.xpToNextLevel || 100);
          setStats(data.stats || {
            focus: 10, energy: 10, creativity: 10, health: 10, dexterity: 10, mentalResilience: 10,
          });
          setAvailablePoints(data.availablePoints || 0);
          setDailyQuests(data.dailyQuests || []);
          setDungeons(data.dungeons || []); // Load dungeons
          setLastLoginDate(data.lastLoginDate);
        } else {
          // Initialize new user data if document doesn't exist AND db is available
          initializeUserData(); // This function already checks for db and userId
        }
        setLoading(false); // Always set loading to false after snapshot attempt
      }, (error) => {
        console.error("Error fetching user data from snapshot:", error);
        setLoading(false); // Set loading to false even on snapshot error
        // Optionally, try to initialize again if there's a read error, or indicate non-persistent mode
        initializeUserData();
      });

      return () => unsubscribe(); // Cleanup snapshot listener
    } else if (isAuthReady && !db) {
        // If auth is ready but db is null (meaning Firebase init failed),
        // ensure loading is false so the app renders in non-persistent mode.
        setLoading(false);
    }
  }, [isAuthReady, userId, db]);

  // Handle daily quest/dungeon generation and reminders
  useEffect(() => {
    if (!loading && isAuthReady && userId) { // Removed 'db' from dependencies here, as it might be null for non-persistent mode
      const today = new Date().toDateString();
      const storedDate = lastLoginDate ? new Date(lastLoginDate).toDateString() : null;

      if (today !== storedDate || dailyQuests.length === 0 || dungeons.length === 0) {
        handleNewDay();
      }
      // Set up reminder intervals (simulated by triggering messages)
      const setupReminders = () => {
        addNotification("Reminder: Hydration check! Have you had water recently? (Water icon)");
        addNotification("Reminder: Digital well-being check! Step away from the screen for a minute. (Eye icon)");
      };
      setupReminders();
    }
  }, [loading, isAuthReady, userId, lastLoginDate]); // Removed 'db' from dependencies


  // Function to save user data to Firestore
  const saveUserData = async () => {
    // Only attempt to save if db is available
    if (db && userId) {
      try {
        const userDocRef = doc(db, `artifacts/${appIdRef.current}/users/${userId}/developer_system/profile`);
        await setDoc(userDocRef, {
          level,
          xp,
          xpToNextLevel,
          stats,
          availablePoints,
          dailyQuests,
          dungeons, // Save dungeons
          lastLoginDate: lastLoginDate || new Date().toDateString(),
        }, { merge: true });
      } catch (error) {
        console.error("Error saving user data:", error);
      }
    }
  };

  // Debounced save
  const debounceSaveRef = useRef(null);
  useEffect(() => {
    if (!loading) {
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
      }
      debounceSaveRef.current = setTimeout(() => {
        saveUserData();
      }, 500);
    }
    return () => {
      if (debounceSaveRef.current) {
        clearTimeout(debounceSaveRef.current);
      }
    };
  }, [level, xp, xpToNextLevel, stats, availablePoints, dailyQuests, dungeons, lastLoginDate, loading]);


  const initializeUserData = async () => {
    // Only attempt to initialize data in Firestore if db is available
    if (db && userId) {
      const initialStats = {
        focus: 10, energy: 10, creativity: 10, health: 10, dexterity: 10, mentalResilience: 10,
      };
      const initialQuests = generateQuestsList();
      const initialDungeons = generateDungeonList();
      try {
        const userDocRef = doc(db, `artifacts/${appIdRef.current}/users/${userId}/developer_system/profile`);
        await setDoc(userDocRef, {
          level: 1,
          xp: 0,
          xpToNextLevel: 100,
          stats: initialStats,
          availablePoints: 0,
          dailyQuests: initialQuests,
          dungeons: initialDungeons,
          lastLoginDate: new Date().toDateString(),
        });
        setLevel(1);
        setXp(0);
        setXpToNextLevel(100);
        setStats(initialStats);
        setAvailablePoints(0);
        setDailyQuests(initialQuests);
        setDungeons(initialDungeons);
        setLastLoginDate(new Date().toDateString());
        // Do NOT set loading to false here, it's handled by onSnapshot or the fallback
      } catch (error) {
        console.error("Error initializing user data:", error);
        // Do NOT set loading to false here, it's handled by onSnapshot or the fallback
      }
    } else {
        // If db is not available, initialize state in memory only
        console.warn("Firestore not available, initializing data in memory only.");
        setLevel(1);
        setXp(0);
        setXpToNextLevel(100);
        setStats({
            focus: 10, energy: 10, creativity: 10, health: 10, dexterity: 10, mentalResilience: 10,
        });
        setAvailablePoints(0);
        setDailyQuests(generateQuestsList());
        setDungeons(generateDungeonList());
        setLastLoginDate(new Date().toDateString());
    }
  };

  const generateQuestsList = () => {
    const quests = [
      { id: 'q_code_1', description: 'Complete a coding task (small feature/bug fix).', type: 'work', status: 'pending', rewardXP: 25, rewardStat: 'focus' },
      { id: 'q_code_2', description: 'Review 50 lines of code from a colleague.', type: 'work', status: 'pending', rewardXP: 20, rewardStat: 'creativity' },
      { id: 'q_exercise_1', description: 'Do 15 minutes of light exercise (stretching/walk).', type: 'health', status: 'pending', rewardXP: 15, rewardStat: 'energy' },
      { id: 'q_water_1', description: 'Drink 2 glasses of water. (Water icon)', type: 'health', status: 'pending', rewardXP: 10, rewardStat: 'health' },
      { id: 'q_break_1', description: 'Take a 10-minute break away from screens.', type: 'wellbeing', status: 'pending', rewardXP: 10, rewardStat: 'mentalResilience' },
      { id: 'q_eyes_1', description: 'Apply the 20-20-20 rule (every 20 mins, look 20 feet away for 20 secs).', type: 'wellbeing', status: 'pending', rewardXP: 5, rewardStat: 'health' },
      { id: 'q_learn_1', description: 'Spend 30 minutes learning a new tech concept.', type: 'skill', status: 'pending', rewardXP: 30, rewardStat: 'dexterity' },
      // Samsung Health related quests
      { id: 'q_samsung_exercise', description: 'Log 30 minutes of activity in Samsung Health.', type: 'health', status: 'pending', rewardXP: 20, rewardStat: 'energy' },
      { id: 'q_samsung_water', description: 'Track 8 glasses of water in Samsung Health.', type: 'health', status: 'pending', rewardXP: 15, rewardStat: 'health' },
      { id: 'q_samsung_sleep', description: 'Record 7-9 hours of sleep in Samsung Health.', type: 'health', status: 'pending', rewardXP: 25, rewardStat: 'mentalResilience' },
      { id: 'q_samsung_heart', description: 'Check heart rate in Samsung Health (if applicable).', type: 'health', status: 'pending', rewardXP: 10, rewardStat: 'health' },
    ];
    return quests.sort(() => Math.random() - 0.5).slice(0, 5 + Math.floor(Math.random() * 3));
  };

  const generateDungeonList = () => {
    const dungeons = [
      { id: 'd_e', name: 'Class E Dungeon: Morning Warm-up', description: 'Complete a 15-minute full-body stretch or light cardio.', difficulty: 'Easy', rewardXP: 75, rewardPoints: 1, status: 'available' },
      { id: 'd_d', name: 'Class D Dungeon: Deep Work Flow', description: 'Achieve 2 hours of uninterrupted, highly focused coding.', difficulty: 'Medium', rewardXP: 150, rewardPoints: 2, status: 'available' },
      { id: 'd_c', name: 'Class C Dungeon: Code Refactoring Challenge', description: 'Refactor a complex legacy code section improving readability and performance.', difficulty: 'Hard', rewardXP: 250, rewardPoints: 3, status: 'available' },
      { id: 'd_b', name: 'Class B Dungeon: New Feature Sprint', description: 'Deliver a new, impactful feature from concept to deployment.', difficulty: 'Very Hard', rewardXP: 400, rewardPoints: 4, status: 'available' },
      { id: 'd_a', name: 'Class A Dungeon: System Architecture Design', description: 'Design a scalable architecture for a major system component or project.', difficulty: 'Extreme', rewardXP: 600, rewardPoints: 5, status: 'available' },
    ];
    return dungeons;
  };

  const handleNewDay = () => {
    // Reset daily quests
    const newQuests = generateQuestsList();
    setDailyQuests(newQuests);

    // Reset dungeons
    const newDungeons = generateDungeonList().map(d => ({ ...d, status: 'available' }));
    setDungeons(newDungeons);

    setLastLoginDate(new Date().toDateString());
    addNotification("New day, new challenges! Daily quests and Dungeons have been reset.");
  };

  const addNotification = (message) => {
    setNotifications(prev => [...prev, message]);
    setTimeout(() => {
      setNotifications(prev => prev.slice(1));
    }, 5000);
  };

  const completeQuest = (questId) => {
    setDailyQuests(prevQuests => {
      const updatedQuests = prevQuests.map(q =>
        q.id === questId && q.status === 'pending' ? { ...q, status: 'completed' } : q
      );

      const completedQuest = prevQuests.find(q => q.id === questId); // Find original pending quest
      if (completedQuest && completedQuest.status === 'pending') {
        processReward(completedQuest.rewardXP, completedQuest.rewardStat, `Quest Completed! "${completedQuest.description}"`);
      }
      return updatedQuests;
    });
  };

  const clearDungeon = (dungeonId) => {
    setDungeons(prevDungeons => {
      const updatedDungeons = prevDungeons.map(d =>
        d.id === dungeonId && d.status === 'available' ? { ...d, status: 'cleared' } : d
      );

      const clearedDungeon = prevDungeons.find(d => d.id === dungeonId); // Find original available dungeon
      if (clearedDungeon && clearedDungeon.status === 'available') {
        processReward(clearedDungeon.rewardXP, null, `Dungeon Cleared! "${clearedDungeon.name}"`);
        setAvailablePoints(prev => prev + clearedDungeon.rewardPoints);
        addNotification(`Gained ${clearedDungeon.rewardPoints} Available Points from dungeon!`);
      } else {
        showCustomModal("This dungeon has already been cleared today or is not available.");
      }
      return updatedDungeons;
    });
  };

  const processReward = (xpReward, statReward, message) => {
    const newXp = xp + xpReward;
    let newLevel = level;
    let newXpToNextLevel = xpToNextLevel;
    let newAvailablePoints = availablePoints;

    addNotification(`${message} +${xpReward} XP`);

    if (statReward) {
      setStats(prevStats => ({
        ...prevStats,
        [statReward]: prevStats[statReward] + 1
      }));
      addNotification(`Stat increase: +1 ${statReward}!`);
    }

    if (newXp >= newXpToNextLevel) {
      newLevel = level + 1;
      newXpToNextLevel = Math.floor(xpToNextLevel * 1.5);
      newAvailablePoints = availablePoints + 3; // 3 points per level up
      setLevel(newLevel);
      setXp(newXp - xpToNextLevel);
      setXpToNextLevel(newXpToNextLevel);
      setAvailablePoints(newAvailablePoints);
      addNotification(`Level Up! You are now Level ${newLevel}! Available Points: ${newAvailablePoints}`);
    } else {
      setXp(newXp);
    }
  };

  const allocatePoint = (statName) => {
    if (availablePoints > 0) {
      setStats(prevStats => ({
        ...prevStats,
        [statName]: prevStats[statName] + 1
      }));
      setAvailablePoints(prev => prev - 1);
      addNotification(`Allocated 1 point to ${statName}.`);
    } else {
      showCustomModal("No available points to allocate.");
    }
  };

  const showCustomModal = (message) => {
    setModalContent(message);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setModalContent('');
  };

  const handleLogHealthData = (type) => {
    let message = "";
    if (type === 'exercise') {
      message = `Logged ${exerciseDuration} minutes of exercise. Keep it up!`;
      setExerciseDuration('');
    } else if (type === 'water') {
      message = `Logged ${waterGlasses} glasses of water. Stay hydrated!`;
      setWaterGlasses('');
    } else if (type === 'sleep') {
      message = `Logged ${sleepHours} hours of sleep. Rest is crucial!`;
      setSleepHours('');
    }
    addNotification(message);
    showCustomModal("Health data manually recorded. Remember to also log these activities in your Samsung Health app for comprehensive tracking!");
  };

  // LLM Integration for Quest Insight
  const generateQuestInsight = async (questDescription) => {
    setIsGeneratingInsight(true);
    setModalContent("Generating quest insight...");
    setShowModal(true);

    try {
      const prompt = `You are a highly experienced software development mentor. Provide 3-5 actionable sub-tasks or detailed strategies to effectively complete the following daily quest for a work-from-home software developer: '${questDescription}'. Focus on productivity, well-being, and skill enhancement. Present the insights as a clear, concise bulleted list, starting each bullet with a practical verb.`;

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas provides this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setModalContent(`✨ Quest Insight for "${questDescription}":\n\n${text}`);
      } else {
        setModalContent("SYSTEM ERROR: Failed to generate quest insight. Please try again.");
        console.error("Gemini API response structure unexpected:", result);
      }
    } catch (error) {
      setModalContent("SYSTEM ERROR: Could not connect to the AI mainframe for quest insight. Please check your network connection.");
      console.error("Error generating quest insight:", error);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  // LLM Integration for Daily Affirmation
  const generateDailyAffirmation = async () => {
    setIsGeneratingAffirmation(true);
    addNotification("Generating your daily motivation...");

    try {
      const prompt = "You are a motivating personal coach for a work-from-home software developer. Generate a short, encouraging, and highly specific daily affirmation or motivational tip (1-2 sentences) that helps with focus, productivity, and mental resilience. Make it sound like a system message from a game. Start with 'SYSTEM: Your daily motivation is:' and follow directly with the tip.";

      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });
      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas provides this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        addNotification(text);
      } else {
        addNotification("SYSTEM ERROR: Could not generate daily motivation.");
        console.error("Gemini API response structure unexpected:", result);
      }
    } catch (error) {
      addNotification("SYSTEM ERROR: Failed to connect to the AI mainframe for daily motivation.");
      console.error("Error generating daily affirmation:", error);
    } finally {
      setIsGeneratingAffirmation(false);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-xl font-mono animate-pulse">Loading System...</div>
      </div>
    );
  }

  // Helper function to get icon for each stat
  const getStatIcon = (statName) => {
    switch (statName) {
      case 'focus':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-indigo-400">
            <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/>
          </svg>
        );
      case 'energy':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-yellow-400">
            <path d="M11 2.25a.75.75 0 0 1 .75.75v6.182l.711-.532a.75.75 0 0 1 .976 1.15l-3.5 3a.75.75 0 0 1-.84-.04l-2.25-2.25a.75.75 0 0 1 1.06-1.06l1.72 1.72V3a.75.75 0 0 1 .75-.75zM12 21.75a.75.75 0 0 0-.75-.75v-6.182l-.711.532a.75.75 0 0 0-.976-1.15l3.5-3a.75.75 0 0 0 .84.04l2.25 2.25a.75.75 0 0 0-1.06 1.06l-1.72-1.72V21a.75.75 0 0 0 .75.75z"/>
          </svg>
        );
      case 'creativity':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-purple-400">
            <path d="M12 2c-3.313 0-6 2.687-6 6 0 2.206 1.196 4.162 3 5.205V15a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3v-1.795c1.804-1.043 3-2.999 3-5.205 0-3.313-2.687-6-6-6zm-1 15h2v2h-2v-2z"/>
          </svg>
        );
      case 'health':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-red-400">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        );
      case 'dexterity':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-blue-400">
            <path fillRule="evenodd" d="M14.47 2.25a.75.75 0 0 1 .527.22l5.25 5.25a.75.75 0 0 1 0 1.06l-6.5 6.5a.75.75 0 0 1-1.06 0l-5.25-5.25a.75.75 0 0 1 0-1.06l6.5-6.5a.75.75 0 0 1 .527-.22ZM8.694 13.5c.321 0 .639-.074.932-.218l4.473-2.236-.704-.704-4.473 2.236a2.25 2.25 0 0 1-.932-.218l-1.547-1.547a.75.75 0 0 1 1.06-1.06l1.547 1.547a.75.75 0 0 0 .932.218Z" clipRule="evenodd" />
          </svg>
        );
      case 'mentalResilience':
        return (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-gray-400">
            <path fillRule="evenodd" d="M3.528 2.584A2.08 2.08 0 0 1 5.307 1.5h13.386c.866 0 1.693.393 2.152 1.084.46.691.666 1.63.46 2.504l-1.487 6.442a4.5 4.5 0 0 1-2.923 3.444l-.946.315c-1.391.464-2.736.696-4.053.696h0a.75.75 0 0 1-.75-.75v-10.5a.75.75 0 0 1 .75-.75h.001c1.317 0 2.662.232 4.053.696l.946.315a4.5 4.5 0 0 0 2.923-3.444l1.487-6.442a2.08 2.08 0 0 1 1.83-2.504Z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
        <div className="text-xl font-mono animate-pulse">Loading System...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 text-gray-100 font-inter p-4 sm:p-8 flex flex-col items-center">
      <div className="w-full max-w-4xl bg-gray-800 rounded-xl shadow-2xl p-6 sm:p-8 border border-gray-700">

        {/* Header */}
        <h1 className="text-3xl sm:text-4xl font-bold text-center text-blue-400 mb-6 font-mono tracking-wide">
          <span className="text-purple-400">DEV</span>ELOPER SYSTEM
        </h1>
        <p className="text-center text-gray-400 mb-8 text-sm">
          Welcome, <span className="font-semibold text-blue-300">Hunter {userId?.substring(0, 8)}...</span>. Optimize your daily grind!
        </p>

        {/* System Notifications */}
        <div className="mb-8 min-h-[40px] ">
          {notifications.map((msg, index) => (
            <div key={index} className="bg-blue-900/50 text-blue-200 text-sm p-2 rounded-lg mb-2 animate-fade-in-out border border-blue-800">
              <span className="font-bold">[ SYSTEM MESSAGE ]</span> {msg}
            </div>
          ))}
        </div>

        {/* Main Content Grid - Adjusted for full width sections */}
        <div className="grid grid-cols-1 gap-8 mb-8"> {/* Changed to grid-cols-1 always */}
          {/* STATUS section (Stats only) */}
          <div className="bg-gray-700 p-6 rounded-lg shadow-inner border border-gray-600">
            <h2 className="text-2xl font-bold text-blue-300 mb-4 font-mono">
              <span className="text-yellow-300">STATUS</span>: {level}
            </h2>
            <div className="mb-6 p-3 bg-gray-600 rounded-lg shadow-md border border-gray-500">
              <p className="text-lg font-semibold text-gray-200 mb-2">XP: {xp} / {xpToNextLevel}</p>
              <div className="w-full bg-gray-500 rounded-full h-4 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-green-500 to-lime-400 shadow-lg"
                  style={{ width: `${(xp / xpToNextLevel) * 100}%` }}
                ></div>
              </div>
            </div>

            {/* Stats Grid - Now compact and side-by-side */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3"> {/* Changed to grid-cols-2 with gap */}
              {Object.entries(stats).map(([statName, value]) => (
                <div key={statName} className="flex flex-col items-center bg-gray-800 p-3 rounded-md border border-gray-700 shadow-sm text-center">
                  <div className="flex items-center justify-center space-x-1 mb-1">
                    {getStatIcon(statName)}
                    <span className="capitalize text-gray-300 font-semibold text-sm sm:text-base">{statName}:</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <span className="text-lg font-bold text-yellow-300">{value}</span>
                    {availablePoints > 0 && (
                      <button
                        onClick={() => allocatePoint(statName)}
                        className="bg-green-600 hover:bg-green-700 text-white font-extrabold py-0.5 px-2 rounded-full text-xs transition-all duration-200 shadow-md hover:shadow-lg hover:ring-2 hover:ring-green-400 hover:ring-opacity-75 focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-opacity-75 transform hover:scale-110"
                        title={`Allocate 1 point to ${statName}`}
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Available Points (New Full Width, Minimal Design) */}
          <div className="w-full text-center p-3 bg-gray-700 rounded-lg border border-gray-600 shadow-md mt-0">
            <p className="text-xl font-bold text-gray-200">Available Points: <span className="text-green-400 text-2xl">{availablePoints}</span></p>
          </div>

          {/* Daily Quests (Now full width) */}
          <div className="bg-gray-700 p-6 rounded-lg shadow-inner border border-gray-600">
            <h2 className="text-2xl font-bold text-blue-300 mb-4 font-mono">
              <span className="text-yellow-300">DAILY QUESTS</span>
            </h2>
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-3 custom-scrollbar">
              {dailyQuests.map((quest) => (
                <div
                  key={quest.id}
                  className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg shadow-xl border
                    ${quest.status === 'completed' ? 'bg-green-900/40 border-green-700' : 'bg-gray-800 border-gray-700 hover:border-blue-500'}`
                  }
                >
                  <div className="flex-1 mb-2 sm:mb-0 sm:mr-4">
                    <p className={`font-semibold ${quest.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-200'}`}>
                      {quest.description}
                    </p>
                    <p className="text-sm text-gray-400 mt-1">
                      Reward: <span className="font-semibold text-yellow-300">{quest.rewardXP} XP</span>, +1 {quest.rewardStat}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                    {quest.status === 'pending' && (
                      <button
                        onClick={() => generateQuestInsight(quest.description)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-3 rounded-full text-xs transition-all duration-200 shadow-md hover:shadow-lg transform hover:scale-105 flex items-center justify-center whitespace-nowrap w-full sm:w-auto"
                        disabled={isGeneratingInsight}
                      >
                        {isGeneratingInsight ? 'Generating...' : 'Get ✨ Insight'}
                      </button>
                    )}
                    {quest.status === 'pending' ? (
                      <button
                        onClick={() => completeQuest(quest.id)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 whitespace-nowrap w-full sm:w-auto"
                      >
                        Complete
                      </button>
                    ) : (
                      <span className="text-green-400 font-bold text-sm sm:text-base px-2 py-1 rounded-md bg-green-800/30 whitespace-nowrap">
                        <span role="img" aria-label="check mark">✔</span> COMPLETED!
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Daily Affirmation Button */}
            <button
              onClick={generateDailyAffirmation}
              className="mt-6 w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 px-6 rounded-full transition duration-200 shadow-lg transform hover:scale-105 flex items-center justify-center"
              disabled={isGeneratingAffirmation}
            >
              {isGeneratingAffirmation ? 'Generating Daily Motivation...' : 'Get ✨ Daily Affirmation'}
            </button>
          </div>
        </div>

        {/* Dungeons Section */}
        <div className="bg-gray-700 p-6 rounded-lg shadow-inner border border-gray-600 mb-8">
          <h2 className="text-2xl font-bold text-blue-300 mb-4 font-mono">
            <span className="text-red-400">DUNGEONS</span> (Daily Challenges)
          </h2>
          <div className="space-y-4">
            {dungeons.map((dungeon) => (
              <div
                key={dungeon.id}
                className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-md border
                  ${dungeon.status === 'cleared' ? 'bg-red-900/40 border-red-700' : 'bg-gray-800 border-gray-700'}`
                }
              >
                <div className="flex-1">
                  <p className={`font-bold text-lg ${dungeon.status === 'cleared' ? 'line-through text-gray-400' : 'text-orange-300'}`}>
                    {dungeon.name} <span className="text-sm text-gray-400">({dungeon.difficulty})</span>
                  </p>
                  <p className={`text-gray-300 mt-1 ${dungeon.status === 'cleared' ? 'line-through text-gray-400' : ''}`}>
                    {dungeon.description}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    Reward: <span className="font-semibold text-yellow-300">{dungeon.rewardXP} XP</span>, <span className="font-semibold text-green-400">{dungeon.rewardPoints} Points</span>
                  </p>
                </div>
                {dungeon.status === 'available' ? (
                  <button
                    onClick={() => clearDungeon(dungeon.id)}
                    className="mt-3 sm:mt-0 ml-0 sm:ml-4 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-full transition duration-200 shadow-lg"
                  >
                    Clear Dungeon
                  </button>
                ) : (
                  <span className="mt-3 sm:mt-0 ml-0 sm:ml-4 text-orange-400 font-bold">CLEARED!</span>
                )}
              </div>
            ))}
          </div>
          <button
            onClick={handleNewDay}
            className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-full transition duration-200 shadow-lg transform hover:scale-105"
          >
            Reset Daily Quests & Dungeons (New Day)
          </button>
        </div>


        {/* Health Metrics Section (Manual Input) */}
        <div className="bg-gray-700 p-6 rounded-lg shadow-inner border border-gray-600 mt-8">
          <h2 className="text-2xl font-bold text-blue-300 mb-4 font-mono">
            <span className="text-green-400">HEALTH METRICS</span> (Simulated Samsung Health)
          </h2>
          <p className="text-red-300 mb-4 text-sm font-semibold">
            <span className="font-bold">SYSTEM NOTE:</span> Direct integration with Samsung Health is not possible from this web application. Please manually enter your data below after tracking it in your Samsung Health app.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Exercise */}
            <div className="flex flex-col">
              <label htmlFor="exerciseDuration" className="text-gray-300 text-sm mb-1">Exercise Duration (minutes)</label>
              <input
                type="number"
                id="exerciseDuration"
                value={exerciseDuration}
                onChange={(e) => setExerciseDuration(e.target.value)}
                placeholder="e.g., 30"
                className="p-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:ring-blue-500 focus:border-blue-500 mb-2"
              />
              <button
                onClick={() => handleLogHealthData('exercise')}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-full transition duration-200 shadow-md"
              >
                Log Exercise
              </button>
            </div>

            {/* Water */}
            <div className="flex flex-col">
              <label htmlFor="waterGlasses" className="text-gray-300 text-sm mb-1">Water Intake (glasses)</label>
              <input
                type="number"
                id="waterGlasses"
                value={waterGlasses}
                onChange={(e) => setWaterGlasses(e.target.value)}
                placeholder="e.g., 8"
                className="p-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:ring-blue-500 focus:border-blue-500 mb-2"
              />
              <button
                onClick={() => handleLogHealthData('water')}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full transition duration-200 shadow-md"
              >
                Log Water
              </button>
            </div>

            {/* Sleep */}
            <div className="flex flex-col">
              <label htmlFor="sleepHours" className="text-gray-300 text-sm mb-1">Sleep Hours</label>
              <input
                type="number"
                id="sleepHours"
                value={sleepHours}
                onChange={(e) => setSleepHours(e.target.value)}
                placeholder="e.g., 7.5"
                step="0.5"
                className="p-2 rounded-md bg-gray-800 border border-gray-600 text-gray-200 focus:ring-blue-500 focus:border-blue-500 mb-2"
              />
              <button
                onClick={() => handleLogHealthData('sleep')}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-full transition duration-200 shadow-md"
              >
                Log Sleep
              </button>
            </div>
          </div>
        </div>

        {/* Instructions and Reminders Section */}
        <div className="bg-gray-700 p-6 rounded-lg shadow-inner border border-gray-600 mt-8">
          <h2 className="text-2xl font-bold text-blue-300 mb-4 font-mono">
            <span className="text-yellow-300">REMINDERS</span> & TIPS
          </h2>
          <ul className="list-disc list-inside text-gray-300 space-y-2">
            <li><span className="font-semibold text-yellow-200">Hydration:</span> Aim for a glass of water every hour. Keep a bottle handy!</li>
            <li><span className="font-semibold text-yellow-200">Breaks:</span> Implement the Pomodoro Technique (25 mins work, 5 mins break). Stand up, stretch, look out the window.</li>
            <li><span className="font-semibold text-yellow-200">Exercise:</span> Short bursts of activity throughout the day (bodyweight exercises, walking).</li>
            <li><span className="font-semibold text-yellow-200">Digital Well-being:</span> Set boundaries for screen time. Avoid work emails after hours.</li>
            <li><span className="font-semibold text-yellow-200">Ergonomics:</span> Ensure your desk, chair, and monitor are set up correctly to prevent strain.</li>
            <li><span className="font-semibold text-yellow-200">Learning:</span> Dedicate time daily to learning new skills or technologies relevant to your work.</li>
            <li><span className="font-semibold text-yellow-200">Rest:</span> Prioritize 7-9 hours of quality sleep. Your brain needs to defrag.</li>
            <li><span className="font-semibold text-yellow-200">Samsung Health:</span> Use your Samsung Health app as your primary tracker, then use this system to log your completion for XP and rewards!</li>
          </ul>
        </div>
      </div>

      {/* Custom Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700 max-w-sm w-full text-left">
            <p className="text-lg text-gray-200 mb-4 whitespace-pre-wrap">{modalContent}</p>
            <button
              onClick={closeModal}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full transition duration-200"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Tailwind CSS Classes */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Share+Tech+Mono&display=swap');
        .font-inter { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'Share Tech Mono', monospace; }

        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(10px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        .animate-fade-in-out {
          animation: fadeInOut 5s ease-out forwards;
        }

        /* Custom Scrollbar for Daily Quests */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #374151; /* gray-700 */
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4B5563; /* gray-600 */
          border-radius: 10px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6B7280; /* gray-500 */
        }
      `}</style>
    </div>
  );
};

export default App;
