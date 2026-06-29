import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { motion } from 'motion/react';
import { Upload, Save, UserPlus, Trash2, Settings as SettingsIcon, Search, LogOut, ShieldAlert, Calendar, Plus, AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Funcionario, Usuario, Settings, WorkerData, EstatisticasMensais, PeriodEstatistica } from '../types';
import { db, auth, firebaseConfig } from '../lib/firebase';
import { doc, setDoc, deleteDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as signOutSecondary, signInWithEmailAndPassword, initializeAuth, inMemoryPersistence } from 'firebase/auth';

interface AdminPanelProps {
  currentUser: Usuario | null;
  funcionarios: Funcionario[];
  setFuncionarios: React.Dispatch<React.SetStateAction<Funcionario[]>>;
  estatisticas: EstatisticasMensais;
  setEstatisticas: React.Dispatch<React.SetStateAction<EstatisticasMensais>>;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  currentPeriod: string;
  setCurrentPeriod: (period: string) => void;
  availablePeriods: string[];
  setAvailablePeriods: React.Dispatch<React.SetStateAction<string[]>>;
  onLogout: () => void;
}

export default function AdminPanel({
  currentUser,
  funcionarios,
  setFuncionarios,
  estatisticas,
  setEstatisticas,
  settings,
  setSettings,
  currentPeriod,
  setCurrentPeriod,
  availablePeriods,
  setAvailablePeriods,
  onLogout
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'data' | 'admins'>('data');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [localTargetRatio, setLocalTargetRatio] = useState(settings.targetRatio.toString());
  const [localLogo, setLocalLogo] = useState(settings.logoBase64 || '');
  const [showNewPeriodInput, setShowNewPeriodInput] = useState(false);
  const [newPeriodValue, setNewPeriodValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Users and Permissions Tab State (only for Supervisor)
  const [usersList, setUsersList] = useState<Usuario[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserCargo, setNewUserCargo] = useState<'gerente' | 'supervisor'>('gerente');
  const [newUserCidade, setNewUserCidade] = useState<'ipatinga' | 'caratinga' | 'governador_valadares' | 'todas'>('ipatinga');

  // Local drafts of current period stats and funcionarios to avoid unsaved firestore writes
  const [localFuncionarios, setLocalFuncionarios] = useState<Funcionario[]>([]);
  const [localEstatisticas, setLocalEstatisticas] = useState<EstatisticasMensais>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedCityFilter, setSelectedCityFilter] = useState<'ipatinga' | 'caratinga' | 'governador_valadares' | 'todas'>('todas');

  // Custom dialog notifications
  const [dialog, setDialog] = useState<{
    type: 'success' | 'error' | 'info' | 'confirm';
    title: string;
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (message: string, title = "Aviso", type: 'success' | 'error' | 'info' = 'info') => {
    setDialog({
      type,
      title,
      message
    });
  };

  const showConfirm = (message: string, onConfirm: () => void, title = "Confirmação") => {
    setDialog({
      type: 'confirm',
      title,
      message,
      onConfirm
    });
  };

  // Sync state on mount/props change with deep equality check to prevent discarding draft edits
  const prevFuncionariosRef = useRef<Funcionario[]>([]);
  const prevEstatisticasRef = useRef<EstatisticasMensais>({});

  useEffect(() => {
    const stringifiedProps = JSON.stringify(funcionarios);
    if (stringifiedProps !== JSON.stringify(prevFuncionariosRef.current)) {
      setLocalFuncionarios(funcionarios);
      prevFuncionariosRef.current = funcionarios;
    }
  }, [funcionarios]);

  useEffect(() => {
    const stringifiedProps = JSON.stringify(estatisticas);
    if (stringifiedProps !== JSON.stringify(prevEstatisticasRef.current)) {
      setLocalEstatisticas(estatisticas);
      prevEstatisticasRef.current = estatisticas;
    }
  }, [estatisticas]);

  useEffect(() => {
    setLocalTargetRatio(settings.targetRatio.toString());
    if (settings.logoBase64) {
      setLocalLogo(settings.logoBase64);
    }
  }, [settings]);

  // Load registered users (Supervisors & Gerentes) on admins tab click
  useEffect(() => {
    if (activeTab === 'admins' && currentUser?.cargo === 'supervisor') {
      loadUsers();
    }
  }, [activeTab]);

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const usersSnap = await getDocs(collection(db, 'usuarios'));
      const loaded: Usuario[] = [];
      usersSnap.forEach((d) => {
        loaded.push(d.data() as Usuario);
      });
      setUsersList(loaded);
    } catch (e) {
      console.error("Erro ao carregar usuários:", e);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
      showAlert("Por favor, preencha todos os campos do usuário.", "Campos Incompletos", "error");
      return;
    }
    if (newUserPassword.length < 6) {
      showAlert("A senha provisória deve ter no mínimo 6 caracteres.", "Senha Curta", "error");
      return;
    }
    const emailToSave = newUserEmail.toLowerCase().trim();

    const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp_" + Date.now());
    try {
      const secondaryAuth = initializeAuth(secondaryApp, {
        persistence: inMemoryPersistence
      });
      let newUid = '';

      try {
        // Try creating the user first
        const userCred = await createUserWithEmailAndPassword(secondaryAuth, emailToSave, newUserPassword);
        newUid = userCred.user.uid;
      } catch (createError: any) {
        if (createError.code === 'auth/email-already-in-use') {
          // If already in use, try to sign in on the secondary instance to get the UID
          try {
            const userCred = await signInWithEmailAndPassword(secondaryAuth, emailToSave, newUserPassword);
            newUid = userCred.user.uid;
          } catch (loginError: any) {
            if (loginError.code === 'auth/wrong-password' || loginError.code === 'auth/invalid-credential') {
              showAlert("Este e-mail já está cadastrado com outra senha no sistema. Por favor, utilize a senha correta correspondente a este e-mail ou utilize um e-mail diferente.", "Senha Incorreta", "error");
              return;
            } else {
              showAlert("Este e-mail já possui uma conta no sistema: " + loginError.message, "Erro de Conta", "error");
              return;
            }
          }
        } else {
          showAlert("Erro ao criar credenciais de login: " + createError.message, "Erro", "error");
          return;
        }
      }

      await signOutSecondary(secondaryAuth);

      // 2. Add to Firestore usuarios
      const userData: Usuario = {
        uid: newUid,
        nome: newUserName.trim(),
        email: emailToSave,
        cargo: newUserCargo,
        cidade: newUserCargo === 'supervisor' ? 'todas' : newUserCidade,
        ativo: true,
        criadoEm: new Date().toISOString()
      };

      await setDoc(doc(db, 'usuarios', newUid), userData);

      // Reset state
      setNewUserName('');
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserCargo('gerente');
      setNewUserCidade('ipatinga');
      loadUsers();
      showAlert(`Usuário ${emailToSave} cadastrado e autorizado com sucesso!`, "Sucesso", "success");
    } catch (error: any) {
      console.error("Erro ao cadastrar usuário:", error);
      showAlert("Erro ao cadastrar usuário: " + error.message, "Erro", "error");
    } finally {
      try {
        await deleteApp(secondaryApp);
      } catch (e) {
        console.error("Erro ao deletar secondaryApp:", e);
      }
    }
  };

  const handleToggleUserAtivo = async (uid: string, currentState: boolean) => {
    showConfirm(`Deseja ${currentState ? 'desativar' : 'ativar'} este usuário?`, async () => {
      try {
        const { updateDoc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'usuarios', uid), { ativo: !currentState });
        loadUsers();
      } catch (e) {
        console.error("Erro ao alterar status do usuário", e);
        showAlert("Erro ao alterar status do usuário.", "Erro", "error");
      }
    }, "Alterar Status");
  };

  const handleUpdateUserField = async (uid: string, field: keyof Usuario, value: any) => {
    try {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(db, 'usuarios', uid), { [field]: value });
      setUsersList(prev => prev.map(u => u.uid === uid ? { ...u, [field]: value } : u));
    } catch (e) {
      console.error("Erro ao atualizar usuário", e);
      showAlert("Erro ao atualizar os dados do usuário.", "Erro", "error");
    }
  };

  const handleResetPassword = async (email: string) => {
    showConfirm(`Enviar link de redefinição de senha para ${email}?`, async () => {
      try {
        const { sendPasswordResetEmail } = await import('firebase/auth');
        await sendPasswordResetEmail(auth, email);
        showAlert(`Link de redefinição enviado para ${email}!`, "Sucesso", "success");
      } catch (e) {
        console.error(e);
        showAlert("Erro ao enviar e-mail de redefinição.", "Erro", "error");
      }
    }, "Redefinir Senha");
  };

  const handleRemoveUser = async (uid: string, email: string) => {
    if (email === auth.currentUser?.email) {
      showAlert("Você não pode remover a si mesmo!", "Erro", "error");
      return;
    }
    showConfirm(`Deseja revogar o acesso do usuário ${email}?`, async () => {
      try {
        await deleteDoc(doc(db, 'usuarios', uid));
        loadUsers();
        showAlert("Usuário removido com sucesso do banco de dados.", "Sucesso", "success");
      } catch (e) {
        console.error("Erro ao remover usuário", e);
        showAlert("Erro ao remover permissão de acesso.", "Erro", "error");
      }
    }, "Revogar Acesso");
  };

  // Add / Edit / Remove Employee
  const handleAddFuncionario = () => {
    // Clear search term to ensure the newly added employee is visible
    setSearchTerm('');

    const validMatriculas = localFuncionarios
      .map(f => Number(f.matricula))
      .filter(m => !isNaN(m));
    const nextMatricula = validMatriculas.length > 0 
      ? Math.max(...validMatriculas) + 1 
      : 1001;

    // Gerentes are locked to their own city, Supervisors default to selectedCity or ipatinga
    const assignedCity = currentUser?.cargo === 'gerente' 
      ? currentUser.cidade as 'ipatinga' | 'caratinga' | 'governador_valadares'
      : 'ipatinga';

    const newFunc: Funcionario = {
      id: `func_${Date.now()}`,
      nome: 'NOVO FUNCIONÁRIO',
      matricula: nextMatricula,
      cidade: assignedCity,
      equipe: 'Equipe A',
      ativo: true
    };

    setLocalFuncionarios([newFunc, ...localFuncionarios]);

    // Initialize stats draft for them
    setLocalEstatisticas(prev => ({
      ...prev,
      [newFunc.id]: {
        leituras: 0,
        impedimentos: 0,
        percentual: 0,
        meta: parseFloat(localTargetRatio) || 0.50,
        atualizadoEm: new Date().toISOString()
      }
    }));
  };



  const handleRemoveFuncionario = (id: string) => {
    showConfirm("Deseja realmente excluir este funcionário? Isso removerá o registro dele de forma permanente das estatísticas e da lista.", () => {
      setLocalFuncionarios(prev => prev.filter(f => f.id !== id));
      // Delete draft stats
      const updatedStats = { ...localEstatisticas };
      delete updatedStats[id];
      setLocalEstatisticas(updatedStats);
    }, "Excluir Leiturista");
  };

  const handleDeleteSelected = () => {
    showConfirm(`Deseja realmente excluir permanentemente os ${selectedIds.length} leituristas selecionados?`, () => {
      setLocalFuncionarios(prev => prev.filter(f => !selectedIds.includes(f.id)));
      setLocalEstatisticas(prev => {
        const updatedStats = { ...prev };
        selectedIds.forEach(id => delete updatedStats[id]);
        return updatedStats;
      });
      setSelectedIds([]);
    }, "Excluir Selecionados");
  };

  const handleFuncFieldChange = (id: string, field: keyof Funcionario, value: any) => {
    setLocalFuncionarios(prev => prev.map(f => {
      if (f.id === id) {
        return { ...f, [field]: value };
      }
      return f;
    }));
  };

  const handleStatsFieldChange = (funcId: string, field: 'leituras' | 'impedimentos', value: string) => {
    const num = parseInt(value, 10) || 0;
    setLocalEstatisticas(prev => {
      const current = prev[funcId] || {
        leituras: 0,
        impedimentos: 0,
        percentual: 0,
        meta: parseFloat(localTargetRatio) || 0.50,
        atualizadoEm: new Date().toISOString()
      };
      const updated = { ...current, [field]: num };
      updated.percentual = updated.leituras > 0 ? parseFloat(((updated.impedimentos / updated.leituras) * 100).toFixed(2)) : 0;
      updated.atualizadoEm = new Date().toISOString();
      return { ...prev, [funcId]: updated };
    });
  };

  // CSV Import
  const handleDownloadExcel = () => {
    const dataToExport = filteredFuncionarios.map(f => {
      const stats = localEstatisticas[f.id] || { leituras: 0, impedimentos: 0, percentual: 0 };
      return {
        Matrícula: f.matricula,
        Nome: f.nome,
        Base: f.cidade,
        Leituras: stats.leituras,
        Impedimentos: stats.impedimentos,
        Percentual: `${stats.percentual.toFixed(2)}%`
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Leituristas");
    
    XLSX.writeFile(workbook, "Leituristas.xlsm");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const data = event.target?.result;
      if (file.name.endsWith('.csv')) {
        parseCSV(data as string);
      } else {
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        processImportedJSON(jsonData);
      }
    };
    reader.readAsBinaryString(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const processImportedJSON = (data: any[]) => {
    if (!Array.isArray(data)) {
      alert("Formato de dados retornado inválido.");
      return;
    }

    const importedFuncs: Funcionario[] = [];
    const importedStats: EstatisticasMensais = {};

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (!row || typeof row !== 'object') continue;

      const keys = Object.keys(row);
      const findVal = (terms: string[]) => {
        const foundKey = keys.find(k => {
          const norm = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return terms.some(t => norm.includes(t));
        });
        return foundKey ? row[foundKey] : undefined;
      };

      const nomeVal = findVal(['nome', 'leiturista', 'colaborador', 'func']);
      const leiturasVal = findVal(['leitura', 'readings', 'vol', 'total', 'prod', 'realiz']);
      const impedimentosVal = findVal(['imped', 'impe', 'noco', 'nao', 'ocorrencia']);

      if (nomeVal) {
        const nomeStr = String(nomeVal).trim();
        if (!nomeStr || !isNaN(Number(nomeStr))) continue;

        let func = localFuncionarios.find(f => f.nome.toUpperCase() === nomeStr.toUpperCase());
        
        let id: string;
        if (func) {
          id = func.id;
        } else {
          id = `func_imported_${Date.now()}_${i}`;
          const nextMatricula = localFuncionarios.length + importedFuncs.length + 1001;
          
          importedFuncs.push({
            id,
            nome: nomeStr.toUpperCase(),
            matricula: nextMatricula,
            cidade: (currentUser?.cidade && currentUser.cidade !== 'todas') ? currentUser.cidade : 'ipatinga',
            equipe: 'Equipe Importada',
            ativo: true
          });
        }
        
        const parseNum = (val: any): number => {
          if (val === undefined || val === null) return 0;
          if (typeof val === 'number') return val;
          let s = String(val).replace(/["']/g, '').trim();
          s = s.replace(/[,.]00$/, '');
          s = s.replace(/\D/g, '');
          return parseInt(s, 10) || 0;
        };

        const leituras = parseNum(leiturasVal);
        const impedimentos = parseNum(impedimentosVal);
        
        importedStats[id] = {
          leituras,
          impedimentos,
          percentual: leituras > 0 ? parseFloat(((impedimentos / leituras) * 100).toFixed(2)) : 0,
          meta: parseFloat(localTargetRatio) || 0.50,
          atualizadoEm: new Date().toISOString()
        };
      }
    }

    if (importedFuncs.length > 0 || Object.keys(importedStats).length > 0) {
      if (importedFuncs.length > 0) {
        setLocalFuncionarios(prev => [...importedFuncs, ...prev]);
      }
      setLocalEstatisticas(prev => ({ ...prev, ...importedStats }));
      
      const newCount = importedFuncs.length;
      const totalCount = Object.keys(importedStats).length;
      const updatedCount = totalCount - newCount;

      let msg = '';
      if (newCount > 0 && updatedCount > 0) {
        msg = `${newCount} novos leituristas cadastrados e ${updatedCount} existentes atualizados.`;
      } else if (newCount > 0) {
        msg = `${newCount} novos leituristas cadastrados do arquivo.`;
      } else {
        msg = `${updatedCount} leituristas existentes atualizados do arquivo.`;
      }
      alert(msg + " Não se esqueça de clicar em 'Salvar Alterações'.");
    } else {
      alert("Não foi possível encontrar colunas de leituristas (nome, leituras, impedimentos) no arquivo importado.");
    }
  };

  const parseCSV = (csv: string) => {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return;

    // Detect delimiter on clean first line (removing BOM if present)
    const firstLine = lines[0];
    const cleanFirstLine = firstLine.replace(/^\uFEFF/, '').trim();
    const delimiter = cleanFirstLine.includes(';') ? ';' : (cleanFirstLine.includes('\t') ? '\t' : ',');

    // Default column mappings
    let nameIdx = 0;
    let readingsIdx = 1;
    let impedimentsIdx = 2;
    let hasHeader = false;

    // Helper to safely parse numbers with potential thousand separators or decimal formats
    const parseNumber = (val: string): number => {
      if (!val) return 0;
      let clean = val.replace(/["']/g, '').trim();
      if (!clean) return 0;
      
      // If it ends with ,00 or .00, strip it
      clean = clean.replace(/[,.]00$/, '');
      
      // If it has decimal like ,5 or .5, strip the decimal part
      const hasDecimal = /[,.]\d{1,2}$/.test(clean);
      if (hasDecimal) {
        const match = clean.match(/^(.*?)[,.]\d{1,2}$/);
        if (match) {
          clean = match[1];
        }
      }
      
      // Remove all non-digits (thousand separators, spaces, etc.)
      clean = clean.replace(/\D/g, '');
      return parseInt(clean, 10) || 0;
    };

    // Clean headers for mapping (normalize accents and lowercase)
    const headers = cleanFirstLine.split(delimiter).map(h => 
      h.replace(/["']/g, '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    );
    
    if (headers.some(h => h.includes('nome') || h.includes('leiturista') || h.includes('colaborador') || h.includes('func') || h.includes('registro') || h.includes('matricula'))) {
      hasHeader = true;
      nameIdx = headers.findIndex(h => h.includes('nome') || h.includes('leiturista') || h.includes('colaborador') || h.includes('func'));
      if (nameIdx === -1) nameIdx = 0;

      const rIdx = headers.findIndex(h => h.includes('leitura') || h.includes('readings') || h.includes('vol') || h.includes('total') || h.includes('prod') || h.includes('realiz'));
      if (rIdx !== -1) readingsIdx = rIdx;
      
      const impIdx = headers.findIndex(h => h.includes('imped') || h.includes('impe') || h.includes('noco') || h.includes('nao') || h.includes('ocorrencia'));
      if (impIdx !== -1) impedimentsIdx = impIdx;
    } else {
      // No header found, guess based on first row structure
      const firstRowCols = cleanFirstLine.split(delimiter).map(c => c.replace(/["']/g, '').trim());
      // If first col is a pure number (e.g., position/index like 1, 2, 3) and second col is text (name)
      if (/^\d+$/.test(firstRowCols[0]) && isNaN(Number(firstRowCols[1]))) {
        nameIdx = 1;
        readingsIdx = 2;
        impedimentsIdx = 3;
      }
    }

    const startIndex = hasHeader ? 1 : 0;
    const importedFuncs: Funcionario[] = [];
    const importedStats: EstatisticasMensais = {};

    for (let i = startIndex; i < lines.length; i++) {
      const cols = lines[i].split(delimiter).map(col => col.replace(/["']/g, '').trim());
      if (cols.length > Math.max(nameIdx, readingsIdx, impedimentsIdx)) {
        const nome = cols[nameIdx];
        const readings = parseNumber(cols[readingsIdx]);
        const impediments = parseNumber(cols[impedimentsIdx]);
        
        if (nome && isNaN(Number(nome))) {
          // Check if this employee already exists locally to avoid duplication
          const existing = localFuncionarios.find(f => f.nome.toLowerCase() === nome.toLowerCase());
          
          let id = '';
          if (existing) {
            id = existing.id;
          } else {
            id = `func_imported_${Date.now()}_${i}`;
            
            // Lock city to Manager's city, or default to Ipatinga
            const assignedCity = currentUser?.cargo === 'gerente'
              ? currentUser.cidade as 'ipatinga' | 'caratinga' | 'governador_valadares'
              : 'ipatinga';

            const nextMatricula = localFuncionarios.length + importedFuncs.length + 1001;

            importedFuncs.push({
              id,
              nome: nome.toUpperCase(),
              matricula: nextMatricula,
              cidade: assignedCity,
              equipe: 'Equipe Importada',
              ativo: true
            });
          }

          importedStats[id] = {
            leituras: readings,
            impedimentos: impediments,
            percentual: readings > 0 ? parseFloat(((impediments / readings) * 100).toFixed(2)) : 0,
            meta: parseFloat(localTargetRatio) || 0.50,
            atualizadoEm: new Date().toISOString()
          };
        }
      }
    }

    if (importedFuncs.length > 0 || Object.keys(importedStats).length > 0) {
      if (importedFuncs.length > 0) {
        setLocalFuncionarios(prev => [...importedFuncs, ...prev]);
      }
      setLocalEstatisticas(prev => ({ ...prev, ...importedStats }));
      
      const newCount = importedFuncs.length;
      const updatedCount = Object.keys(importedStats).length - newCount;
      
      let msg = '';
      if (newCount > 0 && updatedCount > 0) {
        msg = `${newCount} novos leituristas cadastrados e ${updatedCount} existentes atualizados.`;
      } else if (newCount > 0) {
        msg = `${newCount} novos leituristas cadastrados do arquivo CSV.`;
      } else {
        msg = `${updatedCount} leituristas atualizados com sucesso.`;
      }
      alert(`${msg} Não se esqueça de clicar em 'Salvar Alterações'.`);
    } else {
      alert("Não foi possível extrair dados do CSV. Verifique se o arquivo possui colunas com nomes como Nome, Leituras, Impedimentos.");
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLocalLogo(base64);
    };
    reader.readAsDataURL(file);
  };

  // Save changes to Firestore
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const targetRatioNum = parseFloat(localTargetRatio) || 0.50;
      const newSettings = { ...settings, targetRatio: targetRatioNum, logoBase64: localLogo };

      // 1. Save settings
      await setDoc(doc(db, 'settings', 'global'), newSettings);

      // 2. Save funcionarios collection
      // Find deleted ones
      const remoteSnap = await getDocs(collection(db, 'funcionarios'));
      const remoteIds = new Set(remoteSnap.docs.map(d => d.id));

      const batch = writeBatch(db);

      // Save/Update
      localFuncionarios.forEach((f) => {
        // Save only if user is authorized for this city
        const isAuthorized = currentUser?.cargo === 'supervisor' || currentUser?.cidade === f.cidade;
        if (isAuthorized) {
          batch.set(doc(db, 'funcionarios', f.id), f);
          remoteIds.delete(f.id);
        }
      });

      // Delete remote ones that were deleted locally (only if authorized)
      remoteIds.forEach((id) => {
        const deletedFunc = funcionarios.find(f => f.id === id);
        if (deletedFunc) {
          const isAuthorized = currentUser?.cargo === 'supervisor' || currentUser?.cidade === deletedFunc.cidade;
          if (isAuthorized) {
            batch.delete(doc(db, 'funcionarios', id));
          }
        }
      });

      await batch.commit();

      // 3. Save period stats document
      // Let's propagate the targetRatio to any statistics entry that has 0
      const finalStats: EstatisticasMensais = {};
      Object.keys(localEstatisticas).forEach((key) => {
        finalStats[key] = {
          ...localEstatisticas[key],
          meta: localEstatisticas[key].meta || targetRatioNum
        };
      });

      await setDoc(doc(db, 'estatisticas', currentPeriod), finalStats);

      // Update global states
      setFuncionarios(localFuncionarios);
      setEstatisticas(finalStats);
      setSettings(newSettings);

      showAlert('Dados salvos com sucesso no banco de dados!', 'Sucesso', 'success');
    } catch (e: any) {
      console.error(e);
      showAlert('Erro ao salvar os dados: ' + e.message, 'Erro', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewPeriod = () => {
    setNewPeriodValue('');
    setShowNewPeriodInput(true);
  };

  // Filter local funcionarios to display according to access rules:
  // - Gerentes see only their city.
  // - Supervisors see whatever city matches or searchTerm
  const filteredFuncionarios = localFuncionarios.filter(f => {
    const matchesSearch = (f.nome || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (f.matricula !== undefined && f.matricula !== null ? f.matricula.toString() : '').includes(searchTerm);
    
    const matchCity = selectedCityFilter === 'todas' || f.cidade === selectedCityFilter;

    if (currentUser?.cargo === 'gerente') {
      return matchesSearch && f.cidade === currentUser.cidade;
    }
    return matchesSearch && matchCity;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        
        {/* Panel Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Painel Administrativo</h2>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
              Logado como: {currentUser?.nome} ({currentUser?.cargo === 'supervisor' ? 'Supervisor Geral' : `Gerente ${currentUser?.cidade.toUpperCase()}`})
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Period Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
              <Calendar size={16} className="text-slate-400" />
              <select
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer"
              >
                {availablePeriods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {currentUser?.cargo === 'supervisor' && (
                <button
                  onClick={handleCreateNewPeriod}
                  className="p-1 hover:bg-slate-200 rounded-md text-slate-500"
                  title="Novo Período"
                >
                  <Plus size={16} />
                </button>
              )}
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors text-sm"
              title="Sair"
            >
              <LogOut size={16} />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-2 border-b border-slate-100 pb-2 mb-6">
          <button
            onClick={() => setActiveTab('data')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'data' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Lançamentos ({currentUser?.cargo === 'gerente' ? currentUser.cidade.toUpperCase() : 'TODAS'})
          </button>
          {currentUser?.cargo === 'supervisor' && (
            <button
              onClick={() => setActiveTab('admins')}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'admins' ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Usuários
            </button>
          )}
        </div>

        {activeTab === 'data' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="file" 
                  accept=".csv, .xlsx, .xlsm, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel.sheet.macroEnabled.12" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors text-sm"
                  disabled={isSaving}
                >
                  <Upload size={16} />
                  <span>Importar Arquivo (CSV, XLSX, XLSM)</span>
                </button>
                <button
                  onClick={handleDownloadExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-xl font-medium transition-colors text-sm"
                >
                  <Upload size={16} className="rotate-180" />
                  <span>Baixar XLSM</span>
                </button>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-medium transition-colors shadow-sm text-sm disabled:opacity-50"
                  >
                    <Save size={16} />
                    <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick configurations */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              <div className="p-4 bg-white rounded-2xl border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                  <SettingsIcon size={16} className="text-slate-400" />
                  Configuração de Metas
                </h3>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-slate-500">Meta Geral de Impedimentos (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    disabled={currentUser?.cargo !== 'supervisor'}
                    value={localTargetRatio}
                    onChange={(e) => setLocalTargetRatio(e.target.value)}
                    className="px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-500 bg-white disabled:bg-slate-50 disabled:text-slate-500"
                  />
                  {currentUser?.cargo !== 'supervisor' && (
                    <span className="text-[10px] text-amber-600 font-semibold">Apenas o Supervisor Geral pode alterar.</span>
                  )}
                </div>
              </div>
              
              <div className="p-4 bg-slate-50 text-slate-600 text-xs rounded-2xl border border-slate-100 flex flex-col justify-center">
                <strong className="mb-1 block text-slate-800">Instruções de Importação</strong>
                <p className="mb-2">Utilize as opções de importar (CSV/Excel) ou forneça uma imagem dos dados para extração automatizada.</p>
                <p><b>Estrutura CSV:</b> Nome;Leituras;Impedimentos.</p>
              </div>
            </div>

            {/* Employee Management Section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
              <h3 className="text-lg font-bold text-slate-800">Gerenciar Leituristas de {currentUser?.cargo === 'gerente' ? currentUser.cidade.toUpperCase() : 'Todas as Bases'}</h3>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nome ou matrícula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:w-64 pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-white"
                  />
                </div>
                <button
                  onClick={handleAddFuncionario}
                  className="flex items-center gap-2 px-3 py-1.5 text-indigo-600 hover:bg-indigo-50 border border-indigo-100 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                >
                  <UserPlus size={16} />
                  <span>Novo Leiturista</span>
                </button>
                {selectedIds.length > 0 && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:bg-red-50 border border-red-100 rounded-lg font-medium transition-colors text-sm whitespace-nowrap"
                  >
                    <Trash2 size={16} />
                    <span>Excluir Selecionados ({selectedIds.length})</span>
                  </button>
                )}
                {currentUser?.cargo === 'supervisor' && (
                  <select
                    value={selectedCityFilter}
                    onChange={(e) => setSelectedCityFilter(e.target.value as any)}
                    className="px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="todas">Todas as Bases</option>
                    <option value="ipatinga">Ipatinga</option>
                    <option value="caratinga">Caratinga</option>
                    <option value="governador_valadares">Gov. Valadares</option>
                  </select>
                )}
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === filteredFuncionarios.length && filteredFuncionarios.length > 0}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds(filteredFuncionarios.map(f => f.id));
                          else setSelectedIds([]);
                        }}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3">Matrícula</th>
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3 w-32">Base</th>
                    <th className="px-4 py-3 w-32">Leituras</th>
                    <th className="px-4 py-3 w-32">Impedimentos</th>
                    <th className="px-4 py-3 w-28">% Relação</th>
                    <th className="px-4 py-3 w-16 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFuncionarios.map((f) => {
                    const stats = localEstatisticas[f.id] || {
                      leituras: 0,
                      impedimentos: 0,
                      percentual: 0,
                      meta: parseFloat(localTargetRatio) || 0.50
                    };

                    return (
                      <tr key={f.id} className="hover:bg-slate-50/40 transition-colors">
                        <td className="px-4 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(f.id)}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedIds([...selectedIds, f.id]);
                              else setSelectedIds(selectedIds.filter(id => id !== f.id));
                            }}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-2 text-sm font-semibold text-slate-500">
                          <input
                            type="number"
                            value={f.matricula}
                            onChange={(e) => handleFuncFieldChange(f.id, 'matricula', parseInt(e.target.value, 10) || 0)}
                            className="w-20 px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white bg-transparent rounded-lg text-sm text-slate-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={f.nome}
                            onChange={(e) => handleFuncFieldChange(f.id, 'nome', e.target.value.toUpperCase())}
                            className="w-full min-w-[200px] px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white bg-transparent rounded-lg text-sm font-bold text-slate-800 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            disabled={currentUser?.cargo === 'gerente'}
                            value={f.cidade}
                            onChange={(e) => handleFuncFieldChange(f.id, 'cidade', e.target.value)}
                            className="px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 bg-transparent rounded-lg text-xs font-semibold text-slate-600 focus:outline-none"
                          >
                            <option value="ipatinga">Ipatinga</option>
                            <option value="caratinga">Caratinga</option>
                            <option value="governador_valadares">Governador Valadares</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={stats.leituras}
                            onChange={(e) => handleStatsFieldChange(f.id, 'leituras', e.target.value)}
                            className="w-24 px-2 py-1 border border-slate-100 hover:border-slate-200 focus:border-indigo-500 rounded-lg text-sm text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={stats.impedimentos}
                            onChange={(e) => handleStatsFieldChange(f.id, 'impedimentos', e.target.value)}
                            className="w-24 px-2 py-1 border border-slate-100 hover:border-slate-200 focus:border-indigo-500 rounded-lg text-sm text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500/20"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <div className={`text-sm font-bold ${stats.percentual > (parseFloat(localTargetRatio) || 0.5) ? 'text-red-500' : 'text-emerald-500'}`}>
                            {stats.percentual.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <button
                            onClick={() => handleRemoveFuncionario(f.id)}
                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remover leiturista"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredFuncionarios.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-400 text-sm">
                        Nenhum funcionário cadastrado ou encontrado para esta busca.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users and Permissions Tab (Only accessible to Supervisor) */}
        {activeTab === 'admins' && currentUser?.cargo === 'supervisor' && (
          <div className="space-y-6 animate-fade-in">
            <div className="p-4 bg-indigo-50 text-indigo-900 rounded-2xl border border-indigo-100 text-sm">
              <strong className="block mb-1">Painel de Acesso (Gerentes e Supervisores)</strong>
              <p>Cadastre e gerencie os logins de acesso. Gerentes só podem visualizar e lançar dados das suas respectivas bases. Supervisores têm acesso irrestrito.</p>
            </div>

            {/* Add User Card */}
            <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl">
              <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                <UserPlus size={16} className="text-indigo-600" />
                Cadastrar Novo Administrador
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Nome Completo</label>
                  <input
                    type="text"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">E-mail</label>
                  <input
                    type="email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    placeholder="gerente@empresa.com"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-500">Senha Provisória</label>
                  <input
                    type="text"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Cargo</label>
                    <select
                      value={newUserCargo}
                      onChange={(e) => setNewUserCargo(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm"
                    >
                      <option value="gerente">Gerente</option>
                      <option value="supervisor">Supervisor</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-500">Base</label>
                    <select
                      disabled={newUserCargo === 'supervisor'}
                      value={newUserCargo === 'supervisor' ? 'todas' : newUserCidade}
                      onChange={(e) => setNewUserCidade(e.target.value as any)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 bg-white text-sm disabled:bg-slate-100 disabled:text-slate-400"
                    >
                      <option value="ipatinga">Ipatinga</option>
                      <option value="caratinga">Caratinga</option>
                      <option value="governador_valadares">Gov. Valadares</option>
                      <option value="todas">Todas</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={handleAddUser}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-medium transition-all text-sm shadow-sm"
                >
                  <UserPlus size={16} />
                  Criar Login Administrador
                </button>
              </div>
            </div>

            {/* List of Registered Admin Users */}
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">E-mail</th>
                    <th className="px-4 py-3 w-32">Cargo</th>
                    <th className="px-4 py-3 w-40">Base Vinculada</th>
                    <th className="px-4 py-3 w-20 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {isLoadingUsers ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Buscando usuários autorizados...
                      </td>
                    </tr>
                  ) : (
                    usersList.map((usr) => (
                      <tr key={usr.uid} className={`hover:bg-slate-50/50 transition-colors ${!usr.ativo ? 'opacity-50 grayscale' : ''}`}>
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={usr.nome}
                            onChange={(e) => handleUpdateUserField(usr.uid, 'nome', e.target.value)}
                            className="w-full min-w-[150px] px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white bg-transparent rounded-lg text-sm font-bold text-slate-800 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="email"
                            value={usr.email}
                            onChange={(e) => handleUpdateUserField(usr.uid, 'email', e.target.value)}
                            className="w-full min-w-[150px] px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 focus:bg-white bg-transparent rounded-lg text-sm text-slate-600 focus:outline-none"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <select
                            value={usr.cargo}
                            onChange={(e) => {
                              const novoCargo = e.target.value;
                              handleUpdateUserField(usr.uid, 'cargo', novoCargo);
                              if (novoCargo === 'supervisor') {
                                handleUpdateUserField(usr.uid, 'cidade', 'todas');
                              }
                            }}
                            className={`px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 bg-transparent rounded-lg text-xs font-bold focus:outline-none ${usr.cargo === 'supervisor' ? 'text-indigo-700' : 'text-blue-700'}`}
                          >
                            <option value="gerente">Gerente</option>
                            <option value="supervisor">Supervisor</option>
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select
                            disabled={usr.cargo === 'supervisor'}
                            value={usr.cidade}
                            onChange={(e) => handleUpdateUserField(usr.uid, 'cidade', e.target.value)}
                            className="px-2 py-1 border border-transparent hover:border-slate-200 focus:border-indigo-500 bg-transparent rounded-lg text-xs font-semibold text-slate-600 focus:outline-none disabled:opacity-50"
                          >
                            <option value="ipatinga">Ipatinga</option>
                            <option value="caratinga">Caratinga</option>
                            <option value="governador_valadares">Gov. Valadares</option>
                            <option value="todas">Todas</option>
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleToggleUserAtivo(usr.uid, usr.ativo)}
                              className={`p-1.5 rounded-lg transition-colors text-xs font-semibold ${usr.ativo ? 'text-slate-400 hover:text-amber-600 hover:bg-amber-50' : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'}`}
                              title={usr.ativo ? "Desativar Acesso" : "Reativar Acesso"}
                            >
                              {usr.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              onClick={() => handleResetPassword(usr.email)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                              title="Enviar redefinição de senha"
                            >
                              <LogOut size={16} className="-rotate-90" />
                            </button>
                            <button
                              disabled={usr.email === auth.currentUser?.email}
                              onClick={() => handleRemoveUser(usr.uid, usr.email)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none"
                              title="Remover Login Definitivamente"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                  {!isLoadingUsers && usersList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                        Nenhum administrador cadastrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Custom Alert/Confirm Modal Dialog */}
      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 scale-95 animate-scale-up">
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${
                dialog.type === 'success' ? 'bg-emerald-50 text-emerald-600' :
                dialog.type === 'error' ? 'bg-rose-50 text-rose-600' :
                dialog.type === 'confirm' ? 'bg-amber-50 text-amber-600' :
                'bg-indigo-50 text-indigo-600'
              }`}>
                {dialog.type === 'success' && <CheckCircle2 size={24} />}
                {dialog.type === 'error' && <AlertCircle size={24} />}
                {dialog.type === 'confirm' && <AlertCircle size={24} />}
                {dialog.type === 'info' && <AlertCircle size={24} />}
              </div>
              <div className="flex-1 space-y-2">
                <h3 className="text-base font-bold text-slate-800">{dialog.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{dialog.message}</p>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              {dialog.type === 'confirm' ? (
                <>
                  <button
                    onClick={() => setDialog(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium rounded-xl text-sm transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (dialog.onConfirm) dialog.onConfirm();
                      setDialog(null);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-sm transition-colors"
                  >
                    Confirmar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setDialog(null)}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl text-sm shadow-sm transition-colors"
                >
                  OK
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* New Period Modal */}
      {showNewPeriodInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100 scale-95 animate-scale-up">
            <h3 className="text-base font-bold text-slate-800 mb-2">Criar Novo Período</h3>
            <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">Digite o novo período no formato AAAA-MM (Ex: {new Date().getFullYear()}-08):</p>
            <input
              type="text"
              placeholder="AAAA-MM"
              value={newPeriodValue}
              onChange={(e) => setNewPeriodValue(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 mb-4 bg-white text-sm"
              maxLength={7}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowNewPeriodInput(false);
                  setNewPeriodValue('');
                }}
                className="px-4 py-2 text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const name = newPeriodValue.trim();
                  const regex = /^\d{4}-\d{2}$/;
                  if (!regex.test(name)) {
                    showAlert("Formato inválido! Use o formato AAAA-MM (ex: 2026-07)", "Formato Inválido", "error");
                    return;
                  }

                  if (availablePeriods.includes(name)) {
                    showAlert(`O período ${name} já existe e agora está ativo.`, "Aviso", "info");
                    setCurrentPeriod(name);
                    setShowNewPeriodInput(false);
                    setNewPeriodValue('');
                    return;
                  }

                  setAvailablePeriods(prev => [...prev, name].sort());
                  setCurrentPeriod(name);
                  setLocalEstatisticas({});
                  setShowNewPeriodInput(false);
                  setNewPeriodValue('');
                  showAlert(`Período ${name} criado com sucesso!`, "Sucesso", "success");
                }}
                className="px-4 py-2 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-sm transition-colors"
              >
                Criar Período
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
