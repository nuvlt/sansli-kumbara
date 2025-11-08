// App.jsx - API ile entegre frontend (SES EFEKTLİ + YENİ LOGO)
import React, { useState, useEffect, useRef } from 'react';
import { Clock, Trophy, Coins, Users, TrendingUp, History, X, Volume2, VolumeX } from 'lucide-react';

// API Configuration
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const PLATFORM_API_KEY = import.meta.env.VITE_PLATFORM_API_KEY || 'YOUR_PLATFORM_API_KEY';

export default function LuckyPiggyBank() {
  const [gameState, setGameState] = useState(null);
  const [userBalance, setUserBalance] = useState(0);
  const [token, setToken] = useState(null);
  const [userName, setUserName] = useState('');
  const [inputAmount, setInputAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState({ hours: 0, minutes: 0, seconds: 0 });
  const [myTickets, setMyTickets] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWinner, setShowWinner] = useState(false);
  const [winnerData, setWinnerData] = useState(null);
  const [showNameInput, setShowNameInput] = useState(true);
  const [error, setError] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Audio refs
  const coinSoundRef = useRef(null);
  const winSoundRef = useRef(null);

  // Create audio elements
  useEffect(() => {
    // Coin drop sound
    const coinAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    coinSoundRef.current = () => {
      if (!soundEnabled) return;
      try {
        const oscillator = coinAudioContext.createOscillator();
        const gainNode = coinAudioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(coinAudioContext.destination);
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.3, coinAudioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, coinAudioContext.currentTime + 0.1);
        oscillator.start(coinAudioContext.currentTime);
        oscillator.stop(coinAudioContext.currentTime + 0.1);
      } catch (e) {
        console.log('Audio error:', e);
      }
    };

    // Win sound
    winSoundRef.current = () => {
      if (!soundEnabled) return;
      try {
        const winAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        [523, 659, 784, 1047].forEach((freq, i) => {
          setTimeout(() => {
            const oscillator = winAudioContext.createOscillator();
            const gainNode = winAudioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(winAudioContext.destination);
            oscillator.frequency.value = freq;
            oscillator.type = 'sine';
            gainNode.gain.setValueAtTime(0.3, winAudioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, winAudioContext.currentTime + 0.3);
            oscillator.start(winAudioContext.currentTime);
            oscillator.stop(winAudioContext.currentTime + 0.3);
          }, i * 100);
        });
      } catch (e) {
        console.log('Audio error:', e);
      }
    };
  }, [soundEnabled]);

  // Initialize
  useEffect(() => {
    const savedToken = localStorage.getItem('luckypiggy_token');
    const savedName = localStorage.getItem('luckypiggy_username');
    
    if (savedToken && savedName) {
      setToken(savedToken);
      setUserName(savedName);
      setShowNameInput(false);
      loadGameData(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  // API: Login
  const handleLogin = async () => {
    if (!userName.trim()) {
      setError('Lütfen isminizi girin');
      return;
    }

    try {
      setLoading(true);
      const userId = localStorage.getItem('luckypiggy_userid') || 
                     'user_' + Math.random().toString(36).substr(2, 9);
      
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': PLATFORM_API_KEY
        },
        body: JSON.stringify({
          externalUserId: userId,
          username: userName.trim(),
          balance: 500
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Login başarısız');
      }

      localStorage.setItem('luckypiggy_token', data.token);
      localStorage.setItem('luckypiggy_username', userName.trim());
      localStorage.setItem('luckypiggy_userid', userId);

      setToken(data.token);
      setUserBalance(data.user.balance);
      setShowNameInput(false);
      
      await loadGameData(data.token);
    } catch (error) {
      console.error('Login error:', error);
      setError('Giriş yapılamadı: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // API: Load Game Data
  const loadGameData = async (userToken) => {
    try {
      const [gameResponse, historyResponse] = await Promise.all([
        fetch(`${API_URL}/api/game/current`, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        }),
        fetch(`${API_URL}/api/game/history`, {
          headers: { 'Authorization': `Bearer ${userToken}` }
        })
      ]);

      const gameData = await gameResponse.json();
      const historyData = await historyResponse.json();

      if (gameData.success) {
        setGameState(gameData.game);
        setMyTickets(gameData.game.myTickets);
        setUserBalance(gameData.userBalance);
      }

      if (historyData.success) {
        setHistory(historyData.history);
        
        // Check for new winner
        if (historyData.history.length > 0) {
          const latestWinner = historyData.history[0];
          const lastShownWinner = localStorage.getItem('last_shown_winner');
          if (lastShownWinner !== String(latestWinner.gameId)) {
            setWinnerData(latestWinner);
            setShowWinner(true);
            if (winSoundRef.current) winSoundRef.current();
            localStorage.setItem('last_shown_winner', latestWinner.gameId);
            setTimeout(() => setShowWinner(false), 10000);
          }
        }
      }

      setLoading(false);
    } catch (error) {
      console.error('Load game error:', error);
      setError('Oyun verileri yüklenemedi');
      setLoading(false);
    }
  };

  // API: Make Deposit
  const handleDeposit = async () => {
    if (inputAmount <= 0 || inputAmount > userBalance) {
      setError('Geçersiz miktar!');
      return;
    }

    try {
      // Play coin sound
      if (coinSoundRef.current) coinSoundRef.current();

      const response = await fetch(`${API_URL}/api/game/deposit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: inputAmount })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'İşlem başarısız');
      }

      setUserBalance(data.newBalance);
      setMyTickets(prev => prev + data.deposit.tickets);
      setInputAmount(0);

      await loadGameData(token);

    } catch (error) {
      console.error('Deposit error:', error);
      setError('Para yatırma başarısız: ' + error.message);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (!gameState) return;

    const updateTimer = () => {
      const now = Date.now();
      const endTime = new Date(gameState.endTime).getTime();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        if (token) loadGameData(token);
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ hours, minutes, seconds });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [gameState, token]);

  // Auto refresh game state
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      loadGameData(token);
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  const quickAdd = (amount) => {
    setInputAmount(prev => Math.min(prev + amount, userBalance));
  };

  const formatTime = (time) => String(time).padStart(2, '0');

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-yellow-400 text-2xl font-bold">Yükleniyor...</div>
      </div>
    );
  }

  if (showNameInput) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
        <div className="bg-slate-800 rounded-3xl shadow-2xl border-4 border-yellow-500 p-8 max-w-md w-full">
          <h2 className="text-3xl font-bold text-yellow-400 text-center mb-6">Hoş Geldiniz!</h2>
          <p className="text-slate-300 text-center mb-6">Oyuna başlamak için isminizi girin:</p>
          
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4">
              <p className="text-red-300 text-sm text-center">{error}</p>
            </div>
          )}

          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="İsminiz"
            className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border-2 border-slate-700 focus:border-yellow-500 outline-none mb-4"
            maxLength={20}
          />
          <button
            onClick={handleLogin}
            disabled={!userName.trim()}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 disabled:from-slate-700 disabled:to-slate-700 text-slate-900 disabled:text-slate-500 font-bold text-xl py-3 rounded-xl transition-all transform hover:scale-105 disabled:cursor-not-allowed"
          >
            Başla
          </button>

          <div className="mt-6 p-4 bg-blue-900/30 rounded-xl border border-blue-500/50">
            <p className="text-blue-300 text-sm text-center">
              🎮 Bu gerçek bir API ile çalışan demo'dur
            </p>
            <p className="text-blue-400 text-xs text-center mt-1">
              Başlangıç bakiyeniz: ₺500
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Sound Toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="fixed top-4 right-4 bg-slate-800 hover:bg-slate-700 text-yellow-400 p-3 rounded-full border border-slate-700 transition-colors z-50"
          title={soundEnabled ? 'Sesi Kapat' : 'Sesi Aç'}
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* Error Message */}
        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500 rounded-2xl p-4">
            <p className="text-red-300 text-center">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-red-400 text-sm mx-auto block mt-2 hover:text-red-300"
            >
              Kapat
            </button>
          </div>
        )}

        {/* Winner Announcement */}
        {showWinner && winnerData && (
          <div className="mb-4 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-2xl p-4 animate-bounce shadow-2xl">
            <div className="text-slate-900 text-center">
              <Trophy className="w-12 h-12 mx-auto mb-2" />
              <div className="text-2xl font-black mb-1">🎉 KAZANAN 🎉</div>
              <div className="text-xl font-bold">{winnerData.winner}</div>
              <div className="text-3xl font-black mt-2">₺{winnerData.prize.toFixed(2)}</div>
            </div>
          </div>
        )}

        {/* User Info Bar */}
        <div className="bg-slate-800 rounded-2xl p-4 mb-4 border border-slate-700 flex justify-between items-center">
          <div>
            <div className="text-slate-400 text-sm">Hoş geldin,</div>
            <div className="text-yellow-400 font-bold text-lg">{userName}</div>
          </div>
          <div>
            <div className="text-slate-400 text-sm text-right">Bakiyeniz</div>
            <div className="text-white font-bold text-xl">₺{userBalance.toFixed(2)}</div>
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-gradient-to-b from-slate-800 to-slate-900 rounded-3xl shadow-2xl border-4 border-yellow-500 overflow-hidden">
          {/* Header with animated piggy bank */}
          <div className="relative bg-gradient-to-b from-slate-800 to-slate-900 p-6 pb-12 overflow-hidden">
            {/* Falling coins animation */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full border-2 border-yellow-300 flex items-center justify-center font-bold text-slate-900 text-sm"
                  style={{
                    left: `${15 + i * 10}%`,
                    top: `-20px`,
                    animation: `fall ${3 + i * 0.3}s ease-in infinite`,
                    animationDelay: `${i * 0.5}s`,
                    opacity: 0.8,
                    transform: `rotate(${i * 45}deg)`
                  }}
                >
                  ₺
                </div>
              ))}
            </div>

            {/* Piggy Bank Icon */}
            <div className="relative z-10 mb-4">
              <div className="w-32 h-32 mx-auto bg-gradient-to-br from-yellow-500 via-yellow-400 to-amber-500 rounded-full flex items-center justify-center shadow-2xl border-4 border-yellow-300 relative overflow-hidden">
                <div className="absolute top-8 w-16 h-2 bg-slate-900 rounded-full"></div>
                
                <div className="relative">
                  <div className="flex gap-4 mb-2">
                    <div className="w-3 h-3 bg-slate-900 rounded-full"></div>
                    <div className="w-3 h-3 bg-slate-900 rounded-full"></div>
                  </div>
                  <div className="w-8 h-4 border-b-2 border-slate-900 rounded-full mx-auto"></div>
                </div>

                <div className="absolute top-4 right-4 w-3 h-3 bg-white rounded-full animate-ping"></div>
                <div className="absolute bottom-6 left-6 w-2 h-2 bg-white rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
              </div>
              
              <div className="flex justify-center gap-1 mt-3">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full border-2 border-yellow-300 flex items-center justify-center font-bold text-slate-900"
                    style={{
                      transform: `translateY(${i * 2}px) rotate(${-10 + i * 5}deg)`,
                      zIndex: 5 - i
                    }}
                  >
                    ₺
                  </div>
                ))}
              </div>
            </div>

            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-yellow-600 text-center">
              ŞANSLI KUMBARA
            </h1>

            <style>{`
              @keyframes fall {
                0% {
                  transform: translateY(-20px) rotate(0deg);
                  opacity: 0;
                }
                10% {
                  opacity: 0.8;
                }
                90% {
                  opacity: 0.8;
                }
                100% {
                  transform: translateY(300px) rotate(360deg);
                  opacity: 0;
                }
              }
            `}</style>
          </div>

          {/* Prize Pool */}
          <div className="bg-slate-900/50 mx-4 rounded-2xl border-4 border-yellow-500 p-6 mb-4 shadow-inner">
            <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-500 text-center mb-2 drop-shadow-lg">
              ₺{gameState?.prizePool.toFixed(2) || '0.00'}
            </div>
            <div className="text-yellow-400 text-center text-sm font-semibold">ÖDÜL HAVUZU</div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 px-4 mb-4">
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <Users className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-yellow-400 text-xs text-center">Katılımcı</div>
              <div className="text-white font-bold text-center text-lg">
                {gameState?.participants || 0}
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <Coins className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-yellow-400 text-xs text-center">Biletlerim</div>
              <div className="text-white font-bold text-center text-lg">
                {myTickets.toLocaleString('tr-TR')}
              </div>
            </div>
            <div className="bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <TrendingUp className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
              <div className="text-yellow-400 text-xs text-center">T. Bilet</div>
              <div className="text-white font-bold text-center text-lg">
                {gameState?.totalTickets.toLocaleString('tr-TR') || 0}
              </div>
            </div>
          </div>

          {/* Quick Amount Buttons */}
          <div className="grid grid-cols-3 gap-3 px-4 mb-4">
            {[20, 50, 100].map(amount => (
              <button
                key={amount}
                onClick={() => quickAdd(amount)}
                disabled={amount > userBalance}
                className="bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 border-2 border-slate-700 hover:border-yellow-500 disabled:border-slate-800 rounded-xl py-3 text-yellow-400 disabled:text-slate-600 font-bold text-xl transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
              >
                {amount}₺
              </button>
            ))}
          </div>

          {/* Amount Input */}
          <div className="px-4 mb-4">
            <div className="bg-slate-800 rounded-xl p-4 border-2 border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setInputAmount(userBalance)}
                  className="bg-slate-900 hover:bg-slate-700 text-yellow-400 font-bold px-4 py-2 rounded-lg transition-colors"
                >
                  Tümü
                </button>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={inputAmount || ''}
                    onChange={(e) => setInputAmount(Math.min(Math.max(0, parseFloat(e.target.value) || 0), userBalance))}
                    placeholder="0.00"
                    className="bg-slate-900 text-yellow-400 text-2xl font-bold w-32 text-center rounded-lg py-2 border-2 border-slate-700 focus:border-yellow-500 outline-none"
                    step="0.01"
                    min="0"
                    max={userBalance}
                  />
                  <span className="text-yellow-400 text-2xl font-bold">₺</span>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => setInputAmount(prev => Math.min(prev + 1, userBalance))}
                    className="bg-slate-900 hover:bg-slate-700 text-yellow-400 font-bold w-8 h-8 rounded flex items-center justify-center text-xl transition-colors"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setInputAmount(prev => Math.max(0, prev - 1))}
                    className="bg-slate-900 hover:bg-slate-700 text-yellow-400 font-bold w-8 h-8 rounded flex items-center justify-center text-xl transition-colors"
                  >
                    -
                  </button>
                </div>
              </div>
              {inputAmount > 0 && (
                <div className="text-yellow-400 text-sm text-center">
                  ≈ {Math.floor(inputAmount * 100).toLocaleString('tr-TR')} Bilet
                </div>
              )}
            </div>
          </div>

          {/* Deposit Button */}
          <div className="px-4 mb-6">
            <button
              onClick={handleDeposit}
              disabled={inputAmount <= 0 || inputAmount > userBalance}
              className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 disabled:from-slate-700 disabled:to-slate-700 text-slate-900 disabled:text-slate-500 font-black text-2xl py-4 rounded-2xl shadow-lg transition-all transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed"
            >
              AT
            </button>
          </div>

          {/* Countdown */}
          <div className="bg-slate-900/80 py-4 px-4 border-t-2 border-slate-700">
            <div className="flex items-center justify-center gap-3">
              <Clock className="w-6 h-6 text-yellow-400" />
              <div>
                <div className="text-yellow-400 text-sm font-semibold">Kalan Süre:</div>
                <div className="text-white text-2xl font-black">
                  {formatTime(timeLeft.hours)}:{formatTime(timeLeft.minutes)}:{formatTime(timeLeft.seconds)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* History Button */}
        <button
          onClick={() => setShowHistory(true)}
          className="mt-4 w-full bg-slate-800 hover:bg-slate-700 text-yellow-400 font-bold py-3 rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-colors"
        >
          <History className="w-5 h-5" />
          Geçmiş Kazananlar
        </button>

        {/* Info Box */}
        <div className="mt-4 bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <h3 className="text-yellow-400 font-bold mb-2 flex items-center gap-2">
            <Trophy className="w-5 h-5" />
            Nasıl Çalışır?
          </h3>
          <ul className="text-slate-300 text-sm space-y-2">
            <li>• Her 0.01₺ = 1 bilet</li>
            <li>• Yatırdığınız tutarın %60'ı havuza eklenir</li>
            <li>• %5 sonraki havuz için ayrılır</li>
            <li>• 3 gün sonunda rastgele bir bilet çekilir</li>
            <li>• Kazanan tüm havuzu alır!</li>
          </ul>
        </div>

        {/* API Status */}
        <div className="mt-4 bg-green-900/30 border border-green-500/50 rounded-xl p-3 text-center">
          <p className="text-green-300 text-sm font-semibold">
            🔗 Backend API Bağlantılı
          </p>
          <p className="text-green-400 text-xs mt-1">
            Gerçek zamanlı veri senkronizasyonu aktif
          </p>
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden border-2 border-yellow-500">
            <div className="bg-slate-900 p-4 flex justify-between items-center border-b border-slate-700">
              <h2 className="text-yellow-400 font-bold text-xl">Geçmiş Kazananlar</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <p className="text-slate-400 text-center py-8">Henüz kazanan yok</p>
              ) : (
                <div className="space-y-3">
                  {history.map((entry, idx) => (
                    <div key={idx} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-yellow-400" />
                          <span className="text-white font-bold">{entry.winner}</span>
                        </div>
                        <span className="text-yellow-400 font-bold">₺{entry.prize.toFixed(2)}</span>
                      </div>
                      <div className="text-slate-400 text-sm">
                        {entry.totalTickets.toLocaleString('tr-TR')} bilet
                      </div>
                      <div className="text-slate-500 text-xs mt-1">
                        {new Date(entry.endTime).toLocaleString('tr-TR')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
