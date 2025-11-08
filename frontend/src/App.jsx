import React, { useState, useEffect } from 'react';
import { Clock, Trophy, Coins, Users, TrendingUp, History, X } from 'lucide-react';

export default function LuckyPiggyBank() {
  const [gameState, setGameState] = useState(null);
  const [userBalance, setUserBalance] = useState(500);
  const [userId, setUserId] = useState(null);
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

  // Initialize or load game state
  useEffect(() => {
    initializeGame();
  }, []);

  const initializeGame = async () => {
    try {
      // Generate or get user ID
      let storedUserId = localStorage.getItem('luckypiggy_userid');
      if (!storedUserId) {
        storedUserId = 'user_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('luckypiggy_userid', storedUserId);
      }
      setUserId(storedUserId);

      // Get user name
      const storedName = localStorage.getItem('luckypiggy_username');
      if (storedName) {
        setUserName(storedName);
        setShowNameInput(false);
      }

      // Load game state
      const result = await window.storage.get('game_state', true);
      
      if (!result) {
        // Create new game
        await createNewGame();
      } else {
        const state = JSON.parse(result.value);
        setGameState(state);
        
        // Check if game ended
        if (Date.now() >= state.endTime) {
          await endGame(state);
        }
      }

      // Load user tickets
      await loadUserTickets(storedUserId);

      // Load history
      await loadHistory();

      setLoading(false);
    } catch (error) {
      console.error('Initialize error:', error);
      await createNewGame();
      setLoading(false);
    }
  };

  const createNewGame = async () => {
    const newGame = {
      id: 'game_' + Date.now(),
      startTime: Date.now(),
      endTime: Date.now() + (3 * 24 * 60 * 60 * 1000), // 3 days
      prizePool: 0,
      nextGameReserve: 0,
      totalTickets: 0,
      participants: 0,
      participantIds: []
    };

    await window.storage.set('game_state', JSON.stringify(newGame), true);
    setGameState(newGame);
  };

  const loadUserTickets = async (uid) => {
    try {
      if (!gameState) return;
      const result = await window.storage.get(`tickets_${gameState.id}_${uid}`);
      if (result) {
        setMyTickets(parseInt(result.value));
      } else {
        setMyTickets(0);
      }
    } catch (error) {
      setMyTickets(0);
    }
  };

  const loadHistory = async () => {
    try {
      const result = await window.storage.get('game_history', true);
      if (result) {
        setHistory(JSON.parse(result.value));
      }
    } catch (error) {
      setHistory([]);
    }
  };

  // Timer countdown
  useEffect(() => {
    if (!gameState) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = gameState.endTime - now;

      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0 });
        endGame(gameState);
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
  }, [gameState]);

  const endGame = async (state) => {
    if (state.totalTickets === 0) {
      // No participants, create new game
      await createNewGame();
      return;
    }

    // Pick winner
    const winningTicket = Math.floor(Math.random() * state.totalTickets);
    let currentTicket = 0;
    let winner = null;

    for (const participantId of state.participantIds) {
      try {
        const ticketResult = await window.storage.get(`tickets_${state.id}_${participantId}`);
        if (ticketResult) {
          const tickets = parseInt(ticketResult.value);
          if (winningTicket >= currentTicket && winningTicket < currentTicket + tickets) {
            winner = participantId;
            break;
          }
          currentTicket += tickets;
        }
      } catch (error) {
        console.error('Error checking tickets:', error);
      }
    }

    if (winner) {
      // Get winner name
      let winnerName = winner;
      try {
        const nameResult = await window.storage.get(`username_${winner}`, true);
        if (nameResult) {
          winnerName = JSON.parse(nameResult.value);
        }
      } catch (error) {
        console.error('Error getting winner name:', error);
      }

      // Save to history
      const historyEntry = {
        gameId: state.id,
        winner: winnerName,
        winnerId: winner,
        prize: state.prizePool,
        totalTickets: state.totalTickets,
        participants: state.participants,
        endTime: Date.now()
      };

      const currentHistory = [...history, historyEntry].slice(-10);
      await window.storage.set('game_history', JSON.stringify(currentHistory), true);
      setHistory(currentHistory);

      // Show winner
      setWinnerData(historyEntry);
      setShowWinner(true);

      setTimeout(() => setShowWinner(false), 10000);
    }

    // Create new game with reserve
    const newGame = {
      id: 'game_' + Date.now(),
      startTime: Date.now(),
      endTime: Date.now() + (3 * 24 * 60 * 60 * 1000),
      prizePool: state.nextGameReserve,
      nextGameReserve: 0,
      totalTickets: 0,
      participants: 0,
      participantIds: []
    };

    await window.storage.set('game_state', JSON.stringify(newGame), true);
    setGameState(newGame);
  };

  const handleDeposit = async () => {
    if (!userName.trim()) {
      alert('Lütfen önce isminizi girin!');
      return;
    }

    if (inputAmount <= 0 || inputAmount > userBalance) {
      alert('Geçersiz miktar!');
      return;
    }

    try {
      // Calculate tickets and amounts
      const tickets = Math.floor(inputAmount * 100);
      const toPool = inputAmount * 0.60;
      const toReserve = inputAmount * 0.05;

      // Update user balance
      setUserBalance(prev => prev - inputAmount);

      // Update game state
      const updatedState = {
        ...gameState,
        prizePool: gameState.prizePool + toPool,
        nextGameReserve: gameState.nextGameReserve + toReserve,
        totalTickets: gameState.totalTickets + tickets,
        participants: gameState.participantIds.includes(userId) 
          ? gameState.participants 
          : gameState.participants + 1,
        participantIds: gameState.participantIds.includes(userId)
          ? gameState.participantIds
          : [...gameState.participantIds, userId]
      };

      await window.storage.set('game_state', JSON.stringify(updatedState), true);
      setGameState(updatedState);

      // Update user tickets
      const newTicketCount = myTickets + tickets;
      await window.storage.set(`tickets_${gameState.id}_${userId}`, newTicketCount.toString());
      setMyTickets(newTicketCount);

      // Save username
      if (userName) {
        await window.storage.set(`username_${userId}`, JSON.stringify(userName), true);
      }

      setInputAmount(0);
    } catch (error) {
      console.error('Deposit error:', error);
      alert('İşlem başarısız oldu. Lütfen tekrar deneyin.');
    }
  };

  const quickAdd = (amount) => {
    setInputAmount(prev => Math.min(prev + amount, userBalance));
  };

  const formatTime = (time) => String(time).padStart(2, '0');

  const winChance = gameState && gameState.totalTickets > 0 && myTickets > 0
    ? ((myTickets / gameState.totalTickets) * 100).toFixed(2) 
    : 0;

  const handleNameSubmit = () => {
    if (userName.trim()) {
      localStorage.setItem('luckypiggy_username', userName.trim());
      setShowNameInput(false);
    }
  };

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
          <input
            type="text"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleNameSubmit()}
            placeholder="İsminiz"
            className="w-full bg-slate-900 text-white px-4 py-3 rounded-xl border-2 border-slate-700 focus:border-yellow-500 outline-none mb-4"
            maxLength={20}
          />
          <button
            onClick={handleNameSubmit}
            className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-slate-900 font-bold text-xl py-3 rounded-xl transition-all transform hover:scale-105"
          >
            Başla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Winner Announcement */}
        {showWinner && winnerData && (
          <div className="mb-4 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-2xl p-4 animate-pulse shadow-2xl">
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
                  className="absolute w-8 h-8 bg-gradient-to-br from-yellow-400 to-yellow-600 rounded-full border-2 border-yellow-300 flex items-center justify-center font-bold text-slate-900 text-sm animate-pulse"
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
                {/* Coin slot */}
                <div className="absolute top-8 w-16 h-2 bg-slate-900 rounded-full"></div>
                
                {/* Piggy face */}
                <div className="relative">
                  {/* Eyes */}
                  <div className="flex gap-4 mb-2">
                    <div className="w-3 h-3 bg-slate-900 rounded-full"></div>
                    <div className="w-3 h-3 bg-slate-900 rounded-full"></div>
                  </div>
                  {/* Smile */}
                  <div className="w-8 h-4 border-b-2 border-slate-900 rounded-full mx-auto"></div>
                </div>

                {/* Sparkle effect */}
                <div className="absolute top-4 right-4 w-3 h-3 bg-white rounded-full animate-ping"></div>
                <div className="absolute bottom-6 left-6 w-2 h-2 bg-white rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
              </div>
              
              {/* Coin stack below piggy */}
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
                className="bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 hover:border-yellow-500 rounded-xl py-3 text-yellow-400 font-bold text-xl transition-all transform hover:scale-105"
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
                    value={inputAmount}
                    onChange={(e) => setInputAmount(Math.min(Math.max(0, parseFloat(e.target.value) || 0), userBalance))}
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

        {/* Demo Notice */}
        <div className="mt-4 bg-blue-900/30 border border-blue-500/50 rounded-xl p-3 text-center">
          <p className="text-blue-300 text-sm font-semibold">
            🎮 Bu tam işlevsel bir DEMO'dur
          </p>
          <p className="text-blue-400 text-xs mt-1">
            Veriler tüm kullanıcılar arasında paylaşılır
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
                  {[...history].reverse().map((entry, idx) => (
                    <div key={idx} className="bg-slate-900 rounded-xl p-4 border border-slate-700">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-5 h-5 text-yellow-400" />
                          <span className="text-white font-bold">{entry.winner}</span>
                        </div>
                        <span className="text-yellow-400 font-bold">₺{entry.prize.toFixed(2)}</span>
                      </div>
                      <div className="text-slate-400 text-sm">
                        {entry.participants} katılımcı • {entry.totalTickets.toLocaleString('tr-TR')} bilet
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
