
import React, { useState } from 'react';
import { db } from '../../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { UserRecord } from '../../types';

interface Props {
  users: UserRecord[];
}

export const UserManagement: React.FC<Props> = ({ users }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const handleUpdate = async (userId: string, data: Partial<UserRecord>) => {
    try {
      await updateDoc(doc(db, "users", userId), data);
    } catch (e) { alert("حدث خطأ في التحديث"); }
  };

  const handleRevokeSubscription = async (userId: string) => {
    if (confirm("هل تريد سحب الاشتراك من هذا المستخدم؟ سيعود رصيده 0 وسيتم إلغاء ميزات VIP.")) {
      await updateDoc(doc(db, "users", userId), {
        isVIP: false,
        subscriptionExpiry: null,
        subscriptionType: 'none',
        coins: 0
      });
    }
  };

  const handleDelete = async (userId: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الحساب نهائياً؟")) {
      await deleteDoc(doc(db, "users", userId));
    }
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 font-arabic" dir="rtl">
      <div className="relative">
        <input 
          type="text" 
          placeholder="ابحث عن عضو بالاسم..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 px-6 text-sm text-white focus:outline-none focus:border-sky-500/50 text-right"
        />
      </div>

      <div className="space-y-4">
        {filteredUsers.map(user => {
          const isSubscribed = user.subscriptionExpiry?.toDate ? (user.subscriptionExpiry.toDate() > new Date()) : false;
          return (
            <div key={user.id} className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 flex flex-col gap-4 group hover:bg-white/[0.04] transition-all">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 bg-slate-800 rounded-2xl flex items-center justify-center text-sky-400 font-black border border-white/10 shrink-0">
                    {user.name[0].toUpperCase()}
                  </div>
                  <div className="text-right">
                    <h4 className="text-white font-black text-sm flex items-center gap-2">
                      {user.name}
                      {user.isVIP && <span className="bg-amber-500/10 text-amber-500 text-[8px] px-2 py-0.5 rounded-full border border-amber-500/20">VIP GOLD</span>}
                    </h4>
                    <p className="text-slate-500 text-[10px] font-mono">Pass: {user.password}</p>
                    {isSubscribed && (
                       <p className="text-[9px] text-emerald-500 font-black mt-1">مشترك حتى: {user.subscriptionExpiry.toDate().toLocaleDateString('ar-EG')}</p>
                    )}
                  </div>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-emerald-500 font-black text-xs">{user.coins || 0} $</div>
                  <div className={`text-[8px] font-black uppercase tracking-widest ${user.status === 'active' ? 'text-sky-500' : 'text-red-500'}`}>
                    {user.status === 'active' ? 'نشط الآن' : 'محظور'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 border-t border-white/5">
                <button 
                  onClick={() => handleUpdate(user.id, { isVIP: !user.isVIP })}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${user.isVIP ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-white/5 text-slate-400 border border-white/5 hover:bg-amber-500/20'}`}
                >
                  {user.isVIP ? 'إلغاء VIP' : 'ترقية VIP'}
                </button>
                
                <button 
                  onClick={() => handleRevokeSubscription(user.id)}
                  className="py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                >
                  حذف الاشتراك
                </button>

                <button 
                  onClick={() => handleUpdate(user.id, { status: user.status === 'active' ? 'banned' : 'active' })}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${user.status === 'active' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}
                >
                  {user.status === 'active' ? 'حظر الحساب' : 'فك الحظر'}
                </button>

                <button 
                  onClick={() => handleDelete(user.id)}
                  className="py-2 bg-white/5 text-slate-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  حذف نهائي
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
