
import React, { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, collection, query, where, getDocs, updateDoc, Timestamp } from 'firebase/firestore';
import { AppSettings, UserRecord, LicenseKey } from '../types';
import { useLanguage } from '../contexts/LanguageContext';

interface HeaderProps {
  onLogoClick: () => void;
  isAdmin?: boolean;
  currentUser?: UserRecord | null;
  onAdminToggle?: () => void;
  onLogout?: () => void;
  isAdminOpen?: boolean;
  onBatchOpen?: () => void;
  onStoreOpen?: () => void;
  onConverterOpen?: () => void;
  currentTab?: 'svga' | 'batch' | 'store' | 'converter';
}

export const Header: React.FC<HeaderProps> = ({ 
  onLogoClick, isAdmin, currentUser, onAdminToggle, onLogout, isAdminOpen, onBatchOpen, onStoreOpen, onConverterOpen, currentTab 
}) => {
  const { language, setLanguage } = useLanguage();
  const [settings, setSettings] = useState<AppSettings>({
    appName: 'SVGA GENIUS',
    logoUrl: '',
    backgroundUrl: '',
    isRegistrationOpen: true,
    costs: { svgaProcess: 5, batchCompress: 20, vipPrice: 1000 }
  });
  const [showRedeem, setShowRedeem] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [redeemStatus, setRedeemStatus] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "settings", "general"), (snap) => {
      if (snap.exists()) setSettings(snap.data() as AppSettings);
    });
    return () => unsub();
  }, []);

  const handleRedeem = async () => {
    if (!keyInput || !currentUser) return;
    setRedeemStatus("جاري التحقق...");
    try {
      const q = query(collection(db, "license_keys"), where("key", "==", keyInput.trim().toUpperCase()));
      const snap = await getDocs(q);
      
      if (snap.empty) {
        setRedeemStatus("كود غير صحيح!");
        return;
      }

      const keyDoc = snap.docs[0];
      const keyData = keyDoc.data() as LicenseKey;

      if (keyData.isUsed) {
        setRedeemStatus("هذا الكود مستخدم بالفعل!");
        return;
      }

      const expiryDate = keyData.expiresAt?.toDate ? keyData.expiresAt.toDate() : new Date(keyData.expiresAt);
      if (expiryDate < new Date()) {
        setRedeemStatus("انتهت صلاحية هذا الكود (24 ساعة)!");
        return;
      }

      // تفعيل الاشتراك
      const now = new Date();
      let subExpiry = new Date();
      if (keyData.duration === 'monthly') subExpiry.setMonth(now.getMonth() + 1);
      else if (keyData.duration === 'quarterly') subExpiry.setMonth(now.getMonth() + 3);
      else if (keyData.duration === 'yearly') subExpiry.setFullYear(now.getFullYear() + 1);

      await updateDoc(doc(db, "users", currentUser.id), {
        isVIP: true,
        subscriptionExpiry: Timestamp.fromDate(subExpiry),
        subscriptionType: keyData.duration,
        coins: 999999, // تفعيل كل المزايا
        activatedKey: keyData.key
      });

      await updateDoc(keyDoc.ref, {
        isUsed: true,
        usedBy: currentUser.name,
        usedAt: Timestamp.now()
      });

      setRedeemStatus("تم التفعيل بنجاح! استمتع بكل المزايا.");
      setTimeout(() => { setShowRedeem(false); setRedeemStatus(null); setKeyInput(''); }, 2000);
    } catch (e) {
      setRedeemStatus("حدث خطأ أثناء التفعيل.");
    }
  };

  const getSubStatus = () => {
    if (!currentUser) return null;
    if (currentUser.role === 'admin') return "ADMIN ACCESS";
    
    if (currentUser.isVIP) {
        if (!currentUser.subscriptionExpiry) return "VIP FOREVER";
        let expiryDate: Date | null = null;
        if (typeof (currentUser.subscriptionExpiry as any).toDate === 'function') {
            expiryDate = (currentUser.subscriptionExpiry as any).toDate();
        } else if (currentUser.subscriptionExpiry instanceof Date) {
            expiryDate = currentUser.subscriptionExpiry;
        }
        if (expiryDate && expiryDate < new Date()) return "اشتراك منتهي";
        return `VIP (${expiryDate?.toLocaleDateString('ar-EG')})`;
    }

    if (currentUser.freeAttempts > 0) {
        return `تجربة مجانية: ${currentUser.freeAttempts} محاولات`;
    }
    
    return "يرجى تفعيل الاشتراك";
  };

  const isSubscriptionActive = () => {
      if (!currentUser) return false;
      if (currentUser.role === 'admin') return true;
      let expiryDate: Date | null = null;
      if (currentUser.subscriptionExpiry) {
        if (typeof (currentUser.subscriptionExpiry as any).toDate === 'function') {
            expiryDate = (currentUser.subscriptionExpiry as any).toDate();
        } else if (currentUser.subscriptionExpiry instanceof Date) {
            expiryDate = currentUser.subscriptionExpiry;
        } else if (typeof currentUser.subscriptionExpiry === 'string') {
            expiryDate = new Date(currentUser.subscriptionExpiry);
        } else if ((currentUser.subscriptionExpiry as any).seconds) {
            expiryDate = new Date((currentUser.subscriptionExpiry as any).seconds * 1000);
        }
      }
      return expiryDate ? expiryDate > new Date() : false;
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-[100] border-b border-white/5 backdrop-blur-2xl bg-slate-950/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-2">
        <div 
          className="flex items-center gap-3 cursor-pointer group shrink-0"
          onClick={onLogoClick}
        >
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="Logo" className="h-9 w-auto object-contain transition-transform group-hover:scale-110" />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-black text-lg italic">S</span>
            </div>
          )}
          <div className="flex flex-col hidden xs:flex">
            <span className="text-base sm:text-lg font-black text-white tracking-tighter leading-none">{settings.appName}</span>
            <span className="text-[7px] font-black text-slate-500 uppercase tracking-[0.4em] mt-0.5">Quantum Suite</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4 overflow-x-hidden">
          {currentUser && (
            <div className="hidden md:flex items-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl px-4 py-2">
               <div className="text-right">
                  <div className={`font-black text-[9px] uppercase leading-none ${isSubscriptionActive() ? 'text-emerald-400' : 'text-red-400'}`}>
                    {getSubStatus()}
                  </div>
                  <div className="text-[7px] font-bold text-slate-500 uppercase tracking-widest mt-1">حالة العضوية</div>
               </div>
               {(currentUser.isVIP || currentUser.role === 'admin') && (
                 <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center shadow-lg shadow-amber-500/20">
                    <span className="text-white text-[10px] font-black">{currentUser.role === 'admin' ? 'ADM' : 'VIP'}</span>
                 </div>
               )}
            </div>
          )}

          <nav className="flex items-center gap-2 border-r border-white/5 pr-4 mr-2">
            <button 
              onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
              className="px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all text-slate-500 hover:text-white border border-transparent hover:border-white/10"
            >
              {language === 'ar' ? 'EN' : 'AR'}
            </button>
            <button onClick={onLogoClick} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${currentTab === 'svga' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-500 hover:text-white'}`}>SVGA</button>
            <button onClick={onConverterOpen} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${currentTab === 'converter' ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'text-slate-500 hover:text-white'}`}>Converter</button>
            <button onClick={onBatchOpen} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${currentTab === 'batch' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'text-slate-500 hover:text-white'}`}>Compressor</button>
            <button onClick={onStoreOpen} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${currentTab === 'store' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'text-slate-500 hover:text-white'}`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>
            </button>
            {!isAdmin && currentUser && !currentUser.isVIP && (
               <button onClick={() => setShowRedeem(true)} className="px-4 py-2 bg-amber-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-glow-amber transition-all animate-pulse">تفعيل كود</button>
            )}
          </nav>

          <nav className="flex items-center gap-2">
            {isAdmin && (
              <button 
                onClick={onAdminToggle}
                className={`px-3 sm:px-5 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${isAdminOpen ? 'bg-amber-500 text-white border-amber-400' : 'bg-amber-500/10 text-amber-500 border-amber-500/20'}`}
              >لوحة التحكم</button>
            )}
            {currentUser && (
              <button onClick={onLogout} className="p-2 sm:px-4 sm:py-2 bg-white/5 text-slate-400 hover:text-red-400 rounded-xl text-[9px] font-black uppercase tracking-widest border border-white/10 transition-all">خروج</button>
            )}
          </nav>
        </div>
      </div>

      {showRedeem && (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4">
           <div className="bg-slate-900 border border-white/10 p-8 rounded-[3rem] w-full max-w-md shadow-2xl animate-in zoom-in duration-300">
              <h3 className="text-white font-black text-xl mb-6 text-center">تفعيل اشتراك Quantum</h3>
              <input 
                type="text" value={keyInput} onChange={(e)=>setKeyInput(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="w-full bg-black/40 border border-white/10 rounded-2xl py-5 px-6 text-white text-center font-mono tracking-[0.2em] mb-4 outline-none focus:border-sky-500"
              />
              {redeemStatus && <p className={`text-[10px] font-black text-center mb-4 ${redeemStatus.includes('بنجاح') ? 'text-emerald-500' : 'text-red-500'}`}>{redeemStatus}</p>}
              <div className="flex gap-2">
                 <button onClick={handleRedeem} className="flex-1 py-4 bg-sky-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-glow-sky">تفعيل الآن</button>
                 <button onClick={()=>setShowRedeem(false)} className="px-6 py-4 bg-white/5 text-slate-400 rounded-2xl font-black text-[10px] uppercase">إلغاء</button>
              </div>
           </div>
        </div>
      )}

      <style>{`
        .shadow-glow-amber { box-shadow: 0 0 15px rgba(245, 158, 11, 0.4); }
        .shadow-glow-sky { box-shadow: 0 0 20px rgba(14, 165, 233, 0.4); }
      `}</style>
    </header>
  );
};
