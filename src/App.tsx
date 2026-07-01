import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, BarChart2, Shield, MapPin, Calendar, Building2, LogOut, Lock } from 'lucide-react';
import { WorkerData, Settings, Funcionario, Usuario, EstatisticasMensais, PeriodEstatistica } from './types';
import logoUrl from './assets/images/radar_logo_1782608579304.jpg';

// Firebase imports
import { auth, db } from './lib/firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, setDoc, writeBatch, onSnapshot, query, where, deleteDoc } from 'firebase/firestore';

// Component imports
import StatsOverview from './components/StatsOverview';
import RankingTable from './components/RankingTable';
import DashboardCharts from './components/DashboardCharts';
import AdminPanel from './components/AdminPanel';
import InstallAppPrompt from './components/InstallAppPrompt';
import { initialWorkers } from './initialData';

const getYearMonthString = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export default function App() {
  // Toast Notification States & Helpers
  const [toasts, setToasts] = useState<{
    id: string;
    title: string;
    message: string;
    type: 'info' | 'success' | 'warning';
  }[]>([]);

  const prevFuncionariosRef = useRef<Funcionario[] | null>(null);
  const prevEstatisticasRef = useRef<EstatisticasMensais | null>(null);
  const prevPeriodRef = useRef<string | null>(null);

  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      gain1.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      osc1.start();
      osc1.stop(audioCtx.currentTime + 0.3);
      
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
      gain2.gain.setValueAtTime(0.08, audioCtx.currentTime + 0.08);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.start(audioCtx.currentTime + 0.08);
      osc2.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      console.log('Audio Context not allowed or supported yet', e);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      try {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      } catch (err) {
        console.warn('Could not request notification permission:', err);
      }
    }
  };

  const sendPushNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      const options = {
        body,
        icon: '/logo.svg',
        badge: '/logo.svg',
        vibrate: [200, 100, 200, 100, 200], // custom vibration pattern for phone alerts
        tag: 'radar-leiturista-update',
        renotify: true,
        requireInteraction: false
      };

      // 1. Try to send via registered active Service Worker (Highly compatible on Android/iOS PWA)
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'SHOW_NOTIFICATION',
          title,
          body,
          icon: '/logo.svg',
          badge: '/logo.svg',
          vibrate: [200, 100, 200, 100, 200],
          tag: 'radar-leiturista-update'
        });
      }

      // 2. Try to show via Service Worker Registration (The standard way on mobile browsers)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((registration) => {
            registration.showNotification(title, options);
          })
          .catch((err) => {
            console.log('Service Worker notification failed, falling back to standard notification:', err);
            try {
              new Notification(title, options);
            } catch (e) {
              console.log('Standard Notification creation failed:', e);
            }
          });
      } else {
        try {
          new Notification(title, options);
        } catch (e) {
          console.log('Notification constructor failed:', e);
        }
      }
    }
  };

  // 1. App State
  const [selectedCity, setSelectedCity] = useState<string>(() => {
    const savedLeiturista = localStorage.getItem('rankdash_leiturista');
    if (savedLeiturista) {
      try {
        const parsed = JSON.parse(savedLeiturista);
        if (parsed && parsed.cidade) return parsed.cidade;
      } catch (e) {}
    }
    return localStorage.getItem('rankdash_cidade') || '';
  });
  const [currentPeriod, setCurrentPeriod] = useState<string>('2026-06');
  const [availablePeriods, setAvailablePeriods] = useState<string[]>(['2026-06']);
  const [settings, setSettings] = useState<Settings>({ targetRatio: 0.50 });

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [estatisticas, setEstatisticas] = useState<EstatisticasMensais>({});

  const [currentUser, setCurrentUser] = useState<Usuario | null>(null);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Authentication Dialog State
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [loginTab, setLoginTab] = useState<'leiturista' | 'admin'>('leiturista');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [isForgotPassword, setIsForgotPassword] = useState(false);

  // Leiturista Authentication State
  const [loggedLeiturista, setLoggedLeiturista] = useState<Funcionario | null>(() => {
    const saved = localStorage.getItem('rankdash_leiturista');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return null;
      }
    }
    return null;
  });
  const [leituristaMatricula, setLeituristaMatricula] = useState('');
  const [leituristaAuthError, setLeituristaAuthError] = useState('');
  const [leituristaAuthSuccess, setLeituristaAuthSuccess] = useState('');

  const [activeTab, setActiveTab] = useState<'ranking' | 'charts' | 'admin'>('ranking');
  
  // Login Flow State
  const [loginStep, setLoginStep] = useState<'matricula' | 'confirm'>('matricula');
  const [tempLeiturista, setTempLeiturista] = useState<Funcionario | null>(null);

  // Synchronize city when leiturista logs in
  useEffect(() => {
    if (loggedLeiturista) {
      setSelectedCity(loggedLeiturista.cidade);
    }
  }, [loggedLeiturista]);

  // 2. Self-healing Bootstrap function
  const bootstrapDatabase = async () => {
    try {
      // Create default settings
      const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
      if (!settingsDoc.exists()) {
        await setDoc(doc(db, 'settings', 'global'), { targetRatio: 0.50 });
      }

      // Check/create cities
      const cidadesSnap = await getDocs(collection(db, 'cidades'));
      if (cidadesSnap.empty) {
        await setDoc(doc(db, 'cidades', 'ipatinga'), { nome: 'Ipatinga' });
        await setDoc(doc(db, 'cidades', 'caratinga'), { nome: 'Caratinga' });
        await setDoc(doc(db, 'cidades', 'governador_valadares'), { nome: 'Governador Valadares' });
      }

      // Check/create default funcionarios
      const funcSnap = await getDocs(collection(db, 'funcionarios'));
      if (funcSnap.empty) {
        const batch = writeBatch(db);
        const statsMap: EstatisticasMensais = {};

        initialWorkers.forEach((worker, index) => {
          // All workers belong to Ipatinga
          const city = 'ipatinga';

          const funcId = `func_${index + 1}`;
          const funcRef = doc(db, 'funcionarios', funcId);
          
          batch.set(funcRef, {
            id: funcId,
            nome: worker.name,
            matricula: 1000 + index + 1,
            cidade: city,
            equipe: index % 2 === 0 ? 'Equipe A' : 'Equipe B',
            ativo: true
          });

          statsMap[funcId] = {
            leituras: worker.readings,
            impedimentos: worker.impediments,
            percentual: worker.readings > 0 ? parseFloat(((worker.impediments / worker.readings) * 100).toFixed(2)) : 0,
            meta: 0.50,
            atualizadoEm: new Date().toISOString()
          };
        });

        await batch.commit();

        // Write stats document for 2026-06
        await setDoc(doc(db, 'estatisticas', '2026-06'), statsMap);
      }
    } catch (e) {
      console.log('Error during bootstrapping:', e);
    }
  };

  // Run Bootstrap & load initial configuration
  useEffect(() => {
    const initialize = async () => {
      await bootstrapDatabase();
      requestNotificationPermission();

      // Listen to Settings
      onSnapshot(doc(db, 'settings', 'global'), (docSnap) => {
        if (docSnap.exists()) {
          setSettings(docSnap.data() as Settings);
        }
      });

      // Listen to Funcionarios
      onSnapshot(collection(db, 'funcionarios'), (snap) => {
        const loaded: Funcionario[] = [];
        snap.forEach((d) => {
          const data = d.data() as Funcionario;
          loaded.push(data);
        });
        setFuncionarios(loaded);
      });

      // Fetch list of available statistics periods (each doc in estatisticas)
      onSnapshot(collection(db, 'estatisticas'), (snap) => {
        if (!snap.empty) {
          const periods = snap.docs.map(doc => doc.id).sort();
          setAvailablePeriods(periods);
          // Set to latest period by default if none is set
          if (periods.length > 0 && !periods.includes(currentPeriod)) {
            setCurrentPeriod(periods[periods.length - 1]);
          }
        }
      });

      setIsLoaded(true);
    };

    initialize();
  }, []);

  // Monitor statistics updates (readings and impediments) of the leituristas to trigger notifications
  useEffect(() => {
    // If stats are empty, populate ref and skip to avoid notifying on initial load
    if (Object.keys(estatisticas).length === 0) {
      prevEstatisticasRef.current = estatisticas;
      prevPeriodRef.current = currentPeriod;
      return;
    }

    // Only compare if we are in the same period to avoid false alarms when shifting period tabs
    if (prevPeriodRef.current === currentPeriod && prevEstatisticasRef.current !== null) {
      const changes: string[] = [];

      (Object.entries(estatisticas) as [string, PeriodEstatistica][]).forEach(([funcId, currentStats]) => {
        const prevStats = prevEstatisticasRef.current?.[funcId] as PeriodEstatistica | undefined;
        if (prevStats) {
          const readingsChanged = currentStats.leituras !== prevStats.leituras;
          const impedimentsChanged = currentStats.impedimentos !== prevStats.impedimentos;

          if (readingsChanged || impedimentsChanged) {
            const func = funcionarios.find(f => f.id === funcId);
            const name = func ? func.nome : `Leiturista`;
            const matriculaStr = func ? ` (Matrícula: ${func.matricula})` : '';

            let changeMsg = '';
            if (readingsChanged && impedimentsChanged) {
              changeMsg = `atualizou seus dados de desempenho: Leituras realizadas: ${prevStats.leituras} → ${currentStats.leituras} | Impedimentos: ${prevStats.impedimentos} → ${currentStats.impedimentos}`;
            } else if (readingsChanged) {
              changeMsg = `atualizou o número de leituras realizadas de ${prevStats.leituras} para ${currentStats.leituras}`;
            } else {
              changeMsg = `atualizou o número de impedimentos de ${prevStats.impedimentos} para ${currentStats.impedimentos}`;
            }

            changes.push(`${name}${matriculaStr} ${changeMsg}.`);
          }
        }
      });

      if (changes.length > 0) {
        changes.forEach((message) => {
          const title = "Leitura Atualizada 📊";
          playChime();
          sendPushNotification(title, message);

          const newToast = {
            id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
            title,
            message,
            type: 'info' as const
          };
          setToasts(prev => [...prev, newToast]);
        });
      }
    }

    // Keep cache synced
    prevEstatisticasRef.current = estatisticas;
    prevPeriodRef.current = currentPeriod;
  }, [estatisticas, funcionarios, currentPeriod]);

  // Auto-dismiss in-app toasts after 7 seconds
  useEffect(() => {
    if (toasts.length > 0) {
      const timer = setTimeout(() => {
        setToasts(prev => prev.filter((_, idx) => idx !== 0));
      }, 7000);
      return () => clearTimeout(timer);
    }
  }, [toasts]);

  // Listen to active period statistics
  useEffect(() => {
    if (!currentPeriod) return;
    const unsub = onSnapshot(doc(db, 'estatisticas', currentPeriod), (docSnap) => {
      if (docSnap.exists()) {
        setEstatisticas(docSnap.data() as EstatisticasMensais);
      } else {
        setEstatisticas({});
      }
    });
    return () => unsub();
  }, [currentPeriod]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          // If the email is vidal2311usa@gmail.com, ensure it is added to 'usuarios' as supervisor
          const rootEmail = 'vidal2311usa@gmail.com';
          const userDocRef = doc(db, 'usuarios', user.uid);
          let userDocSnap = await getDoc(userDocRef);

          if (!userDocSnap.exists() && user.email?.toLowerCase() === rootEmail) {
            const rootUserData: Usuario = {
              uid: user.uid,
              nome: "Vidal Admin",
              email: rootEmail,
              cargo: "supervisor",
              cidade: "todas",
              ativo: true
            };
            await setDoc(userDocRef, rootUserData);
            userDocSnap = await getDoc(userDocRef);
          }

          if (userDocSnap.exists()) {
            const userData = userDocSnap.data() as Usuario;
            if (userData.ativo) {
              setCurrentUser(userData);
              setIsAdminAuthenticated(true);

              // Update last login
              try {
                const { updateDoc } = await import('firebase/firestore');
                await updateDoc(userDocRef, { ultimoLogin: new Date().toISOString() });
              } catch(e) {
                console.error("Error updating last login", e);
              }
              
              // Force selected city lock for Gerente
              if (userData.cargo === 'gerente') {
                setSelectedCity(userData.cidade);
              }
            } else {
              setAdminError("Esta conta de administrador foi desativada.");
              await signOut(auth);
              setIsAdminAuthenticated(false);
              setCurrentUser(null);
            }
          } else {
            setAdminError("Este e-mail não possui permissão de acesso.");
            await signOut(auth);
            setIsAdminAuthenticated(false);
            setCurrentUser(null);
          }
        } catch (e: any) {
          console.error("Auth document load error", e);
          setAdminError("Erro ao recuperar perfil do usuário.");
          await signOut(auth);
        }
      } else {
        setIsAdminAuthenticated(false);
        setCurrentUser(null);
        if (activeTab === 'admin') {
          setActiveTab('ranking');
        }
        // Restore local selected city if present
        const savedCity = localStorage.getItem('rankdash_cidade') || '';
        setSelectedCity(savedCity);
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle Logins
  const handleAdminAuth = async () => {
    try {
      setAdminError('');
      if (!adminEmail || !adminPassword) {
        setAdminError("Por favor, preencha o e-mail e a senha.");
        return;
      }

      try {
        await signInWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
      } catch (signInError: any) {
        if ((signInError.code === 'auth/invalid-credential' || signInError.code === 'auth/user-not-found' || signInError.code === 'auth/wrong-password') && adminEmail.trim().toLowerCase() === 'vidal2311usa@gmail.com') {
          try {
            const { createUserWithEmailAndPassword } = await import('firebase/auth');
            await createUserWithEmailAndPassword(auth, adminEmail.trim(), adminPassword);
          } catch (createError: any) {
            if (createError.code === 'auth/email-already-in-use') {
              setAdminError("E-mail ou senha incorretos.");
            } else {
              setAdminError("Erro ao criar login de administrador: " + createError.message);
            }
            return;
          }
        } else {
          throw signInError;
        }
      }

      setShowAdminLogin(false);
      setAdminEmail('');
      setAdminPassword('');
      setActiveTab('admin');
    } catch (error: any) {
      let errorMessage = 'Erro ao fazer login.';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        errorMessage = 'E-mail ou senha incorretos.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'E-mail em formato inválido.';
      }
      setAdminError(errorMessage);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setCurrentUser(null);
    setIsAdminAuthenticated(false);
    setActiveTab('ranking');
    // Restore the city selection from local storage
    const savedCity = localStorage.getItem('rankdash_cidade') || '';
    setSelectedCity(savedCity);
  };

  const handlePasswordReset = async () => {
    if (!adminEmail) {
      setAdminError('Digite seu e-mail para recuperar a senha.');
      return;
    }
    try {
      setAdminError('');
      setResetMessage('');
      await sendPasswordResetEmail(auth, adminEmail.trim());
      setResetMessage('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (error: any) {
      console.error(error);
      setAdminError('Erro ao enviar e-mail de recuperação.');
    }
  };

  const handleMatriculaContinuar = () => {
    setLeituristaAuthError('');
    if (!leituristaMatricula) {
      setLeituristaAuthError("Por favor, preencha a sua matrícula.");
      return;
    }
    const matNum = parseInt(leituristaMatricula.trim(), 10);
    if (isNaN(matNum)) {
      setLeituristaAuthError("A matrícula deve ser um número.");
      return;
    }
    const matched = funcionarios.find(f => f.matricula === matNum && f.ativo);
    if (!matched) {
      setLeituristaAuthError("Matrícula não cadastrada ou desativada.");
      return;
    }
    setTempLeiturista(matched);
    setLoginStep('confirm');
  };

  const handleConfirmarLogin = () => {
    if (!tempLeiturista) return;
    setLoggedLeiturista(tempLeiturista);
    localStorage.setItem('rankdash_leiturista', JSON.stringify(tempLeiturista));
    setSelectedCity(tempLeiturista.cidade);
    localStorage.setItem('rankdash_cidade', tempLeiturista.cidade);
    setLeituristaMatricula('');
    setTempLeiturista(null);
    setLoginStep('matricula');
  };

  const handleLeituristaLogout = () => {
    setLoggedLeiturista(null);
    localStorage.removeItem('rankdash_leiturista');
    setSelectedCity('');
    localStorage.removeItem('rankdash_cidade');
    setActiveTab('ranking');
    setLoginStep('matricula');
    setTempLeiturista(null);
  };

  const handleSelectCityForEmployee = (city: string) => {
    setSelectedCity(city);
    localStorage.setItem('rankdash_cidade', city);
  };

  const handleResetCityChoice = () => {
    setSelectedCity('');
    localStorage.removeItem('rankdash_cidade');
    setActiveTab('ranking');
  };

  // 3. Compute `WorkerData[]` for active view
  const computedWorkers: WorkerData[] = funcionarios
    .filter(f => f.ativo)
    .filter(f => {
      // If a specific city is selected, ALWAYS filter by it.
      if (selectedCity && selectedCity !== 'all' && selectedCity !== 'todas') {
        return f.cidade === selectedCity;
      }

      // If no specific city selected, apply role-based filtering
      if (currentUser?.cargo === 'supervisor') return true;
      if (loggedLeiturista) return f.cidade === loggedLeiturista.cidade;
      if (currentUser?.cargo === 'gerente') return f.cidade === currentUser.cidade;

      return true;
    })
    .map(f => {
      const stats = estatisticas[f.id] || {
        leituras: 0,
        impedimentos: 0,
        percentual: 0,
        meta: settings.targetRatio
      };

      return {
        id: f.id,
        name: f.nome,
        matricula: f.matricula,
        cidade: f.cidade,
        equipe: f.equipe,
        ativo: f.ativo,
        readings: stats.leituras,
        impediments: stats.impedimentos,
        ratio: stats.leituras > 0 ? (stats.impedimentos / stats.leituras) * 100 : 0,
        meta: stats.meta || settings.targetRatio
      };
    });

  const effectiveLogoUrl = settings.logoBase64 || logoUrl;

  const rankedWorkers = useMemo(() => {
    const sorted = [...computedWorkers].sort((a, b) => {
      if (a.ratio !== b.ratio) {
        return a.ratio - b.ratio; // Menor % é melhor
      }
      return b.readings - a.readings; // Desempate: maior leituras
    });
    return sorted.map((worker, index) => ({
      ...worker,
      rank: index + 1,
    }));
  }, [computedWorkers]);

  const loggedWorkerData = useMemo(() => {
    if (!loggedLeiturista) return null;
    return rankedWorkers.find(w => w.matricula === loggedLeiturista.matricula);
  }, [rankedWorkers, loggedLeiturista]);

  const rewardInfo = useMemo(() => {
    if (!loggedWorkerData) return null;
    const readings = loggedWorkerData.readings;
    const impediments = loggedWorkerData.impediments;
    
    // Reward is 0.20 per reading above 8000
    const threshold = 8000;
    const readingsAboveThreshold = Math.max(0, readings - threshold);
    const grossReward = readingsAboveThreshold * 0.20;
    // Net reward: gross reward minus number of impediments times 1.50
    const netReward = grossReward - (impediments * 1.50);
    
    return {
      readingsAboveThreshold,
      grossReward,
      netReward,
      hasBonus: readings > threshold
    };
  }, [loggedWorkerData]);

  if (!isLoaded) {
    return (
      <div id="loading-fallback" className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <img
            src={effectiveLogoUrl}
            alt="Radar do Leiturista Logo"
            className="w-16 h-16 rounded-2xl mx-auto shadow-md border border-slate-100 object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  // Leiturista Login and Access View
  if (!loggedLeiturista && !isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-100 shadow-xl space-y-8 animate-fade-in"
        >
          <div className="text-center">
            <img
              src={effectiveLogoUrl}
              alt="Radar do Leiturista Logo"
              className="w-20 h-20 rounded-3xl mx-auto shadow-lg border border-slate-100 object-cover"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-2xl font-black text-slate-800 tracking-tight font-display mt-4">
              Radar do Leiturista
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-1">
              {loginStep === 'matricula' ? 'Digite sua matrícula para começar' : 'Confirmação antes de entrar'}
            </p>
          </div>

          <div className="space-y-4 animate-fade-in">
            {loginTab === 'leiturista' ? (
              <>
                {loginStep === 'matricula' ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Matrícula</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        placeholder="0000"
                        value={leituristaMatricula}
                        onChange={(e) => {
                          setLeituristaMatricula(e.target.value);
                          setLeituristaAuthError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleMatriculaContinuar();
                        }}
                        className="w-full px-4 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-lg bg-slate-50 font-bold text-slate-800 text-center tracking-widest"
                      />
                    </div>
                    {leituristaAuthError && (
                      <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">
                        {leituristaAuthError}
                      </div>
                    )}
                    <button
                      onClick={handleMatriculaContinuar}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all text-sm shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98]"
                    >
                      Continuar
                    </button>
                  </>
                ) : (
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-lg">
                        {tempLeiturista?.nome.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{tempLeiturista?.nome}</h3>
                        <p className="text-xs text-slate-500">Matrícula {tempLeiturista?.matricula} · {tempLeiturista?.cidade}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleConfirmarLogin}
                      className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-bold transition-all text-sm"
                    >
                      É você? Entrar no painel
                    </button>
                    <button
                      onClick={() => {
                        setLoginStep('matricula');
                        setTempLeiturista(null);
                      }}
                      className="w-full py-2 text-xs font-bold text-slate-500 hover:text-slate-800"
                    >
                      Não sou eu, corrigir matrícula
                    </button>
                  </div>
                )}
                
                <div className="text-center pt-4 border-t border-slate-100">
                  <p className="text-xs text-slate-500 font-medium">
                    É gerente ou supervisor?{' '}
                    <button
                      onClick={() => {
                        setLoginTab('admin');
                        setAdminError('');
                        setLeituristaAuthError('');
                        setIsForgotPassword(false);
                      }}
                      className="text-indigo-600 font-bold hover:underline"
                    >
                      Entrar com e-mail
                    </button>
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {isForgotPassword ? (
                  <>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800 mb-1">Recuperar Senha</h3>
                      <p className="text-xs text-slate-500 mb-3">Digite seu e-mail para receber um link.</p>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => {
                          setAdminEmail(e.target.value);
                          setAdminError('');
                          setResetMessage('');
                        }}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                        placeholder="Seu e-mail"
                      />
                    </div>
                    {adminError && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">{adminError}</div>}
                    {resetMessage && <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold rounded-xl text-center">{resetMessage}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => { setIsForgotPassword(false); setAdminError(''); }} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs hover:bg-slate-200 transition-colors">Voltar</button>
                      <button onClick={handlePasswordReset} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-xs hover:bg-indigo-700 transition-colors">Enviar E-mail</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">E-mail</label>
                      <input
                        type="email"
                        value={adminEmail}
                        onChange={(e) => { setAdminEmail(e.target.value); setAdminError(''); }}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                        placeholder="Seu e-mail"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Senha</label>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => { setAdminPassword(e.target.value); setAdminError(''); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAdminAuth(); }}
                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                        placeholder="Sua senha"
                      />
                    </div>
                    {adminError && <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">{adminError}</div>}
                    <div className="flex justify-between items-center">
                       <button onClick={() => { setLoginTab('leiturista'); setAdminError(''); }} className="text-xs text-slate-500 hover:text-slate-800 font-semibold hover:underline">Voltar para Leiturista</button>
                       <button onClick={() => setIsForgotPassword(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold hover:underline">Esqueceu a senha?</button>
                    </div>
                    <button onClick={handleAdminAuth} className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98]">Acessar Painel</button>
                  </>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-50 pb-16 font-sans">
      {/* Top Header Navigation Panel */}
      <header id="app-main-header" className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 md:py-0 md:h-20 gap-4">
            
            {/* Logo and Brand */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-3">
                <img
                  src={effectiveLogoUrl}
                  alt="Radar do Leiturista Logo"
                  className="w-12 h-12 rounded-2xl shadow-md border border-slate-100 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <span className="block text-base font-black text-slate-800 tracking-tight font-display">
                    Radar do Leiturista
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="inline-block px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-bold uppercase tracking-wider">
                      {selectedCity === 'all' || selectedCity === 'todas' ? 'Geral' : selectedCity || 'Sem Base'}
                    </span>
                    <span className="block text-[10px] text-slate-400 font-semibold">
                      {currentPeriod}
                    </span>
                  </div>
                </div>
              </div>

              {/* Reset City choice for employee */}
              {!isAdminAuthenticated && !loggedLeiturista && (
                <button
                  onClick={handleResetCityChoice}
                  className="md:hidden flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-2 py-1 rounded-lg"
                >
                  <MapPin size={12} />
                  <span>Trocar Base</span>
                </button>
              )}
            </div>

            {/* Quick selector bar for Supervisors */}
            {currentUser?.cargo === 'supervisor' && (
              <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-none">
                {[
                  { id: 'todas', name: 'Todas' },
                  { id: 'ipatinga', name: 'Ipatinga' },
                  { id: 'caratinga', name: 'Caratinga' },
                  { id: 'governador_valadares', name: 'Gov. Valadares' }
                ].map((city) => (
                  <button
                    key={city.id}
                    onClick={() => setSelectedCity(city.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${selectedCity === city.id ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                  >
                    {city.name}
                  </button>
                ))}
              </div>
            )}

            {/* Main Tabs Navigation */}
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <nav id="header-nav-tabs" className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-none w-full md:w-auto">
                <button
                  id="tab-btn-ranking"
                  onClick={() => setActiveTab('ranking')}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === 'ranking' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Trophy size={14} />
                  <span>Ranking</span>
                </button>
                <button
                  id="tab-btn-charts"
                  onClick={() => setActiveTab('charts')}
                  className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeTab === 'charts' 
                      ? 'bg-white text-slate-800 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <BarChart2 size={14} />
                  <span>Estatísticas</span>
                </button>
                
                {!loggedLeiturista && (
                  <button
                    id="tab-btn-admin"
                    onClick={() => {
                      if (isAdminAuthenticated) {
                        setActiveTab('admin');
                      } else {
                        setShowAdminLogin(true);
                      }
                    }}
                    className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      activeTab === 'admin' 
                        ? 'bg-indigo-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:text-indigo-600'
                    }`}
                  >
                    <Shield size={14} />
                    <span>{isAdminAuthenticated ? 'Painel Admin' : 'Área Admin'}</span>
                  </button>
                )}
              </nav>

              {/* Desktop Switch City Button */}
              {!isAdminAuthenticated && !loggedLeiturista && (
                <button
                  onClick={handleResetCityChoice}
                  className="hidden md:flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3.5 py-2.5 rounded-xl transition-all"
                >
                  <MapPin size={14} />
                  <span>Trocar Base</span>
                </button>
              )}

              {/* Logged in Leiturista Profile Badge and Logout */}
              {loggedLeiturista && (
                <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 p-1.5 pl-3.5 pr-2.5 rounded-2xl">
                  <div className="flex flex-col text-right">
                    <span className="text-xs font-extrabold text-slate-800 leading-none">
                      {loggedLeiturista.nome}
                    </span>
                    <span className="text-[10px] font-semibold text-slate-400 mt-1">
                      Matrícula: {loggedLeiturista.matricula}
                    </span>
                  </div>
                  <button
                    onClick={handleLeituristaLogout}
                    title="Sair da conta"
                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl transition-colors"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Grid */}
      <main id="app-main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        
        {/* Statistics Period Selector for Employee */}
        {!isAdminAuthenticated && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white border border-slate-100 p-4 rounded-2xl gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Mês de Referência</h2>
              <p className="text-xs text-slate-400 font-medium">Veja o histórico de desempenho selecionando o período.</p>
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl self-start sm:self-auto">
              <Calendar size={16} className="text-indigo-500" />
              <select
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer"
              >
                {availablePeriods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Spotlight Worker Box (Logged Leiturista Spotlight Card) */}
        {loggedWorkerData && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-5 sm:p-6 bg-gradient-to-r from-indigo-50 via-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-2xl shadow-sm"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-indigo-600 text-white flex items-center justify-center font-extrabold text-xl shadow-md shrink-0">
                  {loggedWorkerData.rank}º
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100/60 px-2 py-0.5 rounded-md">
                      Seu Desempenho
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-800 tracking-tight mt-0.5">
                    {loggedWorkerData.name}
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    Matrícula: {loggedWorkerData.matricula} · {loggedWorkerData.cidade.toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Reward Calculations / Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 max-w-2xl lg:ml-6">
                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leituras</span>
                  <span className="block text-lg font-black text-slate-800 mt-0.5">{loggedWorkerData.readings.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Impedimentos</span>
                  <span className="block text-lg font-black text-slate-800 mt-0.5">{loggedWorkerData.impediments.toLocaleString('pt-BR')}</span>
                </div>
                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">% Relação</span>
                  <span className={`block text-lg font-black mt-0.5 ${loggedWorkerData.ratio <= settings.targetRatio ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {loggedWorkerData.ratio.toFixed(2)}%
                  </span>
                </div>
                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 text-center">
                  <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Meta</span>
                  <span className="mt-1 block">
                    {loggedWorkerData.ratio <= settings.targetRatio ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">Ok</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">Alerta</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Premium Reward Panel */}
            {rewardInfo && (
              <div className="mt-4 pt-4 border-t border-indigo-100/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex items-start gap-2.5">
                  <span className="text-xl">💰</span>
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                      Simulador de Estimativa de Bônus (Leituras &gt; 8.000)
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                      Bônus de R$ 0,20 por leitura excedente a 8.000, com redução direta de R$ 1,50 por cada impedimento registrado.
                    </p>
                    <div className="text-[10px] text-slate-400 font-mono mt-1">
                      Cálculo: (Leituras acima de 8.000 × R$ 0,20) - (Impedimentos × R$ 1,50)
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-3 bg-white/90 px-4 py-3 rounded-xl border border-indigo-100 self-end sm:self-auto">
                  <div className="text-right">
                    <span className="block text-[9px] font-bold text-slate-400">GANHO LÍQUIDO ESTIMADO</span>
                    <span className={`block text-xl font-black ${rewardInfo.netReward > 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                      {rewardInfo.netReward > 0 
                        ? rewardInfo.netReward.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : 'R$ 0,00'
                      }
                    </span>
                  </div>
                  {rewardInfo.hasBonus ? (
                    <div className="text-xs text-slate-500 font-mono pl-3 border-l border-indigo-100 leading-tight">
                      <div className="text-indigo-600 font-bold">+{rewardInfo.readingsAboveThreshold} leituras</div>
                      <div>Bruto: R$ {rewardInfo.grossReward.toFixed(2)}</div>
                      <div>Imp: -R$ {(loggedWorkerData.impediments * 1.50).toFixed(2)}</div>
                    </div>
                  ) : (
                    <div className="text-[10px] text-indigo-600 font-bold bg-indigo-50/50 px-2.5 py-1 rounded-md max-w-[170px] leading-snug">
                      Faltam {8000 - loggedWorkerData.readings} leituras para bônus.
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Metric widgets */}
        {activeTab !== 'admin' && (
          <StatsOverview workers={computedWorkers} targetRatio={settings.targetRatio} />
        )}

        {/* Tab switcher containers */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'ranking' && (
              <RankingTable 
                workers={computedWorkers} 
                targetRatio={settings.targetRatio} 
                isAdminMode={false}
                hideExport={!!loggedLeiturista}
                loggedLeiturista={loggedLeiturista}
              />
            )}

            {activeTab === 'charts' && (
              <DashboardCharts 
                workers={computedWorkers} 
                targetRatio={settings.targetRatio} 
              />
            )}

            {activeTab === 'admin' && (
              <AdminPanel
                currentUser={currentUser}
                funcionarios={funcionarios}
                setFuncionarios={setFuncionarios}
                estatisticas={estatisticas}
                setEstatisticas={setEstatisticas}
                settings={settings}
                setSettings={setSettings}
                currentPeriod={currentPeriod}
                setCurrentPeriod={setCurrentPeriod}
                availablePeriods={availablePeriods}
                setAvailablePeriods={setAvailablePeriods}
                onLogout={handleLogout}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
      
      {/* PWA App Installation Floating Banner */}
      <InstallAppPrompt />

      {/* Floating Toast Notifications */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: 50, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 50, scale: 0.95 }}
              layout
              className="pointer-events-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-slate-100 p-4 flex items-start gap-3.5 relative overflow-hidden group"
            >
              {/* Left side accent color bar */}
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                toast.type === 'success' ? 'bg-emerald-500' :
                toast.type === 'warning' ? 'bg-amber-500' :
                'bg-indigo-500'
              }`} />
              
              {/* Icon based on type */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                toast.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                toast.type === 'warning' ? 'bg-amber-50 text-amber-600' :
                'bg-indigo-50 text-indigo-600'
              }`}>
                {toast.type === 'success' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : toast.type === 'warning' ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                )}
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-black text-slate-800 tracking-tight">{toast.title}</h4>
                <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">{toast.message}</p>
              </div>

              {/* Close button */}
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="absolute right-2 top-2 p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/50 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
