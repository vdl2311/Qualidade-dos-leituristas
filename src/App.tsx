import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, BarChart2, Shield, MapPin, Calendar, Building2, LogOut, Lock } from 'lucide-react';
import { WorkerData, Settings, Funcionario, Usuario, EstatisticasMensais } from './types';
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

  const handleLeituristaLogin = async () => {
    try {
      setLeituristaAuthError('');
      setLeituristaAuthSuccess('');

      if (!leituristaMatricula) {
        setLeituristaAuthError("Por favor, preencha a sua matrícula.");
        return;
      }

      const matNum = parseInt(leituristaMatricula.trim(), 10);
      if (isNaN(matNum)) {
        setLeituristaAuthError("A matrícula deve ser um número.");
        return;
      }

      // Find worker details
      const matched = funcionarios.find(f => f.matricula === matNum && f.ativo);
      if (!matched) {
        setLeituristaAuthError("Matrícula não cadastrada ou desativada no sistema. Contate seu supervisor.");
        return;
      }

      // Successful login
      setLoggedLeiturista(matched);
      localStorage.setItem('rankdash_leiturista', JSON.stringify(matched));
      setSelectedCity(matched.cidade);
      localStorage.setItem('rankdash_cidade', matched.cidade);
      setLeituristaMatricula('');
      setLeituristaAuthSuccess("Acesso realizado com sucesso!");
    } catch (e: any) {
      console.error(e);
      setLeituristaAuthError("Erro ao acessar: " + e.message);
    }
  };

  const handleLeituristaLogout = () => {
    setLoggedLeiturista(null);
    localStorage.removeItem('rankdash_leiturista');
    setSelectedCity('');
    localStorage.removeItem('rankdash_cidade');
    setActiveTab('ranking');
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
      // If we are showing "Todas" (Supervisor mode), pass all
      if (selectedCity === 'all' || selectedCity === 'todas') return true;
      return f.cidade === selectedCity;
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
          className="max-w-md w-full bg-white rounded-3xl p-8 border border-slate-100 shadow-xl space-y-6 animate-fade-in"
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
            <p className="text-xs text-slate-400 font-medium mt-1">
              Painel de Desempenho e Ranking do Leiturista
            </p>
          </div>

          {/* Navigation Tabs for Leiturista / Admin */}
          <div className="flex border border-slate-100 p-1 bg-slate-50 rounded-2xl">
            <button
              onClick={() => {
                setLoginTab('leiturista');
                setAdminError('');
                setLeituristaAuthError('');
                setIsForgotPassword(false);
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                loginTab === 'leiturista'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Leiturista
            </button>
            <button
              onClick={() => {
                setLoginTab('admin');
                setAdminError('');
                setLeituristaAuthError('');
                setIsForgotPassword(false);
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all ${
                loginTab === 'admin'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Gerente / Supervisor
            </button>
          </div>

          {loginTab === 'leiturista' ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Número da Matrícula</label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Digite sua matrícula da empresa (Ex: 1001)"
                  value={leituristaMatricula}
                  onChange={(e) => {
                    setLeituristaMatricula(e.target.value);
                    setLeituristaAuthError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleLeituristaLogin();
                    }
                  }}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                />
              </div>

              {leituristaAuthError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">
                  {leituristaAuthError}
                </div>
              )}

              {leituristaAuthSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold rounded-xl text-center">
                  {leituristaAuthSuccess}
                </div>
              )}

              <button
                onClick={handleLeituristaLogin}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98]"
              >
                Entrar no Painel
              </button>
            </div>
          ) : isForgotPassword ? (
            <div className="space-y-4 animate-fade-in">
              <div>
                <h3 className="text-sm font-bold text-slate-800 mb-1">Recuperar Senha</h3>
                <p className="text-xs text-slate-500 mb-3">
                  Digite seu e-mail para receber um link de recuperação.
                </p>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value);
                    setAdminError('');
                    setResetMessage('');
                  }}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                  placeholder="Seu e-mail cadastrado"
                />
              </div>

              {adminError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">
                  {adminError}
                </div>
              )}

              {resetMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold rounded-xl text-center">
                  {resetMessage}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setIsForgotPassword(false);
                    setAdminError('');
                    setResetMessage('');
                  }}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-xs hover:bg-slate-200 transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={handlePasswordReset}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold text-xs hover:bg-indigo-700 transition-colors"
                >
                  Enviar E-mail
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fade-in">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">E-mail de Acesso</label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => {
                      setAdminEmail(e.target.value);
                      setAdminError('');
                    }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                    placeholder="Seu e-mail de administrador"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Senha</label>
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => {
                      setAdminPassword(e.target.value);
                      setAdminError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdminAuth();
                    }}
                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50 font-semibold text-slate-700"
                    placeholder="Sua senha de acesso"
                  />
                </div>
              </div>

              {adminError && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-semibold rounded-xl text-center">
                  {adminError}
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    setIsForgotPassword(true);
                    setAdminError('');
                    setResetMessage('');
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold hover:underline"
                >
                  Esqueceu a senha?
                </button>
              </div>

              <button
                onClick={handleAdminAuth}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all text-sm shadow-md shadow-indigo-600/10 hover:shadow-indigo-600/20 active:scale-[0.98]"
              >
                Acessar Painel
              </button>
            </div>
          )}
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
    </div>
  );
}
