import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Award, Eye, AlertTriangle, Percent, CheckCircle2 } from 'lucide-react';
import { WorkerData } from '../types';

interface StatsOverviewProps {
  workers: WorkerData[];
  targetRatio: number;
}

export default function StatsOverview({ workers, targetRatio }: StatsOverviewProps) {
  // Normalize workers with exact dynamic float ratio
  const exactWorkers = useMemo(() => {
    return workers.map(w => ({
      ...w,
      ratio: w.readings > 0 ? (w.impediments / w.readings) * 100 : 0
    }));
  }, [workers]);

  // Sort by Bayesian Adjusted Ratio to get the true best performer taking readings volume into account
  const sorted = useMemo(() => {
    const K = 2000;
    const baseTargetRatio = targetRatio / 100;
    
    return [...exactWorkers].sort((a, b) => {
      const adjA = ((a.impediments + K * baseTargetRatio) / (a.readings + K)) * 100;
      const adjB = ((b.impediments + K * baseTargetRatio) / (b.readings + K)) * 100;
      
      if (adjA !== adjB) return adjA - adjB;
      return b.readings - a.readings;
    });
  }, [exactWorkers, targetRatio]);

  const bestPerformer = sorted[0];

  const totalReadings = useMemo(() => exactWorkers.reduce((sum, w) => sum + w.readings, 0), [exactWorkers]);
  const totalImpediments = useMemo(() => exactWorkers.reduce((sum, w) => sum + w.impediments, 0), [exactWorkers]);
  
  const globalRatio = totalReadings > 0 
    ? (totalImpediments / totalReadings) * 100 
    : 0;

  const workersInGoal = useMemo(() => exactWorkers.filter(w => w.ratio <= targetRatio), [exactWorkers, targetRatio]);
  const goalAchievementRate = exactWorkers.length > 0 
    ? (workersInGoal.length / exactWorkers.length) * 100 
    : 0;

  return (
    <div id="stats-overview-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {/* 1st Place */}
      <motion.div
        id="stat-card-best"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32"
      >
        <div className="absolute right-2 top-2 text-amber-500 opacity-20">
          <Award size={72} />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">1º Lugar Geral</span>
          <h3 className="text-lg font-bold text-amber-900 truncate mt-1">
            {bestPerformer ? bestPerformer.name : 'Nenhum'}
          </h3>
        </div>
        <div className="flex items-baseline gap-2 mt-2">
          <span className="text-2xl font-black text-amber-800">
            {bestPerformer ? bestPerformer.ratio.toFixed(2) : '0,00'}%
          </span>
          <span className="text-xs font-medium text-amber-600">
            ({bestPerformer ? bestPerformer.impediments : 0} imp.)
          </span>
        </div>
      </motion.div>

      {/* Total Readings */}
      <motion.div
        id="stat-card-readings"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32"
      >
        <div className="absolute right-2 top-2 text-blue-500 opacity-10">
          <Eye size={72} />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Leituras Totais</span>
          <h3 className="text-2xl font-black text-slate-800 mt-2">
            {totalReadings.toLocaleString('pt-BR')}
          </h3>
        </div>
        <div className="text-xs font-medium text-blue-600 mt-2">
          Média: {workers.length > 0 ? Math.round(totalReadings / workers.length).toLocaleString('pt-BR') : 0} por colab.
        </div>
      </motion.div>

      {/* Total Impediments */}
      <motion.div
        id="stat-card-impediments"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32"
      >
        <div className="absolute right-2 top-2 text-rose-500 opacity-10">
          <AlertTriangle size={72} />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Impedimentos Totais</span>
          <h3 className="text-2xl font-black text-slate-800 mt-2">
            {totalImpediments.toLocaleString('pt-BR')}
          </h3>
        </div>
        <div className="text-xs font-medium text-rose-600 mt-2">
          Média: {workers.length > 0 ? (totalImpediments / workers.length).toFixed(1) : 0} por colab.
        </div>
      </motion.div>

      {/* Global Ratio */}
      <motion.div
        id="stat-card-global-ratio"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32"
      >
        <div className="absolute right-2 top-2 text-indigo-500 opacity-10">
          <Percent size={72} />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Relação Global</span>
          <h3 className="text-2xl font-black text-slate-800 mt-2">
            {globalRatio.toFixed(2)}%
          </h3>
        </div>
        <div className="text-xs font-medium text-indigo-600 mt-2">
          Meta Atual: <span className="font-bold">{targetRatio.toFixed(2)}%</span>
        </div>
      </motion.div>

      {/* Goal Achievement */}
      <motion.div
        id="stat-card-achievement"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm relative overflow-hidden flex flex-col justify-between h-32"
      >
        <div className="absolute right-2 top-2 text-emerald-500 opacity-10">
          <CheckCircle2 size={72} />
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Aproveitamento</span>
          <h3 className="text-2xl font-black text-emerald-600 mt-2">
            {goalAchievementRate.toFixed(1)}%
          </h3>
        </div>
        <div className="text-xs font-medium text-slate-600 mt-2">
          <span className="font-bold text-emerald-600">{workersInGoal.length}</span> de {workers.length} dentro da meta
        </div>
      </motion.div>
    </div>
  );
}
