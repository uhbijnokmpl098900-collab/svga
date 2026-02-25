
import React from 'react';
import { db } from '../../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { AppSettings } from '../../types';

interface Props {
  settings: AppSettings;
}

export const FeatureConfig: React.FC<Props> = ({ settings }) => {
  const updateSettings = async (path: string, value: any) => {
    const keys = path.split('.');
    const newSettings = JSON.parse(JSON.stringify(settings));
    let current: any = newSettings;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    
    await setDoc(doc(db, "settings", "general"), newSettings, { merge: true });
  };

  return (
    <div className="space-y-8 font-arabic">
      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
        <h3 className="text-white font-black text-sm uppercase tracking-widest border-b border-white/5 pb-4">تسعير المزايا (Coins)</h3>
        
          <div className="grid grid-cols-2 gap-4">
             <div className="flex-1">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">معالجة SVGA</label>
                <input 
                  type="number" value={settings.costs.svgaProcess}
                  onChange={(e) => updateSettings('costs.svgaProcess', parseInt(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sky-400 font-black"
                />
             </div>
             <div className="flex-1">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">الضغط الجماعي</label>
                <input 
                  type="number" value={settings.costs.batchCompress}
                  onChange={(e) => updateSettings('costs.batchCompress', parseInt(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-emerald-400 font-black"
                />
             </div>
             <div className="flex-1">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">المحاولات المجانية</label>
                <input 
                  type="number" value={settings.defaultFreeAttempts || 1}
                  onChange={(e) => updateSettings('defaultFreeAttempts', parseInt(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-white font-black"
                />
             </div>
             <div className="flex-1">
                <label className="text-slate-500 text-[10px] font-black uppercase tracking-widest block mb-2">سعر الـ VIP ($)</label>
                <input 
                  type="number" value={settings.costs.vipPrice}
                  onChange={(e) => updateSettings('costs.vipPrice', parseInt(e.target.value))}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-amber-400 font-black"
                />
             </div>
          </div>
          
          <div className="p-4 bg-sky-500/5 border border-sky-500/10 rounded-2xl">
            <p className="text-[10px] text-sky-400 font-bold text-center">ملاحظة: أعضاء الـ VIP يستخدمون جميع المزايا مجاناً تلقائياً.</p>
          </div>
      </div>

      <div className="bg-white/[0.02] border border-white/5 rounded-[2.5rem] p-8 space-y-6">
        <h3 className="text-white font-black text-sm uppercase tracking-widest border-b border-white/5 pb-4">إعدادات الانضمام</h3>
        <div className="flex items-center justify-between">
           <div>
              <p className="text-white font-bold text-xs mb-1">فتح تسجيل الحسابات</p>
              <p className="text-slate-500 text-[9px] font-black uppercase">يسمح للمصممين الجدد بطلب انضمام</p>
           </div>
           <button 
             onClick={() => updateSettings('isRegistrationOpen', !settings.isRegistrationOpen)}
             className={`px-6 py-3 rounded-xl text-[9px] font-black uppercase transition-all ${settings.isRegistrationOpen ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-red-500/20 text-red-500 border border-red-500/20'}`}
           >
             {settings.isRegistrationOpen ? 'مفتوح' : 'مغلق'}
           </button>
        </div>
      </div>
    </div>
  );
};
