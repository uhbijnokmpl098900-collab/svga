
import React from 'react';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
}

export const BrandingSettings: React.FC<Props> = ({ settings }) => {
  const updateSettings = async (field: keyof AppSettings, value: any) => {
    await setDoc(doc(db, "settings", "general"), { [field]: value }, { merge: true });
  };

  return (
    <div className="space-y-8 font-arabic">
      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
        <h3 className="text-white font-black text-sm uppercase tracking-widest border-b border-white/5 pb-4">هوية المنصة (Branding)</h3>
        
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">اسم الموقع</label>
            <input 
              type="text" value={settings.appName}
              onChange={(e) => updateSettings('appName', e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-black tracking-tighter"
              placeholder="مثال: SVGA GENIUS"
            />
          </div>

          <div className="space-y-2">
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">رابط لوغو التطبيق (Image URL)</label>
            <input 
              type="text" value={settings.logoUrl}
              onChange={(e) => updateSettings('logoUrl', e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-slate-400 text-xs font-mono"
              placeholder="https://example.com/logo.png"
            />
          </div>

          <div className="space-y-2">
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">رابط خلفية الموقع (Site Background)</label>
            <input 
              type="text" value={settings.backgroundUrl}
              onChange={(e) => updateSettings('backgroundUrl', e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-slate-400 text-xs font-mono"
              placeholder="https://example.com/background.jpg"
            />
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-1">يفضل استخدام رابط مباشر لصورة عالية الجودة</p>
          </div>

          <div className="space-y-2">
            <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block">رقم الواتساب (للتواصل مع الإدارة)</label>
            <input 
              type="text" value={settings.whatsappNumber || ''}
              onChange={(e) => updateSettings('whatsappNumber', e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl p-4 text-white font-black tracking-tighter"
              placeholder="مثال: 966500000000"
            />
            <p className="text-[8px] text-slate-600 uppercase tracking-widest mt-1">اكتب الرقم مع كود الدولة بدون علامة +</p>
          </div>

          <div className="flex items-center justify-center p-10 bg-slate-950 rounded-[2rem] border border-white/5 relative overflow-hidden group">
             <div className="absolute inset-0 bg-sky-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
             {settings.logoUrl ? (
               <img src={settings.logoUrl} alt="Logo Preview" className="h-20 w-auto object-contain relative z-10" />
             ) : (
               <div className="w-20 h-20 bg-gradient-to-br from-sky-400 to-indigo-600 rounded-3xl flex items-center justify-center relative z-10">
                 <span className="text-white text-4xl font-black italic">S</span>
               </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};
