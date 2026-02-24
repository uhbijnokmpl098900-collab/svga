
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Uploader } from './components/Uploader';
import { Workspace } from './components/Workspace';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { BatchCompressor } from './components/BatchCompressor';
import { VideoConverter } from './components/VideoConverter';
import { Store } from './components/Store';
import { AppState, FileMetadata, MaterialAsset, UserRecord, AppSettings } from './types';
import { db } from './firebase';
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from 'firebase/firestore';

declare var SVGA: any;

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [fileMetadata, setFileMetadata] = useState<FileMetadata | null>(null);
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  useEffect(() => {
    const unsubSettings = onSnapshot(doc(db, "settings", "general"), (snap) => {
      if (snap.exists()) setSettings(snap.data() as AppSettings);
    });

    const savedUser = localStorage.getItem('svga_user');
    if (savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        const unsubUser = onSnapshot(doc(db, "users", parsed.id), (snap) => {
          if (snap.exists()) {
            const userData = { id: snap.id, ...snap.data() } as UserRecord;
            if (userData.status !== 'banned') {
              setCurrentUser(userData);
              // State is already IDLE
            } else {
              handleLogout();
            }
          }
        });
        return () => { unsubSettings(); unsubUser(); };
      } catch (e) {
        localStorage.removeItem('svga_user');
      }
    }
    return () => unsubSettings();
  }, []);

  const handleLogin = (user: UserRecord) => {
    setCurrentUser(user);
    localStorage.setItem('svga_user', JSON.stringify(user));
    setState(AppState.IDLE);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('svga_user');
    setShowAdminPanel(false);
    setState(AppState.IDLE);
  };

  const logFileProcess = async (file: File, videoItem: any) => {
    if (!currentUser) return;
    try {
      await addDoc(collection(db, "process_logs"), {
        fileName: file.name,
        userName: currentUser.name,
        timestamp: serverTimestamp(),
        fileSize: file.size,
        dimensions: `${videoItem.videoSize?.width}x${videoItem.videoSize?.height}`,
        frames: videoItem.frames || 0
      });
    } catch (e) {
      console.error("Failed to log process:", e);
    }
  };

  const handleFileUpload = useCallback(async (file: File) => {
    if (!currentUser) {
      setState(AppState.LOGIN);
      return;
    }

    const fileUrl = URL.createObjectURL(file);

    if (file.name.toLowerCase().endsWith('.mp4')) {
        try {
           const video = document.createElement('video');
           video.src = fileUrl;
           video.muted = true;
           video.playsInline = true;
           await video.play();
           video.pause();
           
           const duration = video.duration;
           
           if (duration > 10) {
              alert("عذراً، يجب أن يكون الفيديو أقل من 10 ثوانٍ لتجنب انهيار المتصفح.");
              URL.revokeObjectURL(fileUrl);
              return;
           }

           const vw = video.videoWidth;
           const vh = video.videoHeight;
           // Increase FPS to 30 for smoother playback and better quality
           const fps = 30; 
           const totalFrames = Math.floor(duration * fps);

           const canvas = document.createElement('canvas');
           canvas.width = vw;
           canvas.height = vh;
           const ctx = canvas.getContext('2d');
           
           const newLayerImages: Record<string, string> = {};
           const newSprites: any[] = [];
           
           // REMOVED DOWNSCALING LOGIC TO PRESERVE ORIGINAL DIMENSIONS
           // const maxDim = 750;
           // let scale = 1;
           // if (vw > maxDim || vh > maxDim) {
           //     scale = Math.min(maxDim / vw, maxDim / vh);
           //     canvas.width = vw * scale;
           //     canvas.height = vh * scale;
           // }

           for (let i = 0; i < totalFrames; i++) {
               const time = i / fps;
               video.currentTime = time;
               await new Promise(r => {
                   const onSeek = () => {
                       video.removeEventListener('seeked', onSeek);
                       r(null);
                   };
                   video.addEventListener('seeked', onSeek);
               });
               
               if (ctx) {
                   ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                   const quality = 0.8;
                   const dataUrl = canvas.toDataURL('image/png', quality);
                   const key = `v_frame_${i}`;
                   newLayerImages[key] = dataUrl;
                   
                   const frames = [];
                   for (let f = 0; f < totalFrames; f++) {
                       frames.push({
                           alpha: f === i ? 1.0 : 0.0,
                           layout: { x: 0, y: 0, width: canvas.width, height: canvas.height },
                           transform: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }
                       });
                   }
                   
                   newSprites.push({
                       imageKey: key,
                       frames: frames,
                       matteKey: ""
                   });
               }
           }

           const meta: FileMetadata = {
               name: file.name, size: file.size, type: 'MP4',
               dimensions: { width: canvas.width, height: canvas.height },
               fps: fps, frames: totalFrames, assets: [], 
               videoItem: {
                   version: "2.0",
                   videoSize: { width: canvas.width, height: canvas.height },
                   FPS: fps,
                   frames: totalFrames,
                   images: newLayerImages,
                   sprites: newSprites,
                   audios: [] 
               },
               fileUrl: fileUrl 
           };
           
           setFileMetadata(meta);
           setState(AppState.PROCESSING);
           logFileProcess(file, meta.videoItem);

        } catch (e) {
            console.error(e);
            alert("فشل معالجة ملف MP4");
            URL.revokeObjectURL(fileUrl);
        }
        return;
    }

    if (!file || !file.name.toLowerCase().endsWith('.svga')) return;
    
    try {
      const parser = new SVGA.Parser();
      parser.load(fileUrl, (videoItem: any) => {
        const meta: FileMetadata = {
          name: file.name, size: file.size, type: 'SVGA',
          dimensions: { width: videoItem.videoSize?.width || 0, height: videoItem.videoSize?.height || 0 },
          fps: videoItem.FPS || 30, frames: videoItem.frames || 0, assets: [], videoItem,
          fileUrl: fileUrl 
        };
        
        setFileMetadata(meta);
        setState(AppState.PROCESSING);
        logFileProcess(file, videoItem);
      }, (err: any) => {
        console.error("SVGA Load Error:", err);
        alert("فشل في قراءة ملف SVGA.");
        URL.revokeObjectURL(fileUrl);
      });
    } catch (err) {
      setState(AppState.IDLE);
    }
  }, [currentUser, settings]);

  const handleReset = useCallback(() => {
    if (fileMetadata?.fileUrl) {
      URL.revokeObjectURL(fileMetadata.fileUrl);
    }
    setState(AppState.IDLE);
    setFileMetadata(null);
    setShowAdminPanel(false);
  }, [fileMetadata]);

  const dynamicBgStyle: React.CSSProperties = settings?.backgroundUrl ? {
    backgroundImage: `linear-gradient(rgba(2, 6, 23, 0.8), rgba(2, 6, 23, 0.8)), url(${settings.backgroundUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundAttachment: 'fixed'
  } : {};

  if (state === AppState.LOGIN) {
    return <Login onLogin={handleLogin} settings={settings} onCancel={() => setState(AppState.IDLE)} />;
  }

  return (
    <div className="min-h-screen text-slate-200 overflow-x-hidden relative" style={dynamicBgStyle}>
      {!settings?.backgroundUrl && <div className="fixed inset-0 bg-[#020617] -z-10" />}
      
      <Header 
        onLogoClick={handleReset} 
        isAdmin={currentUser?.role === 'admin'} 
        currentUser={currentUser}
        onAdminToggle={() => setShowAdminPanel(!showAdminPanel)}
        onLogout={handleLogout}
        isAdminOpen={showAdminPanel}
        onBatchOpen={() => {
          if (!currentUser) {
            setState(AppState.LOGIN);
            return;
          }
          setState(AppState.BATCH_COMPRESSOR);
        }}
        onStoreOpen={() => setState(AppState.STORE)}
        onConverterOpen={() => {
          if (!currentUser) {
            setState(AppState.LOGIN);
            return;
          }
          setState(AppState.VIDEO_CONVERTER);
        }}
        currentTab={state === AppState.BATCH_COMPRESSOR ? 'batch' : state === AppState.STORE ? 'store' : state === AppState.VIDEO_CONVERTER ? 'converter' : 'svga'}
      />
      
      <div className="flex pt-20 h-screen overflow-hidden relative">
        <main className={`flex-1 overflow-y-auto transition-all duration-700 custom-scrollbar ${showAdminPanel ? 'lg:mr-[450px] opacity-20 lg:opacity-40 blur-sm' : 'mr-0'}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
            {state === AppState.IDLE && (
              <div className="py-10 sm:py-20 animate-in fade-in zoom-in duration-700">
                <Uploader 
                  onUpload={handleFileUpload} 
                  isUploading={false} 
                  onConverterOpen={() => {
                    if (!currentUser) {
                      setState(AppState.LOGIN);
                      return;
                    }
                    setState(AppState.VIDEO_CONVERTER);
                  }}
                />
              </div>
            )}
            {state === AppState.PROCESSING && fileMetadata && (
              <Workspace metadata={fileMetadata} onCancel={handleReset} settings={settings} currentUser={currentUser} />
            )}
            {state === AppState.BATCH_COMPRESSOR && (
              <BatchCompressor onCancel={handleReset} />
            )}
            {state === AppState.STORE && (
              <Store currentUser={currentUser} onLoginRequired={() => setState(AppState.LOGIN)} />
            )}
            {state === AppState.VIDEO_CONVERTER && (
              <VideoConverter currentUser={currentUser} onCancel={handleReset} />
            )}
          </div>
        </main>

        <aside 
          className={`fixed top-0 lg:top-20 right-0 bottom-0 w-full lg:w-[450px] bg-[#020617]/95 lg:bg-slate-900/90 backdrop-blur-3xl border-l border-white/10 z-[200] lg:z-[110] transition-transform duration-500 shadow-3xl overflow-y-auto ${showAdminPanel ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="p-6 sm:p-8 pt-24 lg:pt-8">
            <div className="flex justify-between items-center mb-8">
               <button onClick={() => setShowAdminPanel(false)} className="p-2 hover:bg-red-500/20 text-white rounded-xl transition-all border border-white/10">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
               </button>
               <h3 className="text-white font-black uppercase text-xs tracking-widest">Master Command Center</h3>
            </div>
            <AdminPanel currentUser={currentUser} />
          </div>
        </aside>
      </div>
    </div>
  );
};

// Fix: Add default export for App component to satisfy the import in index.tsx
export default App;
