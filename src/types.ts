export interface Cidade {
  id: string; // "ipatinga" | "caratinga" | "governador_valadares"
  nome: string; // "Ipatinga" | "Caratinga" | "Governador Valadares"
}

export interface Usuario {
  uid: string;
  nome: string;
  email: string;
  cargo: 'gerente' | 'supervisor';
  cidade: 'ipatinga' | 'caratinga' | 'governador_valadares' | 'todas';
  ativo: boolean;
  criadoEm?: string;
  ultimoLogin?: string;
}

export interface Funcionario {
  id: string; // firestore id
  nome: string;
  matricula: number;
  cidade: 'ipatinga' | 'caratinga' | 'governador_valadares';
  equipe: string;
  ativo: boolean;
}

export interface PeriodEstatistica {
  leituras: number;
  impedimentos: number;
  percentual: number; // Ratio
  meta: number; // target ratio (e.g. 0.50)
  atualizadoEm: any; // Timestamp or ISO string
}

export interface EstatisticasMensais {
  [funcionarioId: string]: PeriodEstatistica;
}

// For UI compatibility, merging Funcionario with their active monthly statistics
export interface WorkerData {
  id: string; // matches Funcionario id
  name: string; // matches Funcionario nome
  matricula: number;
  cidade: 'ipatinga' | 'caratinga' | 'governador_valadares';
  equipe: string;
  ativo: boolean;
  readings: number; // monthly stats
  impediments: number; // monthly stats
  ratio: number; // exact ratio
  meta: number; // from monthly stats
}

export interface Settings {
  targetRatio: number;   // Default Meta de Relação (e.g., 0.50%)
  logoBase64?: string;
}

export type SortField = 'rank' | 'name' | 'readings' | 'impediments' | 'ratio';
export type SortOrder = 'asc' | 'desc';

