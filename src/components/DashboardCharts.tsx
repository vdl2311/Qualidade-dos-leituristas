import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { WorkerData } from '../types';
import { Award, ShieldAlert, BarChart3, PieChart } from 'lucide-react';

interface DashboardChartsProps {
  workers: WorkerData[];
  targetRatio: number;
}

export default function DashboardCharts({ workers, targetRatio }: DashboardChartsProps) {
  // Normalize workers with exact dynamic float ratio
  const exactWorkers = useMemo(() => {
    return workers.map(w => ({
      ...w,
      ratio: w.readings > 0 ? (w.impediments / w.readings) * 100 : 0
    }));
  }, [workers]);

  // 1. Sort workers to get top 5 (lowest ratio) and worst 5 (highest ratio) using Bayesian Adjusted Ratio
  const sortedByRatio = useMemo(() => {
    const K = 2000;
    const baseTargetRatio = targetRatio / 100;

    return [...exactWorkers].sort((a, b) => {
      const adjA = ((a.impediments + K * baseTargetRatio) / (a.readings + K)) * 100;
      const adjB = ((b.impediments + K * baseTargetRatio) / (b.readings + K)) * 100;
      
      if (adjA !== adjB) return adjA - adjB;
      return b.readings - a.readings;
    });
  }, [exactWorkers, targetRatio]);

  const top5 = useMemo(() => sortedByRatio.slice(0, 5), [sortedByRatio]);
  const worst5 = useMemo(() => [...sortedByRatio].reverse().slice(0, 5), [sortedByRatio]);

  // 2. Calculate percentages of in vs out of goal
  const inGoal = useMemo(() => exactWorkers.filter(w => w.ratio <= targetRatio).length, [exactWorkers, targetRatio]);
  const outGoal = useMemo(() => exactWorkers.length - inGoal, [exactWorkers, inGoal]);
  const inGoalPercent = exactWorkers.length > 0 ? (inGoal / exactWorkers.length) * 100 : 0;
  const outGoalPercent = exactWorkers.length > 0 ? (outGoal / exactWorkers.length) * 100 : 0;

  // 3. Leituras vs Impedimentos average per cohort
  const highVolume = useMemo(() => exactWorkers.filter(w => w.readings >= 6000), [exactWorkers]);
  const medVolume = useMemo(() => exactWorkers.filter(w => w.readings >= 3000 && w.readings < 6000), [exactWorkers]);
  const lowVolume = useMemo(() => exactWorkers.filter(w => w.readings < 3000), [exactWorkers]);

  const avgRatioHigh = useMemo(() => highVolume.length > 0 
    ? highVolume.reduce((sum, w) => sum + w.ratio, 0) / highVolume.length 
    : 0, [highVolume]);
  const avgRatioMed = useMemo(() => medVolume.length > 0 
    ? medVolume.reduce((sum, w) => sum + w.ratio, 0) / medVolume.length 
    : 0, [medVolume]);
  const avgRatioLow = useMemo(() => lowVolume.length > 0 
    ? lowVolume.reduce((sum, w) => sum + w.ratio, 0) / lowVolume.length 
    : 0, [lowVolume]);

  return (
    <div id="dashboard-charts-grid" className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      {/* Chart 1: Top 5 Melhores (Menor % Relação) */}
      <motion.div
        id="chart-top-performers"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
              <Award size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Top 5 - Menor Relação</h4>
              <p className="text-xs text-slate-500">Colaboradores mais eficientes (menores taxas)</p>
            </div>
          </div>

          <div className="space-y-4 my-2">
            {top5.map((worker, idx) => {
              // Find max ratio to set progress bar scale, default to targetRatio if tiny
              const maxVal = Math.max(...top5.map(w => w.ratio), targetRatio, 0.5);
              const progressWidth = maxVal > 0 ? (worker.ratio / maxVal) * 100 : 0;
              
              return (
                <div key={worker.id} id={`top-worker-${worker.id}`} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700 truncate max-w-[200px]">
                      {idx + 1}º. {worker.name}
                    </span>
                    <span className="font-bold text-slate-900">{worker.ratio.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(progressWidth, 3)}%` }}
                      transition={{ duration: 0.8, delay: idx * 0.05 }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{worker.readings} leituras</span>
                    <span>{worker.impediments} impedimentos</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      {/* Chart 2: Distribuicão de Metas */}
      <motion.div
        id="chart-goal-distribution"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <PieChart size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Distribuição da Meta</h4>
              <p className="text-xs text-slate-500">Divisão dos colaboradores com base na meta de {targetRatio.toFixed(2)}%</p>
            </div>
          </div>

          {/* Ring Donut Visualization */}
          <div className="flex justify-center items-center my-6 relative h-32">
            <svg width="140" height="140" viewBox="0 0 36 36" className="transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="3.5"
              />
              {/* "Dentro da Meta" segment (Emerald) */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#10b981"
                strokeWidth="3.5"
                strokeDasharray={`${inGoalPercent} ${100 - inGoalPercent}`}
                strokeDashoffset="0"
              />
              {/* "Fora da Meta" segment (Rose) */}
              <circle
                cx="18"
                cy="18"
                r="15.915"
                fill="none"
                stroke="#f43f5e"
                strokeWidth="3.5"
                strokeDasharray={`${outGoalPercent} ${100 - outGoalPercent}`}
                strokeDashoffset={-inGoalPercent}
              />
            </svg>
            <div className="absolute text-center">
              <span className="block text-2xl font-black text-slate-800">{inGoalPercent.toFixed(0)}%</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Dentro da Meta</span>
            </div>
          </div>

          {/* Legend */}
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100">
              <div className="text-xs text-emerald-800 font-bold">Dentro da Meta</div>
              <div className="text-lg font-black text-emerald-600">{inGoal}</div>
              <div className="text-[10px] text-emerald-600 font-medium">({inGoalPercent.toFixed(1)}%)</div>
            </div>
            <div className="bg-rose-50 p-2 rounded-xl border border-rose-100">
              <div className="text-xs text-rose-800 font-bold">Fora da Meta</div>
              <div className="text-lg font-black text-rose-500">{outGoal}</div>
              <div className="text-[10px] text-rose-500 font-medium">({outGoalPercent.toFixed(1)}%)</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Chart 3: Cohortes de Volume de Leituras */}
      <motion.div
        id="chart-cohorts-performance"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
              <BarChart3 size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-800">Desempenho por Volume</h4>
              <p className="text-xs text-slate-500">Média de Impedimentos por faixa de Leituras</p>
            </div>
          </div>

          <div className="space-y-4 my-4">
            {/* Cohort 1: Alta Produtividade */}
            <div id="cohort-high" className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Alta Produtividade (≥ 6.000)</span>
                <span className="font-bold text-slate-900">{avgRatioHigh.toFixed(2)}% de taxa</span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex items-center px-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(avgRatioHigh * 40, 100)}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-2 bg-indigo-500 rounded"
                />
              </div>
              <div className="text-[10px] text-slate-400">
                {highVolume.length} colaboradores nesta categoria
              </div>
            </div>

            {/* Cohort 2: Média Produtividade */}
            <div id="cohort-medium" className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Média Produtividade (3.000 - 5.999)</span>
                <span className="font-bold text-slate-900">{avgRatioMed.toFixed(2)}% de taxa</span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex items-center px-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(avgRatioMed * 40, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.1 }}
                  className="h-2 bg-indigo-400 rounded"
                />
              </div>
              <div className="text-[10px] text-slate-400">
                {medVolume.length} colaboradores nesta categoria
              </div>
            </div>

            {/* Cohort 3: Baixa Produtividade */}
            <div id="cohort-low" className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Baixa Produtividade (&lt; 3.000)</span>
                <span className="font-bold text-slate-900">{avgRatioLow.toFixed(2)}% de taxa</span>
              </div>
              <div className="h-4 w-full bg-slate-100 rounded-lg overflow-hidden flex items-center px-1">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(avgRatioLow * 40, 100)}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className="h-2 bg-rose-400 rounded"
                />
              </div>
              <div className="text-[10px] text-slate-400">
                {lowVolume.length} colaboradores nesta categoria
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
