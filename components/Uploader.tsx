
import React, { useState } from 'react';

interface UploaderProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
  onConverterOpen?: () => void;
}

export const Uploader: React.FC<UploaderProps> = ({ onUpload, isUploading, onConverterOpen }) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div 
      className={`relative max-w-5xl mx-auto h-[450px] rounded-[4rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center gap-10 p-12 cursor-pointer shadow-3xl overflow-hidden
        ${isDragOver ? 'border-sky-500 bg-sky-500/10 scale-[1.01] shadow-glow-sky' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/60'}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input 
        id="file-input"
        type="file" 
        accept=".svga,.mp4"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="absolute -top-24 -left-24 w-64 h-64 bg-sky-500/5 blur-[100px] rounded-full"></div>
      <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-indigo-600/5 blur-[100px] rounded-full"></div>
      
      <div className="relative group">
         <div className="absolute inset-0 bg-sky-500 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
         <div className="relative w-28 h-28 bg-slate-950 rounded-3xl flex items-center justify-center text-sky-400 border border-white/10 shadow-2xl transition-transform duration-500 group-hover:scale-110">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
         </div>
      </div>
      
      <div className="text-center relative z-10">
        <h3 className="text-4xl font-black text-white mb-3 tracking-tighter uppercase">Quantum SVGA Processor</h3>
        <p className="text-slate-500 font-black uppercase tracking-[0.4em] text-[10px]">اضغط أو اسحب الملف للدخول إلى مساحة العمل</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 relative z-10">
        <div className="flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/10">
           <div className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse"></div>
           <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">SVGA 1.0 / 2.0</span>
        </div>
        <button 
          onClick={(e) => { e.stopPropagation(); onConverterOpen?.(); }}
          className="flex items-center gap-3 px-6 py-3 bg-sky-500/10 hover:bg-sky-500/20 rounded-2xl border border-sky-500/20 transition-all group/btn"
        >
           <span className="text-xl group-hover/btn:scale-110 transition-transform">⚡</span>
           <span className="text-[10px] text-sky-400 font-black uppercase tracking-widest">محول الفيديو المباشر</span>
        </button>
      </div>
      
      <style>{`
        .shadow-3xl { box-shadow: 0 50px 100px -30px rgba(0, 0, 0, 0.8); }
        .shadow-glow-sky { box-shadow: 0 0 50px rgba(14, 165, 233, 0.2); }
      `}</style>
    </div>
  );
};
