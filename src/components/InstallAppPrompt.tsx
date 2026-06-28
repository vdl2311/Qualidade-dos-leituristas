import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Download, Smartphone, X, Share, Plus, ChevronRight, CheckCircle } from 'lucide-react';

export default function InstallAppPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showiOSModal, setShowiOSModal] = useState(false);

  useEffect(() => {
    // 1. Check if already running in standalone mode (installed)
    const isStandaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (navigator as any).standalone === true;
    
    setIsStandalone(isStandaloneMode);

    // 2. Check platform
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    // 3. If already dismissed in this session, don't show automatically
    const isDismissed = sessionStorage.getItem('pwa-prompt-dismissed') === 'true';

    // 4. Handle beforeinstallprompt event for Android / Chrome / Edge
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      if (!isStandaloneMode && !isDismissed) {
        setShowBanner(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 5. For iOS, we can show the custom install prompt automatically after 4 seconds
    // if not in standalone and not dismissed
    if (isIosDevice && !isStandaloneMode && !isDismissed) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 4000);
      return () => clearTimeout(timer);
    }

    // Fallback: If on mobile Chrome/Firefox/etc. and beforeinstallprompt didn't trigger, 
    // but we want to let them know it can be installed, we can show it as well after some time
    if (!isIosDevice && !isStandaloneMode && !isDismissed && !deferredPrompt) {
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 8000);
      return () => clearTimeout(timer);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [deferredPrompt]);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowiOSModal(true);
      return;
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } else {
      // General prompt guidance for other browsers
      setShowiOSModal(true);
    }
  };

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
    setShowBanner(false);
  };

  // If already installed, don't show anything
  if (isStandalone) return null;

  return (
    <>
      {/* Floating Installation Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-45 bg-white border border-slate-150 rounded-2xl p-4 shadow-2xl flex items-center gap-4"
          >
            {/* App Icon */}
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-md shadow-indigo-600/20 relative overflow-hidden">
              {/* Radar Logo SVG or fallback */}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="w-8 h-8 fill-white">
                <circle cx="256" cy="256" r="180" fill="none" stroke="#ffffff" strokeWidth="24" strokeOpacity="0.3" strokeDasharray="20, 20" />
                <circle cx="256" cy="256" r="130" fill="none" stroke="#ffffff" strokeWidth="28" strokeOpacity="0.7" />
                <circle cx="256" cy="256" r="60" fill="none" stroke="#ffffff" strokeWidth="32" />
                <line x1="256" y1="256" x2="380" y2="132" stroke="#ffffff" strokeWidth="32" strokeLinecap="round" />
                <circle cx="256" cy="256" r="16" fill="#ffffff" />
              </svg>
            </div>

            {/* Content info */}
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-bold text-slate-800 leading-tight">Radar do Leiturista</h4>
              <p className="text-xs text-slate-500 truncate mt-0.5">Instale no celular para acessar mais rápido!</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleInstallClick}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-colors flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download size={14} />
                <span>Instalar</span>
              </button>
              
              <button
                onClick={handleDismiss}
                className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-xl transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Installation Instruction Modal (for iOS / Safari or other browser custom prompt) */}
      <AnimatePresence>
        {showiOSModal && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-100"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <Smartphone className="text-indigo-600" size={20} />
                  <h3 className="text-base font-extrabold text-slate-800">Como instalar no Celular</h3>
                </div>
                <button
                  onClick={() => setShowiOSModal(false)}
                  className="p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {isIOS ? (
                /* iOS Safari instructions */
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Siga os passos abaixo no navegador <strong className="text-slate-800">Safari</strong> do seu iPhone para adicionar à tela inicial:
                  </p>

                  <div className="space-y-3.5 mt-2">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Toque no botão de <strong className="text-slate-800">Compartilhar</strong> no menu inferior do Safari.
                        <div className="flex items-center gap-1.5 mt-1 bg-slate-50 border border-slate-100 p-2 rounded-xl text-[11px] font-semibold text-slate-700 w-fit">
                          <Share size={14} className="text-indigo-600" />
                          <span>Ícone de Compartilhar</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Role a lista de opções para baixo e selecione <strong className="text-slate-800">"Adicionar à Tela de Início"</strong>.
                        <div className="flex items-center gap-1.5 mt-1 bg-slate-50 border border-slate-100 p-2 rounded-xl text-[11px] font-semibold text-slate-700 w-fit">
                          <Plus size={14} className="text-indigo-600" />
                          <span>Adicionar à Tela de Início</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Toque em <strong className="text-slate-800">"Adicionar"</strong> no canto superior direito para confirmar. O aplicativo aparecerá na sua tela de aplicativos como um App nativo!
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Chrome/Android general instructions when deferredPrompt is not available */
                <div className="space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Siga os passos abaixo no seu navegador para instalar o aplicativo:
                  </p>

                  <div className="space-y-3.5 mt-2">
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        1
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Abra o menu do navegador clicando nos <strong className="text-slate-800">três pontinhos (⋮)</strong> no canto superior direito.
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        2
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Procure e toque em <strong className="text-slate-800">"Instalar aplicativo"</strong> ou <strong className="text-slate-800">"Adicionar à tela inicial"</strong>.
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                        3
                      </div>
                      <div className="text-xs text-slate-600 leading-relaxed">
                        Confirme a instalação e pronto! O ícone do aplicativo estará disponível na tela do seu celular.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <button
                onClick={() => setShowiOSModal(false)}
                className="w-full mt-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/10 transition-colors"
              >
                Entendi
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
