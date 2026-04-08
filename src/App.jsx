import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, doc, updateDoc, query, orderBy, arrayUnion } from 'firebase/firestore';

// 1. Cấu hình Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDyC9wkxkdxA3stNv7_nQZLVhkjyyPa2zc",
  authDomain: "clone-581d0.firebaseapp.com",
  projectId: "clone-581d0",
  storageBucket: "clone-581d0.firebasestorage.app",
  messagingSenderId: "35828884471",
  appId: "1:35828884471:web:33e119b95a086daf7304f2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// QUAN TRỌNG: Cấu trúc đường dẫn bắt buộc để không bị lỗi Permission Denied
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'yahoo-clone-app';
const getUsersRef = () => collection(db, 'artifacts', APP_ID, 'public', 'data', 'yahoo_users');
const getMessagesRef = () => collection(db, 'artifacts', APP_ID, 'public', 'data', 'yahoo_messages');
const getUserDocRef = (id) => doc(db, 'artifacts', APP_ID, 'public', 'data', 'yahoo_users', id);

const PUBLIC_ROOM = { id: 'public_room', username: '🌍 Yahoo Public Room', isGroup: true };

const BACKGROUNDS = [
  'bg-[#eef1f6]',
  'bg-[#d9e8f5] bg-[url("data:image/svg+xml,%3Csvg width=\'20\' height=\'20\' viewBox=\'0 0 20 20\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.4\' fill-rule=\'evenodd\'%3E%3Ccircle cx=\'3\' cy=\'3\' r=\'3\'/%3E%3Ccircle cx=\'13\' cy=\'13\' r=\'3\'/%3E%3C/g%3E%3C/svg%3E")]',
  'bg-[#ffe4e1] bg-[url("data:image/svg+xml,%3Csvg width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'%23ffb6c1\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z\'/%3E%3C/svg%3E")]',
];

const savedProfile = JSON.parse(localStorage.getItem('yahoo_saved_profile') || 'null');
const savedSoundSetting = JSON.parse(localStorage.getItem('yahoo_sound_setting') ?? 'true');

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [allMessages, setAllMessages] = useState([]);
  const [isDbReady, setIsDbReady] = useState(false);

  const [myProfile, setMyProfile] = useState(savedProfile);
  const [currentScreen, setCurrentScreen] = useState(savedProfile ? 'main' : 'login');
  const [activePartner, setActivePartner] = useState(null);

  const [lastRead, setLastRead] = useState({});
  const [bgIndex, setBgIndex] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(savedSoundSetting);
  const initLoadRef = useRef(true);

  // Lưu thiết lập âm thanh
  useEffect(() => {
    localStorage.setItem('yahoo_sound_setting', JSON.stringify(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    const initApp = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }

        try {
          if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
            await window.Capacitor.Plugins.StatusBar.setStyle({ style: 'LIGHT' });
            await window.Capacitor.Plugins.StatusBar.setOverlaysWebView({ overlay: true });
          }
        } catch (e) { }

        if ("Notification" in window && Notification.permission !== "denied") {
          try {
            const permissionPromise = Notification.requestPermission();
            if (permissionPromise && permissionPromise.catch) {
              permissionPromise.catch(e => console.log("Notification req prevented:", e));
            }
          } catch (e) { console.log("Notification API error:", e); }
        }

        const savedLastRead = localStorage.getItem('yahoo_last_read');
        if (savedLastRead) setLastRead(JSON.parse(savedLastRead));
      } catch (error) { console.error(error); }
    };
    initApp();
    const unsubscribe = onAuthStateChanged(auth, (u) => setFirebaseUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let listenerHandle;
    try {
      if (window.Capacitor && window.Capacitor.Plugins.App) {
        const req = window.Capacitor.Plugins.App.addListener('backButton', () => {
          if (activePartner) setActivePartner(null);
          else if (currentScreen === 'main') window.Capacitor.Plugins.App.minimizeApp();
        });

        if (req && typeof req.then === 'function') {
          req.then(handle => { listenerHandle = handle; });
        } else {
          listenerHandle = req;
        }
      }
    } catch (e) { console.error("Lỗi đăng ký backButton:", e); }

    return () => {
      if (listenerHandle && typeof listenerHandle.remove === 'function') {
        listenerHandle.remove();
      }
    };
  }, [activePartner, currentScreen]);

  useEffect(() => {
    if (!firebaseUser) return;

    const unsubUsers = onSnapshot(getUsersRef(), (snap) => {
      setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error("Lỗi tải users:", err));

    const unsubMsgs = onSnapshot(getMessagesRef(), (snap) => {
      let msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      msgs.sort((a, b) => a.timestamp - b.timestamp);

      setAllMessages(msgs);
      setIsDbReady(true);

      if (initLoadRef.current) { initLoadRef.current = false; return; }

      if (msgs.length > 0 && myProfile) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.sender !== myProfile.username &&
          (lastMsg.receiver === myProfile.username || lastMsg.receiver === PUBLIC_ROOM.id)) {

          const isChattingWithSender = activePartner &&
            (activePartner.username === lastMsg.sender || (activePartner.isGroup && lastMsg.receiver === PUBLIC_ROOM.id));

          if (!isChattingWithSender) {
            // Notification
            try {
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(lastMsg.text === 'BUZZ!!!' ? `🔔 ${lastMsg.sender} BUZZED you!` : `Message from ${lastMsg.sender}`, {
                  body: lastMsg.text === 'BUZZ!!!' ? 'Open app now!' : (lastMsg.imageUrl ? '[Image]' : lastMsg.text),
                });
              }
            } catch (e) { }

            // Rung & Chuông nền (chỉ khi được phép)
            if (soundEnabled && lastMsg.text === 'BUZZ!!!') {
              try { if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]); } catch (e) { }
              try {
                const audio = new Audio('buzz.mp3');
                audio.play().catch(e => { });
              } catch (e) { }
            }
          }
        }
      }
    }, (err) => console.error("Lỗi tải tin nhắn:", err));

    return () => { unsubUsers(); unsubMsgs(); };
  }, [firebaseUser, myProfile, activePartner, soundEnabled]);

  useEffect(() => {
    if (activePartner && myProfile) {
      const newLastRead = { ...lastRead, [activePartner.isGroup ? PUBLIC_ROOM.id : activePartner.username]: Date.now() };
      setLastRead(newLastRead);
      localStorage.setItem('yahoo_last_read', JSON.stringify(newLastRead));
    }
  }, [activePartner, allMessages]);

  const handleAuth = async (username, password, isRegister) => {
    if (!username || !password) return { error: "Please enter ID and Password!" };
    const existingUser = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

    if (isRegister) {
      if (existingUser) return { error: "Yahoo! ID already exists!" };
      await addDoc(getUsersRef(), { username, password, avatarUrl: null, friends: [], createdAt: Date.now() });
      return { success: true, user: { username, friends: [] } };
    } else {
      if (!existingUser || existingUser.password !== password) return { error: "Invalid ID or Password." };
      return { success: true, user: existingUser };
    }
  };

  const currentUserData = allUsers.find(u => u?.username === myProfile?.username) || myProfile;

  const handleLogout = () => {
    setMyProfile(null);
    localStorage.removeItem('yahoo_saved_profile');
    setCurrentScreen('login');
    setActivePartner(null);
  };

  const handleLoginSuccess = (user) => {
    setMyProfile(user);
    localStorage.setItem('yahoo_saved_profile', JSON.stringify(user));
    setCurrentScreen('main');
  };

  return (
    <div className={`h-[100dvh] w-full font-sans flex items-center justify-center relative overflow-hidden md:p-6 lg:p-12 transition-colors duration-300 ${currentScreen === 'login' || currentScreen === 'register' ? 'bg-[#771285]' : 'bg-[#681a75] md:bg-[#2e3440]'}`}>
      <style dangerouslySetInnerHTML={{
        __html: `
        /* --- CSS LOGIN --- */
        .bg-login-exact { background: linear-gradient(180deg, #8a109a 0%, #771285 28%, #909090 50%, #909090 100%); }
        .bg-login-dots {
          background-image: radial-gradient(rgba(0,0,0,0.18) 30%, transparent 30%);
          background-size: 20px 20px; background-position: 0 0, 10px 10px;
          mask-image: linear-gradient(to bottom, black 0%, black 25%, transparent 45%);
          -webkit-mask-image: linear-gradient(to bottom, black 0%, black 25%, transparent 45%);
        }
        .y-bubble { background: radial-gradient(circle at 30% 20%, #e88cf0 0%, #901fa1 40%, #4a0d54 100%); box-shadow: inset -5px -5px 15px rgba(0,0,0,0.4), 0 8px 12px rgba(0,0,0,0.5); }
        .text-silver { background: linear-gradient(180deg, #ffffff 0%, #b3b3b3 50%, #e6e6e6 51%, #ffffff 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; filter: drop-shadow(0px 1px 1px rgba(0,0,0,0.8)); }
        .input-group-bg { background: linear-gradient(180deg, #ffffff 0%, #e6e6e6 100%); box-shadow: inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.6); }
        .glossy-purple { background: linear-gradient(180deg, #d33ed8 0%, #a023a8 49%, #82088f 50%, #9912a6 100%); border: 1px solid #5a0d66; box-shadow: inset 0px 1px 1px rgba(255,255,255,0.6), 0px 2px 3px rgba(0,0,0,0.3); text-shadow: 0 -1px 1px rgba(0,0,0,0.6); }
        .glossy-purple:active { background: #82088f; box-shadow: inset 0 2px 4px rgba(0,0,0,0.5); transform: translateY(1px); }
        .glossy-gray { background: linear-gradient(180deg, #f5f5f5 0%, #dcdcdc 49%, #c4c4c4 50%, #d1d1d1 100%); border: 1px solid #999; box-shadow: inset 0px 1px 1px rgba(255,255,255,0.8), 0px 2px 3px rgba(0,0,0,0.2); text-shadow: 0 1px 1px rgba(255,255,255,0.8); }
        .glossy-gray:active { background: #b8b8b8; box-shadow: inset 0 2px 4px rgba(0,0,0,0.4); transform: translateY(1px); }
        .ios-checkbox-pink { appearance: none; width: 20px; height: 20px; background: linear-gradient(180deg, #fff 0%, #dcdcdc 100%); border: 1px solid #888; border-radius: 4px; box-shadow: inset 0 1px 3px rgba(0,0,0,0.2); position: relative; outline: none; cursor: pointer; }
        .ios-checkbox-pink:checked::after { content: '✔'; position: absolute; color: #d61899; font-size: 18px; font-weight: 900; top: -4px; left: 2px; text-shadow: 0 1px 0 rgba(255,255,255,0.8); }

        /* --- CSS CHAT MỚI HIỆN ĐẠI HƠN --- */
        .bg-yahoo-header { background: linear-gradient(180deg, #8a109a 0%, #771285 50%, #681a75 100%); }
        
        .bubble-me { 
          background: linear-gradient(180deg, #e3f2fd 0%, #bbdefb 100%); 
          border: 1px solid #90caf9; 
          border-radius: 18px 18px 4px 18px; 
          box-shadow: 0 1px 2px rgba(0,0,0,0.08); 
          color: #1e293b; 
        }
        .bubble-them { 
          background: linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%); 
          border: 1px solid #e2e8f0; 
          border-radius: 18px 18px 18px 4px; 
          box-shadow: 0 1px 2px rgba(0,0,0,0.08); 
          color: #1e293b; 
        }
        
        /* Nút Buzz cổ điển chuẩn Yahoo */
        .btn-classic-buzz { background: linear-gradient(180deg, #ffeba0 0%, #ffd000 49%, #ffb300 50%, #ffc000 100%); border: 1px solid #c28500; box-shadow: inset 0px 1px 1px rgba(255,255,255,0.8), 0px 1px 2px rgba(0,0,0,0.3); border-radius: 8px; color: #993300; font-weight: 900; text-shadow: 0 1px 0 rgba(255,255,255,0.5); transition: all 0.1s; }
        .btn-classic-buzz:active:not(:disabled) { transform: scale(0.96); box-shadow: inset 0 2px 4px rgba(0,0,0,0.4); background: #e6a200; }
        .btn-classic-buzz:disabled { filter: grayscale(100%); opacity: 0.5; cursor: not-allowed; }
        
        @keyframes extreme-shake { 0%, 100% { transform: translate(-50%, -50%) rotate(0); } 10%, 30%, 50%, 70%, 90% { transform: translate(calc(-50% - 15px), calc(-50% - 15px)) rotate(-5deg); } 20%, 40%, 60%, 80% { transform: translate(calc(-50% + 15px), calc(-50% + 15px)) rotate(5deg); } }
        .buzz-overlay { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: clamp(3rem, 10vw, 6rem); color: #ff0000; font-weight: 900; -webkit-text-stroke: 2px #ffff00; text-shadow: 0 10px 20px rgba(0,0,0,0.5); z-index: 100; pointer-events: none; animation: extreme-shake 0.5s both; }
        
        @keyframes buzz-shake-screen { 
          0%, 100% { transform: translateX(0); } 
          10%, 30%, 50%, 70%, 90% { transform: translateX(-8px) rotate(-1deg); } 
          20%, 40%, 60%, 80% { transform: translateX(8px) rotate(1deg); } 
        }
        .animate-buzz { animation: buzz-shake-screen 0.5s cubic-bezier(.36,.07,.19,.97) both; }
        
        /* Chống vuốt ngược Safari iOS */
        .overscroll-contain { overscroll-behavior-x: contain; }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}} />

      <div className="w-full h-full md:max-h-[850px] md:max-w-[1200px] md:rounded-2xl md:shadow-[0_20px_60px_rgba(0,0,0,0.6)] bg-white flex flex-col relative overflow-hidden md:border border-gray-600 overscroll-contain">

        {currentScreen === 'login' || currentScreen === 'register' ? (
          <LoginScreen
            onAuth={handleAuth} onSuccess={handleLoginSuccess}
            isRegister={currentScreen === 'register'} toggleMode={() => setCurrentScreen(currentScreen === 'login' ? 'register' : 'login')}
            isDbReady={isDbReady}
          />
        ) : (
          <div className="flex-1 flex w-full h-full relative overflow-hidden">
            {/* CỘT TRÁI: Dùng absolute cho mobile để không bị khựng khi vuốt */}
            <div className={`absolute md:relative top-0 left-0 w-full md:w-[340px] lg:w-[380px] h-full flex flex-col bg-[#f8fafc] shrink-0 md:border-r border-gray-300 transition-transform duration-300 ease-in-out z-10 ${activePartner ? '-translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
              <FriendListScreen
                myProfile={currentUserData} allUsers={allUsers} allMessages={allMessages} lastRead={lastRead} db={db}
                onLogout={handleLogout} onChat={(partner) => setActivePartner(partner)} activePartner={activePartner}
                soundEnabled={soundEnabled} toggleSound={() => setSoundEnabled(!soundEnabled)}
              />
            </div>

            {/* CỘT PHẢI: Khung Chat */}
            <div className={`absolute md:relative top-0 left-0 w-full md:flex-1 h-full flex flex-col bg-[#eef1f6] overflow-hidden transition-transform duration-300 ease-in-out z-20 ${!activePartner ? 'translate-x-full md:translate-x-0' : 'translate-x-0'}`}>
              {activePartner ? (
                <ChatScreen
                  myProfile={currentUserData} chatPartner={activePartner} allMessages={allMessages} db={db}
                  bgClass={BACKGROUNDS[bgIndex]} onCycleBg={() => setBgIndex((prev) => (prev + 1) % BACKGROUNDS.length)}
                  onBack={() => setActivePartner(null)} soundEnabled={soundEnabled}
                />
              ) : (
                <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#f1f5f9] text-gray-400">
                  <div className="w-32 h-32 opacity-20 mb-4 flex items-center justify-center filter grayscale">
                    <img src="yahoo_smile.png" alt="Yahoo" className="w-24 h-24 drop-shadow-lg" onError={(e) => { e.target.style.display = 'none' }} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-500">Welcome to Yahoo! Messenger</h2>
                  <p className="text-sm mt-2">Select a contact to start chatting</p>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </div>
  );
}

// --- LOGIN SCREEN ---
function LoginScreen({ onAuth, onSuccess, isRegister, toggleMode, isDbReady }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isInvisible, setIsInvisible] = useState(false);

  const handleSubmit = async () => {
    if (!isDbReady) return;
    const res = await onAuth(username.trim(), password, isRegister);
    if (res.success) onSuccess(res.user); else setErrorMsg(res.error);
  };

  return (
    <div className="flex-1 bg-login-exact flex flex-col items-center justify-center px-4 sm:px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] relative overflow-y-auto w-full h-full">
      <div className="absolute inset-0 bg-login-dots z-0"></div>

      <div className="z-10 flex flex-col items-center w-full max-w-[320px] sm:max-w-[360px] my-auto">
        <div className="relative w-full flex justify-center h-[110px] sm:h-[130px] mb-6 sm:mb-8">
          <div className="y-bubble border-[2px] border-[#a023a8] rounded-[50%] h-[75px] w-[120px] sm:h-[90px] sm:w-[140px] flex items-center justify-center absolute left-1/2 -translate-x-[65%] top-[15px] z-10 transform -rotate-[5deg]">
            <span className="text-white font-serif text-[55px] sm:text-[65px] font-bold drop-shadow-md pr-3 sm:pr-4 mt-[-5px]">Y</span>
          </div>
          <div className="text-[80px] sm:text-[95px] text-[#f25ceb] font-bold absolute left-1/2 translate-x-[5%] sm:translate-x-[15%] top-[-20px] sm:top-[-25px] z-10 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transform rotate-[10deg]">!</div>
          <img src="yahoo_smile.png" onError={(e) => { e.target.src = 'https://cdn-icons-png.flaticon.com/512/1791/1791330.png' }} className="w-[80px] h-[80px] sm:w-[90px] sm:h-[90px] absolute top-[40px] left-1/2 -translate-x-[20%] z-20 drop-shadow-xl" alt="Smiley" />
        </div>

        <div className="flex items-baseline gap-2 mb-6 sm:mb-8 z-10">
          <h1 className="text-silver font-serif text-[28px] sm:text-[32px] font-bold tracking-tight">YAHOO!</h1>
          <h2 className="text-silver font-sans text-[14px] sm:text-[16px] font-bold tracking-[0.1em]">MESSENGER</h2>
        </div>

        <div className="w-full flex flex-col gap-3.5 z-10">
          {errorMsg && <div className="text-white bg-red-600/90 px-3 py-2.5 rounded-lg font-bold text-[13px] text-center shadow-md animate-pulse">{errorMsg}</div>}

          <div className="input-group-bg rounded-xl border border-[#777] overflow-hidden flex flex-col shadow-lg">
            <div className="flex items-center px-4 py-3.5 border-b border-[#ccc]">
              <label className="text-[#555] font-bold text-[14px] sm:text-[15px] w-[85px] shrink-0 drop-shadow-[0_1px_0_white]">Yahoo! ID</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="example@yahoo.com" className="flex-1 min-w-0 bg-transparent text-[#222] placeholder-[#aaa] outline-none font-medium text-[15px] sm:text-[16px]" />
            </div>
            <div className="flex items-center px-4 py-3.5">
              <label className="text-[#555] font-bold text-[14px] sm:text-[15px] w-[85px] shrink-0 drop-shadow-[0_1px_0_white]">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Required" onKeyDown={e => e.key === 'Enter' && handleSubmit()} className="flex-1 min-w-0 bg-transparent text-[#222] placeholder-[#aaa] outline-none font-medium text-[15px] sm:text-[16px]" />
            </div>
          </div>

          <button onClick={handleSubmit} className="w-full py-3.5 rounded-xl glossy-purple text-white font-bold text-[17px] sm:text-[18px] tracking-wide mt-2 shadow-lg">
            {isRegister ? 'Sign Up' : 'Sign In'}
          </button>

          <button onClick={toggleMode} className="w-full py-3.5 rounded-xl glossy-gray text-[#444] font-bold text-[15px] sm:text-[16px] shadow-md">
            {isRegister ? 'Back to Sign In' : 'Get a new Yahoo! ID'}
          </button>

          {!isRegister && (
            <div className="flex items-center justify-center gap-2.5 mt-2 cursor-pointer" onClick={() => setIsInvisible(!isInvisible)}>
              <input type="checkbox" checked={isInvisible} readOnly className="ios-checkbox-pink" />
              <label className="text-[#444] font-bold text-[13px] sm:text-[14px] drop-shadow-[0_1px_1px_rgba(255,255,255,0.6)] cursor-pointer">Sign in as invisible</label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- FRIEND LIST SCREEN ---
function FriendListScreen({ myProfile, allUsers, allMessages, lastRead, db, onLogout, onChat, activePartner, soundEnabled, toggleSound }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchId, setSearchId] = useState('');

  // TÌM NGƯỜI LẠ (Đã từng nhắn tin nhưng không có trong danh bạ)
  const myFriendsIds = myProfile?.friends || [];
  const messagedUserIds = new Set();

  allMessages.forEach(m => {
    if (m.receiver === PUBLIC_ROOM.id) return;
    if (m.sender === myProfile?.username) messagedUserIds.add(m.receiver);
    if (m.receiver === myProfile?.username) messagedUserIds.add(m.sender);
  });

  const combinedPartnerIds = Array.from(new Set([...myFriendsIds, ...messagedUserIds])).filter(id => id !== myProfile?.username);

  const partnerList = combinedPartnerIds.map(id => {
    const existingUser = allUsers.find(u => u.username === id);
    const isStranger = !myFriendsIds.includes(id);
    return existingUser ? { ...existingUser, isStranger } : { id: id, username: id, isStranger, avatarUrl: null };
  });

  const displayList = [PUBLIC_ROOM, ...partnerList];

  const handleUpdateAvatar = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file && myProfile?.id) {
        const reader = new FileReader();
        reader.onload = async (ev) => await updateDoc(getUserDocRef(myProfile.id), { avatarUrl: ev.target.result });
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const handleAddFriend = async () => {
    const friendId = searchId.trim().toLowerCase();
    if (!friendId || friendId === myProfile.username.toLowerCase()) return alert("ID không hợp lệ!");
    const targetUser = allUsers.find(u => u.username.toLowerCase() === friendId);
    if (!targetUser) return alert("Không tìm thấy Yahoo ID này!");
    if (myFriendsIds.includes(targetUser.username)) return alert("Đã là bạn bè rồi!");

    await updateDoc(getUserDocRef(myProfile.id), { friends: arrayUnion(targetUser.username) });
    await updateDoc(getUserDocRef(targetUser.id), { friends: arrayUnion(myProfile.username) });
    setShowAddModal(false); setSearchId(''); alert("Đã thêm bạn thành công!");
  };

  const getUnreadCount = (partner) => {
    const partnerId = partner.isGroup ? PUBLIC_ROOM.id : partner.username;
    const lastSeen = lastRead[partnerId] || 0;
    return allMessages.filter(m => {
      if (m.timestamp <= lastSeen) return false;
      if (partner.isGroup) return m.receiver === PUBLIC_ROOM.id && m.sender !== myProfile?.username;
      return m.sender === partnerId && m.receiver === myProfile?.username;
    }).length;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#f8fafc] relative w-full">
      <div className="bg-yahoo-header px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] flex items-center justify-between z-20 shadow-md shrink-0">
        <button onClick={onLogout} className="text-white text-xs font-bold bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-lg border border-white/20 backdrop-blur-sm shadow-sm">Sign Out</button>
        <span className="text-white font-bold text-[17px] sm:text-[18px] drop-shadow-md tracking-wide">Contacts</span>

        <div className="flex items-center gap-2">
          {/* Nút bật tắt âm thanh */}
          <button onClick={toggleSound} className="text-white text-sm bg-white/10 hover:bg-white/20 transition-colors w-8 h-8 flex items-center justify-center rounded-full border border-white/20 backdrop-blur-sm shadow-sm" title={soundEnabled ? "Tắt âm/rung" : "Bật âm/rung"}>
            {soundEnabled ? '🔔' : '🔕'}
          </button>
          <button onClick={() => setShowAddModal(true)} className="text-white text-xl font-bold bg-white/10 hover:bg-white/20 transition-colors w-8 h-8 flex items-center justify-center rounded-full border border-white/20 backdrop-blur-sm shadow-sm">+</button>
        </div>
      </div>

      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 shadow-sm shrink-0 z-10">
        <div onClick={handleUpdateAvatar} className="relative group cursor-pointer shrink-0">
          {myProfile?.avatarUrl ? <img src={myProfile.avatarUrl} className="w-14 h-14 rounded-full object-cover border-2 border-purple-200 shadow-sm" /> :
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#ffeb3b] to-[#fbc02d] flex items-center justify-center border-2 border-yellow-400 shadow-sm"><span className="font-bold text-[#b71c1c] text-2xl">:)</span></div>}
          <div className="absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full bg-[#10b981] border-2 border-white shadow-sm"></div>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="font-bold text-[17px] text-gray-800 truncate">{myProfile?.username}</span>
          <span className="text-gray-500 text-[13px] font-medium truncate mt-0.5">Available (Status message...)</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="bg-[#f1f5f9] px-4 py-2 text-[12px] font-bold text-gray-500 sticky top-0 z-10 uppercase tracking-wider border-b border-gray-200">
          Friends & Messages ({displayList.length - 1})
        </div>
        <div className="divide-y divide-gray-100">
          {displayList.map(user => {
            const unread = getUnreadCount(user);
            const isSelected = activePartner?.username === user.username;
            return (
              <div key={user.id} onClick={() => onChat(user)} className={`px-4 py-3 flex items-center gap-3.5 transition-colors cursor-pointer group ${isSelected ? 'bg-purple-50' : 'bg-white hover:bg-gray-50'}`}>
                <div className="relative shrink-0">
                  {user.isGroup ? <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xl shadow-sm border border-purple-200">🌍</div> :
                    (user.avatarUrl ? <img src={user.avatarUrl} className="w-12 h-12 rounded-full object-cover border border-gray-200 shadow-sm group-hover:border-purple-300 transition-colors" /> : <div className="w-12 h-12 rounded-full bg-gradient-to-br from-yellow-300 to-yellow-500 flex items-center justify-center text-red-800 font-bold border border-yellow-400 shadow-sm text-lg">:)</div>)}
                  {!user.isGroup && <div className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-[#10b981] border-2 border-white"></div>}
                </div>

                <div className="flex-1 flex flex-col min-w-0 justify-center">
                  <div className="flex justify-between items-center mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`font-bold text-[15px] truncate ${user.isGroup ? 'text-purple-700' : 'text-gray-800'}`}>{user.username}</span>
                      {user.isStranger && <span className="bg-orange-100 text-orange-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-orange-200 shrink-0">Người lạ</span>}
                    </div>
                    {unread > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm animate-pulse ml-2">{unread}</span>}
                  </div>
                  <span className="text-[13px] text-gray-500 truncate">{user.isGroup ? 'Phòng chat công cộng' : 'I\'m using Yahoo!'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {showAddModal && (
        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center p-4 sm:p-6 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-[340px] shadow-2xl flex flex-col">
            <h3 className="font-bold text-xl mb-2 text-purple-800 text-center">Thêm Nick Yahoo</h3>
            <p className="text-[13px] text-gray-500 mb-5 text-center">Chỉ khi có nick nhau mới chat riêng được.</p>
            <input type="text" value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Nhập Yahoo! ID..." className="border border-gray-300 p-3 rounded-xl mb-5 bg-gray-50 text-[15px] outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 w-full transition-all" autoFocus />
            <div className="flex justify-between gap-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">Hủy</button>
              <button onClick={handleAddFriend} className="flex-1 py-2.5 font-bold text-white glossy-purple rounded-xl shadow-md">Thêm Bạn</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- CHAT SCREEN ---
function ChatScreen({ myProfile, chatPartner, allMessages, db, bgClass, onCycleBg, onBack, soundEnabled }) {
  const [inputText, setInputText] = useState('');
  const [isBuzzing, setIsBuzzing] = useState(false);
  const [canBuzz, setCanBuzz] = useState(true); // Giới hạn buzz
  const messagesEndRef = useRef(null);

  const chatMessages = allMessages.filter(m => {
    if (chatPartner.isGroup) return m.receiver === PUBLIC_ROOM.id;
    return (m.sender === myProfile?.username && m.receiver === chatPartner.username) || (m.sender === chatPartner.username && m.receiver === myProfile?.username);
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (lastMsg.text === 'BUZZ!!!' && lastMsg.sender !== myProfile?.username && !isBuzzing) triggerBuzz(false);
    }
  }, [chatMessages.length]);

  const triggerBuzz = async (isSender) => {
    setIsBuzzing(true);

    // Tôn trọng cài đặt âm thanh (vẫn rung hình ảnh nhưng không phát ra tiếng / rung thật)
    if (soundEnabled) {
      try { if (navigator.vibrate) navigator.vibrate(800); } catch (e) { }
      try {
        const audio = new Audio('buzz.mp3');
        audio.play().catch(e => { });
      } catch (e) { }
    }

    setTimeout(() => setIsBuzzing(false), 800);

    // Thời gian chờ 5s nếu bạn là người ấn BUZZ
    if (isSender) {
      setCanBuzz(false);
      setTimeout(() => setCanBuzz(true), 5000);
    }
  };

  const handleSend = async (text, imgUrl = null) => {
    if (!text.trim() && !imgUrl) return;
    const receiverId = chatPartner.isGroup ? PUBLIC_ROOM.id : chatPartner.username;
    await addDoc(getMessagesRef(), { sender: myProfile.username, receiver: receiverId, text, imageUrl: imgUrl, timestamp: Date.now() });
    setInputText('');
  };

  // Nén ảnh bằng Canvas để tránh vượt quá giới hạn 1MB của Firestore Base64
  const handleSendImage = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const scaleSize = MAX_WIDTH / img.width;
            canvas.width = MAX_WIDTH;
            canvas.height = img.height * scaleSize;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Nén xuống JPEG 0.7
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
            handleSend("", dataUrl);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`flex-1 flex flex-col h-full relative transition-colors duration-500 ${bgClass} ${isBuzzing ? 'animate-buzz' : ''} w-full`}>
      {isBuzzing && <div className="buzz-overlay">BUZZ!!!</div>}

      <div className="bg-yahoo-header px-3 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] flex items-center justify-between z-20 shrink-0 shadow-md">
        <button onClick={onBack} className="md:hidden text-white font-bold bg-white/10 active:bg-white/20 px-3 py-1.5 rounded-lg border border-white/20 flex items-center text-sm backdrop-blur-sm">
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
        <div className="hidden md:block w-[70px]"></div>

        <div className="flex flex-col items-center flex-1 min-w-0 px-2">
          <span className="text-white font-bold text-[17px] drop-shadow-md truncate w-full text-center">{chatPartner.username}</span>
          <span className="text-purple-200 text-[11px] font-medium mt-0.5">
            {chatPartner.isStranger ? "Người lạ" : "Online"}
          </span>
        </div>

        <button onClick={onCycleBg} className="text-white bg-white/10 active:bg-white/20 p-2 rounded-full border border-white/20 flex items-center justify-center transition-colors backdrop-blur-sm" title="Đổi hình nền">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
        </button>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 flex flex-col gap-3 z-10 scroll-smooth`}>
        <div className="text-center my-2">
          <span className="text-gray-500 text-[11px] font-bold bg-white/60 px-4 py-1.5 rounded-full border border-gray-200 shadow-sm backdrop-blur-sm">
            Conversation started
          </span>
        </div>

        {chatMessages.map((msg, index) => {
          const isMe = msg.sender === myProfile?.username;

          // Nếu là tin nhắn BUZZ, hiển thị dạng thông báo đặc biệt ở giữa
          if (msg.text === 'BUZZ!!!') {
            return (
              <div key={msg.id} className="w-full flex justify-center my-2">
                <span className="text-red-500 font-bold text-[12px] md:text-[13px] uppercase tracking-wide bg-red-50 px-3 py-1 rounded-full border border-red-200 shadow-sm">
                  {isMe ? "Bạn đã gửi BUZZ!!!" : `${msg.sender} vừa BUZZ!!!`}
                </span>
              </div>
            );
          }

          const isFirstInGroup = index === 0 || chatMessages[index - 1].sender !== msg.sender || chatMessages[index - 1].text === 'BUZZ!!!';

          return (
            <div key={msg.id} className={`flex w-full ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex flex-col max-w-[75%] md:max-w-[65%] ${isMe ? 'items-end' : 'items-start'}`}>

                {!isMe && chatPartner.isGroup && isFirstInGroup && (
                  <span className="text-[11px] text-purple-700 font-bold ml-1 mb-1">{msg.sender}</span>
                )}

                <div className="relative group flex flex-col w-full">
                  {msg.imageUrl ? (
                    <img src={msg.imageUrl} className={`w-full rounded-2xl shadow-sm border ${isMe ? 'border-blue-200 rounded-tr-sm' : 'border-gray-200 rounded-tl-sm'}`} />
                  ) : (
                    <div className={`px-3.5 py-2 text-[15px] leading-relaxed break-words ${isMe ? 'bubble-me' : 'bubble-them'}`}>
                      {msg.text}
                    </div>
                  )}
                  <span className={`text-[10px] text-gray-400 font-medium mt-1 ${isMe ? 'text-right pr-1' : 'text-left pl-1'}`}>
                    {formatTime(msg.timestamp)}
                  </span>
                </div>

              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} className="h-2" />
      </div>

      <div className="bg-white border-t border-gray-200 px-3 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] flex items-end gap-2.5 z-20 shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
        <div className="flex items-center gap-2 mb-1 shrink-0">
          <button
            disabled={!canBuzz}
            onClick={() => { handleSend("BUZZ!!!"); triggerBuzz(true); }}
            className="h-10 px-4 btn-classic-buzz flex items-center justify-center text-[14px] uppercase tracking-wider"
          >
            {canBuzz ? 'BUZZ' : '...'}
          </button>
          <button onClick={handleSendImage} className="h-10 w-10 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl flex items-center justify-center text-xl transition-colors border border-gray-200">📷</button>
        </div>

        <div className="flex-1 bg-gray-100 rounded-2xl border border-gray-200 flex items-center px-1 shadow-inner focus-within:bg-white focus-within:border-purple-300 transition-colors">
          <input
            type="text" value={inputText} onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend(inputText)}
            placeholder="Type a message..."
            className="w-full bg-transparent px-3 py-2.5 outline-none text-[15px] font-medium text-gray-800 placeholder-gray-400"
          />
          <button
            onClick={() => handleSend(inputText)}
            disabled={!inputText.trim()}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all mr-1 ${inputText.trim() ? 'bg-purple-600 text-white shadow-md hover:bg-purple-700' : 'bg-transparent text-purple-300'}`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5"><path d="M3.478 2.404a.75.75 0 00-.926.941l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.404z" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}