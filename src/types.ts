export interface WorkerData {
  id: string;
  name: string;
  readings: number;      // Leituras
  impediments: number;   // Impedimentos
  ratio: number;         // % Relação (impedimentos / leituras) * 100
}

export interface Settings {
  targetRatio: number;   // Meta de Relação (e.g., 0.50%)
}

export type SortField = 'rank' | 'name' | 'readings' | 'impediments' | 'ratio';
export type SortOrder = 'asc' | 'desc';
