import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, BarChart2, Clock } from 'lucide-react';
import { WorkerData, Settings } from './types';
import { initialWorkers } from './initialData';

// Component imports
import StatsOverview from './components/StatsOverview';
import RankingTable from './components/RankingTable';
import DashboardCharts from './components/DashboardCharts';

export default function App() {
  // 1. Core Persistent State
  const [workers, setWorkers] = useState<WorkerData[]>([]);
  const [settings] = useState<Settings>({ targetRatio: 0.50 });
  const [isLoaded, setIsLoaded] = useState(false);

  // 2. Navigation Tab State
  const [activeTab, setActiveTab] = useState<'ranking' | 'charts'>('ranking');

  // 3. Load initial state on boot
  useEffect(() => {
    try {
      const storedWorkers = localStorage.getItem('rankdash_workers_v1');
      if (storedWorkers) {
        setWorkers(JSON.parse(storedWorkers));
      } else {
        setWorkers(initialWorkers);
        localStorage.setItem('rankdash_workers_v1', JSON.stringify(initialWorkers));
      }
    } catch (e) {
      console.error('Error loading data from localStorage', e);
      setWorkers(initialWorkers);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  if (!isLoaded) {
    return (
      <div id="loading-fallback" className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center space-y-4">
          <img
            src="/src/assets/images/radar_logo_1782608579304.jpg"
            alt="Radar do Leiturista Logo"
            className="w-16 h-16 rounded-2xl mx-auto shadow-md border border-slate-100 object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-500 font-medium">Carregando Radar do Leiturista...</p>
        </div>
      </div>
    );
  }

  return (
    <div id="app-root-container" className="min-h-screen bg-slate-50/50 pb-16 font-sans">
      {/* Top Header Navigation Panel */}
      <header id="app-main-header" className="bg-white border-b border-slate-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between py-4 md:py-0 md:h-16 gap-4">
            {/* Logo and Brand */}
            <div className="flex items-center justify-between w-full md:w-auto">
              <div className="flex items-center gap-3">
                <img
                  src="/src/assets/images/radar_logo_1782608579304.jpg"
                  alt="Radar do Leiturista Logo"
                  className="w-10 h-10 rounded-xl shadow-md border border-slate-100 object-cover"
                  referrerPolicy="no-referrer"
                />
                <div>
                  <span className="block text-base font-black text-slate-800 tracking-tight font-display">
                    Radar do Leiturista
                  </span>
                  <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    Onde sua evolução acontece
                  </span>
                </div>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <nav id="header-nav-tabs" className="flex w-full md:w-auto bg-slate-100 p-1 rounded-xl overflow-x-auto scrollbar-none">
              <button
                id="tab-btn-ranking"
                onClick={() => setActiveTab('ranking')}
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
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
                className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  activeTab === 'charts' 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <BarChart2 size={14} />
                <span>Estatísticas</span>
              </button>
            </nav>

            {/* Live Clock & Info */}
            <div className="hidden md:flex items-center gap-4 text-xs font-medium text-slate-400">
              <div className="flex items-center gap-1">
                <Clock size={13} />
                <span>13:00 UTC</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body Grid */}
      <main id="app-main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Metric widgets */}
        <StatsOverview workers={workers} targetRatio={settings.targetRatio} />

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
                workers={workers} 
                targetRatio={settings.targetRatio} 
                isAdminMode={false}
              />
            )}

            {activeTab === 'charts' && (
              <DashboardCharts 
                workers={workers} 
                targetRatio={settings.targetRatio} 
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
