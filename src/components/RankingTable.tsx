import { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { Search, ChevronDown, ChevronUp, AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, Download, RefreshCw } from 'lucide-react';
import { WorkerData, SortField, SortOrder } from '../types';

interface RankingTableProps {
  workers: WorkerData[];
  targetRatio: number;
  onEditWorker?: (worker: WorkerData) => void;
  isAdminMode?: boolean;
}

export default function RankingTable({ workers, targetRatio, onEditWorker, isAdminMode = false }: RankingTableProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_goal' | 'out_goal'>('all');
  const [sortField, setSortField] = useState<SortField>('rank');
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc'); // Best first
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(15);

  // Column sort toggler
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      // Default to ascending for ratio/name, and descending for readings/impediments
      setSortOrder(field === 'ratio' || field === 'name' || field === 'rank' ? 'asc' : 'desc');
    }
    setCurrentPage(1); // Reset to page 1 on sort change
  };

  // 1. Calculate the RANK of every worker based on Bayesian Adjusted Ratio (takes into account both ratio and high volume)
  const rankedWorkers = useMemo(() => {
    // K represents a smoothing constant (minimum baseline sample size)
    const K = 2000;
    const baseTargetRatio = targetRatio / 100; // e.g. 0.0050

    const getAdjustedRatio = (w: WorkerData) => {
      const readings = w.readings;
      const impediments = w.impediments;
      if (readings === 0) return 100; // Put zero readings at the bottom
      return ((impediments + K * baseTargetRatio) / (readings + K)) * 100;
    };

    const sorted = [...workers].sort((a, b) => {
      const adjA = getAdjustedRatio(a);
      const adjB = getAdjustedRatio(b);
      
      if (adjA !== adjB) {
        return adjA - adjB;
      }
      return b.readings - a.readings; // Tie-breaker: more readings is better
    });
    
    return workers.map((worker) => {
      const rankIndex = sorted.findIndex(w => w.id === worker.id);
      const exactRatio = worker.readings > 0 ? (worker.impediments / worker.readings) * 100 : 0;
      return {
        ...worker,
        ratio: exactRatio,
        rank: rankIndex + 1
      };
    });
  }, [workers, targetRatio]);

  // 2. Filter workers by search string and status filter
  const filteredWorkers = useMemo(() => {
    return rankedWorkers.filter(w => {
      const matchesSearch = w.name.toLowerCase().includes(search.toLowerCase());
      const inGoal = w.ratio <= targetRatio;
      
      let matchesStatus = true;
      if (statusFilter === 'in_goal') matchesStatus = inGoal;
      if (statusFilter === 'out_goal') matchesStatus = !inGoal;

      return matchesSearch && matchesStatus;
    });
  }, [rankedWorkers, search, statusFilter, targetRatio]);

  // 3. Sort the filtered workers based on selected sorting
  const sortedWorkers = useMemo(() => {
    return [...filteredWorkers].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'rank') {
        comparison = a.rank - b.rank;
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name, 'pt-BR');
      } else if (sortField === 'readings') {
        comparison = a.readings - b.readings;
      } else if (sortField === 'impediments') {
        comparison = a.impediments - b.impediments;
      } else if (sortField === 'ratio') {
        comparison = a.ratio - b.ratio;
        if (comparison === 0) {
          comparison = b.readings - a.readings; // Tie-breaker: more readings is better
        }
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [filteredWorkers, sortField, sortOrder]);

  // 4. Paginate
  const totalPages = Math.max(1, Math.ceil(sortedWorkers.length / itemsPerPage));
  const paginatedWorkers = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedWorkers.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedWorkers, currentPage, itemsPerPage]);

  // Render sort arrow helper
  const renderSortArrow = (field: SortField) => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <ChevronUp size={14} className="inline ml-1 text-indigo-600" /> : <ChevronDown size={14} className="inline ml-1 text-indigo-600" />;
  };

  // Export to Excel helper
  const handleExport = (type: 'xlsx' | 'xlsm') => {
    const dataToExport = sortedWorkers.map(w => ({
      'Posicao': `${w.rank}º`,
      'Nome': w.name,
      'Matricula': w.matricula,
      'Cidade': w.cidade,
      'Leituras': w.readings,
      'Impedimentos': w.impediments,
      'Relacao %': `${w.ratio.toFixed(2)}%`,
      'Status': w.ratio <= targetRatio ? 'Dentro da Meta' : 'Fora da Meta'
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ranking");
    XLSX.writeFile(workbook, `Ranking.${type}`);
  };

  return (
    <div id="ranking-container" className="bg-white border border-slate-100 rounded-2xl shadow-sm p-4 sm:p-6">
      {/* Header title for Ranking tab exactly as in the user screenshot */}
      <div className="flex items-center gap-3.5 mb-6 md:hidden">
        <div className="p-3 bg-blue-500 text-white rounded-xl shadow-md">
          <ChevronUp size={22} className="rotate-45" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-800 leading-tight tracking-tight">Ranking</h2>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">
            Classificação por % Relação (Menor = 1º)
          </p>
        </div>
      </div>

      {/* Controls: Search, Filter, Export */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          {/* Search bar */}
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
              <Search size={18} />
            </span>
            <input
              id="ranking-search-input"
              type="text"
              placeholder="Buscar por nome..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-sm font-semibold"
            />
          </div>

          {/* Quick Filter Buttons exactly matching the image */}
          <div className="flex gap-2 items-center">
            {/* Filter symbol/label button */}
            <button
              onClick={() => {
                setStatusFilter('all');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="text-[10px]">🔍</span>
              <span>Todos</span>
            </button>

            {/* Dentro (Within goal) */}
            <button
              id="filter-btn-dentro"
              onClick={() => {
                setStatusFilter(statusFilter === 'in_goal' ? 'all' : 'in_goal');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'in_goal'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span>Dentro</span>
            </button>

            {/* Fora (Out of goal) */}
            <button
              id="filter-btn-fora"
              onClick={() => {
                setStatusFilter(statusFilter === 'out_goal' ? 'all' : 'out_goal');
                setCurrentPage(1);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 border rounded-xl text-xs font-bold transition-all ${
                statusFilter === 'out_goal'
                  ? 'bg-rose-50 text-rose-700 border-rose-300 ring-2 ring-rose-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
              <span>Fora</span>
            </button>
          </div>
        </div>

        {/* Actions (Export) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleExport('xlsm')}
            className="w-full md:w-auto flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors border border-emerald-100 rounded-xl text-sm font-semibold cursor-pointer"
          >
            <Download size={16} />
            <span>Exportar XLSM</span>
          </button>
        </div>
      </div>

      {/* Sorting Tabs for Mobile exactly as shown in the user's reference screenshot */}
      <div id="mobile-sorting-pills" className="flex md:hidden items-center gap-1.5 mb-4 overflow-x-auto scrollbar-none pb-1">
        <button
          onClick={() => handleSort('ratio')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            sortField === 'ratio'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          % {sortField === 'ratio' ? (sortOrder === 'asc' ? '↑' : '↓') : '↑'}
        </button>
        <button
          onClick={() => handleSort('readings')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            sortField === 'readings'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Leituras {sortField === 'readings' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          onClick={() => handleSort('impediments')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            sortField === 'impediments'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Impedimentos {sortField === 'impediments' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
        <button
          onClick={() => handleSort('name')}
          className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
            sortField === 'name'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Nome {sortField === 'name' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
        </button>
      </div>

      {/* Count Info Indicator */}
      <div className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4 md:hidden">
        {filteredWorkers.length} de {workers.length} participantes
      </div>

      {/* Desktop Layout: Table view */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-100">
        <table id="ranking-table" className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-bold text-xs uppercase tracking-wider">
              <th 
                id="th-rank"
                onClick={() => handleSort('rank')} 
                className="py-4 px-4 cursor-pointer hover:bg-slate-100 transition-colors select-none text-center w-20"
              >
                Rank {renderSortArrow('rank')}
              </th>
              <th 
                id="th-name"
                onClick={() => handleSort('name')} 
                className="py-4 px-6 cursor-pointer hover:bg-slate-100 transition-colors select-none"
              >
                Nome {renderSortArrow('name')}
              </th>
              <th 
                id="th-readings"
                onClick={() => handleSort('readings')} 
                className="py-4 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none w-36"
              >
                Leituras {renderSortArrow('readings')}
              </th>
              <th 
                id="th-impediments"
                onClick={() => handleSort('impediments')} 
                className="py-4 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none w-36"
              >
                Impedimentos {renderSortArrow('impediments')}
              </th>
              <th 
                id="th-ratio"
                onClick={() => handleSort('ratio')} 
                className="py-4 px-4 text-right cursor-pointer hover:bg-slate-100 transition-colors select-none w-32"
              >
                % Relação {renderSortArrow('ratio')}
              </th>
              <th className="py-4 px-6 text-center w-40">
                Status
              </th>
              {isAdminMode && <th className="py-4 px-4 text-center w-24">Ações</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            <AnimatePresence mode="popLayout">
              {paginatedWorkers.length === 0 ? (
                <tr id="empty-row-indicator">
                  <td colSpan={isAdminMode ? 7 : 6} className="text-center py-12 text-slate-400 font-medium">
                    Nenhum colaborador encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                paginatedWorkers.map((worker) => {
                  const isWithin = worker.ratio <= targetRatio;
                  
                  // Beautiful ranking visual rewards for Top 3
                  let rankBadge = '';
                  let rowStyle = 'hover:bg-slate-50/50 transition-colors';
                  if (worker.rank === 1) {
                    rankBadge = '🏆 1º';
                    rowStyle = 'bg-amber-50/20 hover:bg-amber-50/40 transition-colors';
                  } else if (worker.rank === 2) {
                    rankBadge = '🥈 2º';
                    rowStyle = 'bg-slate-50 hover:bg-slate-100 transition-colors';
                  } else if (worker.rank === 3) {
                    rankBadge = '🥉 3º';
                    rowStyle = 'bg-orange-50/10 hover:bg-orange-50/20 transition-colors';
                  } else {
                    rankBadge = `${worker.rank}º`;
                  }

                  return (
                    <motion.tr
                      key={worker.id}
                      id={`row-worker-${worker.id}`}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      layout
                      className={rowStyle}
                    >
                      {/* Rank Position */}
                      <td className="py-3 px-4 text-center font-bold text-slate-700">
                        {worker.rank <= 3 ? (
                          <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-extrabold ${
                            worker.rank === 1 ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                            worker.rank === 2 ? 'bg-slate-200 text-slate-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {rankBadge}
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400 tabular-nums">{rankBadge}</span>
                        )}
                      </td>

                      {/* Name */}
                      <td className="py-3 px-6 font-semibold text-slate-800">
                        {worker.name}
                      </td>

                      {/* Readings (Leituras) */}
                      <td className="py-3 px-4 text-right font-semibold text-slate-600 tabular-nums">
                        {worker.readings.toLocaleString('pt-BR')}
                      </td>

                      {/* Impediments (Impedimentos) */}
                      <td className="py-3 px-4 text-right font-semibold text-slate-600 tabular-nums">
                        {worker.impediments.toLocaleString('pt-BR')}
                      </td>

                      {/* Ratio (%) */}
                      <td className="py-3 px-4 text-right font-bold text-slate-800 tabular-nums">
                        {worker.ratio.toFixed(2)}%
                      </td>

                      {/* Status */}
                      <td className="py-3 px-6 text-center">
                        {isWithin ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm">
                            <CheckCircle size={12} className="text-emerald-500" />
                            <span>Dentro da Meta</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 shadow-sm">
                            <AlertTriangle size={12} className="text-rose-500 animate-pulse" />
                            <span>Fora da Meta</span>
                          </span>
                        )}
                      </td>

                      {/* Admin edit button */}
                      {isAdminMode && onEditWorker && (
                        <td className="py-3 px-4 text-center">
                          <button
                            id={`edit-worker-btn-${worker.id}`}
                            onClick={() => onEditWorker(worker)}
                            className="w-7 h-7 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-slate-200"
                          >
                            <span className="text-xs font-bold">✎</span>
                          </button>
                        </td>
                      )}
                    </motion.tr>
                  );
                })
              )}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {/* Mobile Layout: Beautiful adaptive cards exactly as in the reference screenshot */}
      <div className="block md:hidden space-y-4">
        <AnimatePresence mode="popLayout">
          {paginatedWorkers.length === 0 ? (
            <div className="text-center py-12 text-slate-400 font-medium bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              Nenhum colaborador encontrado.
            </div>
          ) : (
            paginatedWorkers.map((worker) => {
              const isWithin = worker.ratio <= targetRatio;
              
              return (
                <motion.div
                  key={worker.id}
                  id={`mobile-card-${worker.id}`}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white rounded-2xl border border-slate-100 shadow-xs p-5 space-y-3"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between">
                    {/* Circle rank Badge */}
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-full font-black text-sm shadow-sm ${
                        worker.rank === 1 ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-200' :
                        worker.rank === 2 ? 'bg-slate-200 text-slate-800' :
                        worker.rank === 3 ? 'bg-orange-100 text-orange-800' :
                        'bg-blue-600 text-white'
                      }`}>
                        {worker.rank}
                      </div>
                    </div>

                    {/* Status indicator exactly matching the style */}
                    {isWithin ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 shadow-sm">
                        <span className="inline-block text-[10px]">📈</span>
                        <span>Dentro</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100 shadow-sm">
                        <span className="inline-block text-[10px] animate-pulse">⚠️</span>
                        <span>Alerta</span>
                      </span>
                    )}
                  </div>

                  {/* Big bold name exactly like the image */}
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight leading-snug">
                    {worker.name}
                  </h3>

                  {/* Quantitative Metrics Grid list */}
                  <div className="space-y-2.5 pt-1.5 border-t border-slate-50">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 tracking-wider">LEITURAS</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {worker.readings.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-slate-400 tracking-wider">IMPEDIMENTOS</span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {worker.impediments.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100/50">
                      <span className="font-bold text-slate-400 tracking-wider">% RELAÇÃO</span>
                      <span className={`font-bold text-sm tabular-nums ${isWithin ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {worker.ratio.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Pagination & Rows Info */}
      {sortedWorkers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-6 pt-4 border-t border-slate-100">
          <div className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
            Mostrando <span className="text-slate-700 font-bold">{Math.min(sortedWorkers.length, (currentPage - 1) * itemsPerPage + 1)}</span> a{' '}
            <span className="text-slate-700 font-bold">{Math.min(sortedWorkers.length, currentPage * itemsPerPage)}</span> de{' '}
            <span className="text-slate-700 font-bold">{sortedWorkers.length}</span> colaboradores
          </div>

          <div className="flex items-center gap-4">
            {/* Items per page selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Linhas por pág:</span>
              <select
                id="items-per-page-select"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold px-2 py-1 text-slate-700 focus:outline-none"
              >
                <option value={15}>15</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>

            {/* Prev/Next Navigation */}
            <div className="flex gap-1">
              <button
                id="prev-page-btn"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center px-3 text-xs font-bold text-slate-600">
                Pág. {currentPage} de {totalPages}
              </div>
              <button
                id="next-page-btn"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
