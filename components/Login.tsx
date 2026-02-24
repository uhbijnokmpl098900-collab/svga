
import React, { useState } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { UserRecord, AppSettings, SubscriptionType } from '../types';

const MASTER_ADMIN_NAME = "150";
const MASTER_ADMIN_PASSWORD = "150";

interface LoginProps {
  onLogin: (user: UserRecord) => void;
  settings: AppSettings | null;
  onCancel?: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin, settings, onCancel }) => {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSignUp, setIsSignUp] = useState(false);

  const fetchAndCheckUser = async (username: string) : Promise<UserRecord | null> => {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("name", "==", username), limit(1));
    const querySnapshot = await getDocs(q);

    const isMaster = username === MASTER_ADMIN_NAME;

    if (querySnapshot.empty) {
      // مستخدم جديد
      const newUser = {
        name: username,
        password: password, 
        role: (isMaster ? 'admin' : 'user') as 'admin' | 'user',
        isApproved: true,
        status: 'active' as 'active' | 'banned' | 'pending',
        isVIP: false,
        coins: isMaster ? 999999 : 0, 
        freeAttempts: 5, // 5 محاولات مجانية لكل مستخدم جديد
        subscriptionExpiry: null,
        subscriptionType: 'none' as SubscriptionType,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      };
      
      const docRef = await addDoc(usersRef, newUser);
      return { id: docRef.id, ...newUser } as UserRecord;
    } else {
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as UserRecord;
      
      await updateDoc(userDoc.ref, { lastLogin: serverTimestamp() });
      return { id: userDoc.id, ...userData };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !password) return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (name === MASTER_ADMIN_NAME && password === MASTER_ADMIN_PASSWORD) {
         const user = await fetchAndCheckUser(name);
         if (user) onLogin(user);
         return;
      }

      const usersRef = collection(db, "users");
      const q = query(usersRef, where("name", "==", name), limit(1));
      const querySnapshot = await getDocs(q);

      if (isSignUp) {
        if (!querySnapshot.empty) {
          setError("هذا الاسم مستخدم بالفعل. يرجى اختيار اسم آخر أو تسجيل الدخول.");
          setIsLoading(false);
        } else {
          const user = await fetchAndCheckUser(name);
          if (user) onLogin(user);
        }
      } else {
        if (querySnapshot.empty) {
          setError("عذراً، هذا الحساب غير موجود.");
        } else {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data() as UserRecord;
          if (userData.password !== password) {
            setError("كلمة المرور غير صحيحة.");
          } else if (userData.status === 'banned') {
            setError("هذا الحساب محظور حالياً.");
          } else {
            onLogin({ id: userDoc.id, ...userData });
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError("حدث خطأ في الاتصال بالسيرفر.");
    } finally {
      setIsLoading(false);
    }
  };

  const dynamicBg = settings?.backgroundUrl ? {
    backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.7), rgba(2, 6, 23, 0.8)), url(${settings.backgroundUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center'
  } : {
    backgroundColor: '#020617'
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 font-arabic select-none" style={dynamicBg}>
      <div className="w-full max-w-[480px] animate-in fade-in zoom-in duration-1000">
        <div className="bg-slate-900/60 backdrop-blur-3xl rounded-[3rem] border border-white/10 shadow-3xl p-8 sm:p-12 relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-48 h-48 bg-sky-500/20 blur-[80px] rounded-full"></div>
          <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-600/20 blur-[80px] rounded-full"></div>
          
          <div className="relative z-10">
            <div className="flex flex-col items-center mb-10">
              <div className="mb-6 transform hover:scale-110 transition-transform duration-500">
                {settings?.logoUrl ? (
                  <img src={settings.logoUrl} alt="Logo" className="h-20 w-auto drop-shadow-glow" />
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-3xl flex items-center justify-center shadow-glow-sky">
                    <span className="text-white font-black text-4xl italic">S</span>
                  </div>
                )}
              </div>
              <h1 className="text-3xl font-black text-white tracking-tighter text-center uppercase">
                {settings?.appName || 'SVGA GENIUS'}
              </h1>
              <div className="mt-2 flex items-center gap-2">
                <span className="w-8 h-[1px] bg-sky-500/30"></span>
                <span className="text-sky-400 text-[9px] font-black uppercase tracking-[0.4em]">Designer Suite</span>
                <span className="w-8 h-[1px] bg-sky-500/30"></span>
              </div>
            </div>

            <div className="mb-6 p-4 bg-sky-500/10 border border-sky-500/20 rounded-2xl flex items-start gap-3" dir="rtl">
               <svg className="w-5 h-5 text-sky-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
               <p className="text-sky-100 text-[10px] font-bold leading-relaxed text-right">
                 عزيزي المستخدم، قم بإنشاء حساب باستخدام اسم مستخدم وكلمة مرور لضمان سهولة الدخول لاحقاً.
               </p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-[11px] font-bold text-center animate-shake">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">اسم المستخدم</label>
                <input 
                  type="text" required value={name} onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 px-6 text-white text-sm focus:border-sky-500/40 outline-none transition-all text-right"
                  placeholder="Username"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2">كلمة المرور</label>
                <input 
                  type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/50 border border-white/5 rounded-2xl py-4 px-6 text-white text-sm outline-none focus:border-sky-500/40 transition-all text-left font-sans"
                  placeholder="••••••••"
                />
              </div>

              <button 
                type="submit" disabled={isLoading}
                className="w-full py-5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white font-black rounded-2xl transition-all shadow-glow-sky-sm hover:shadow-glow-sky text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (isSignUp ? 'إنشاء حساب جديد' : 'دخول المنصة')}
              </button>
              
              {onCancel && (
                <button 
                  type="button" 
                  onClick={onCancel}
                  className="w-full py-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-black rounded-2xl transition-all border border-white/5 text-[10px] uppercase tracking-widest"
                >
                  إلغاء والعودة للرئيسية
                </button>
              )}
            </form>

            <div className="mt-8 flex flex-col gap-4 text-center">
              <button 
                onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                className="text-slate-400 hover:text-white text-[11px] font-black uppercase tracking-widest transition-colors"
              >
                {isSignUp ? 'لديك حساب بالفعل؟ سجل دخولك' : 'ليس لديك حساب؟ أنشئ حساباً الآن'}
              </button>
            </div>
          </div>
        </div>
        
        <p className="mt-8 text-center text-[9px] text-slate-600 font-black uppercase tracking-[0.5em] opacity-50">
          Professional Animation Environment • v3.0
        </p>
      </div>

      <style>{`
        .shadow-3xl { box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.8); }
        .shadow-glow-sky { box-shadow: 0 0 30px rgba(14, 165, 233, 0.4); }
        .shadow-glow-sky-sm { box-shadow: 0 0 15px rgba(14, 165, 233, 0.2); }
        .drop-shadow-glow { filter: drop-shadow(0 0 10px rgba(14, 165, 233, 0.5)); }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
      `}</style>
    </div>
  );
};
