import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useDecryptPublicValues } from '@zama-fhe/react-sdk';
import { useGameStore } from '../stores/gameStore';
import { useGameState } from '../hooks/useGameState';
import { useMyHand } from '../hooks/useMyHand';
import { useChallenge } from '../hooks/useChallenge';
import { useSpin } from '../hooks/useSpin';
import { useAutoAction } from '../hooks/useAutoAction';
import { useWebSocket, wsNotify } from '../hooks/useWebSocket';
import {
  GAME_ADDRESS, GAME_ABI,
  DEVIL_GAME_ADDRESS, DEVIL_GAME_ABI,
  CHAOS_GAME_ADDRESS, CHAOS_GAME_ABI,
  DECK_ADDRESS, DECK_ABI,
  DEVIL_DECK_ADDRESS, DEVIL_DECK_ABI,
  CHAOS_DECK_ADDRESS, CHAOS_DECK_ABI,
} from '../lib/contracts';
import { getGasOverrides, getHeavyGasOverrides } from '../lib/gas';
import { sounds, isMuted, toggleMute } from '../lib/sounds';
import { shortenAddress, targetName } from '../lib/cardUtils';
import { CHARACTERS } from '../lib/characters';
import SpinAnimation from '../components/revolver/SpinAnimation';
import ChallengeOverlay from '../components/game/ChallengeOverlay';
import Timer from '../components/shared/Timer';

type GameMode = 'basic' | 'devil' | 'chaos';

function getModeConfig(mode: GameMode) {
  if (mode === 'devil') return { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI };
  if (mode === 'chaos') return { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI };
  return { address: GAME_ADDRESS, abi: GAME_ABI };
}

// ─── Dealing progress indicator ─────────────────────────────────────────────
function DealingProgress({ gameId, gameMode, round }: { gameId: number; gameMode: string; round: number }) {
  const publicClient = usePublicClient();
  const [step, setStep] = useState(0); // 0 = unknown, 1-4 = players dealt

  useEffect(() => {
    if (!publicClient) return;
    const { address: deckAddr, abi: deckAbi } = (() => {
      if (gameMode === 'devil') return { address: DEVIL_DECK_ADDRESS, abi: DEVIL_DECK_ABI };
      if (gameMode === 'chaos') return { address: CHAOS_DECK_ADDRESS, abi: CHAOS_DECK_ABI };
      return { address: DECK_ADDRESS, abi: DECK_ABI };
    })();
    const rid = BigInt(gameId) * 100n + BigInt(round);
    const poll = async () => {
      try {
        const [nextIdx] = await publicClient.readContract({
          address: deckAddr, abi: deckAbi, functionName: 'getDealState', args: [rid],
        }) as [number, boolean];
        setStep(Number(nextIdx)); // nextIdx = how many players have been dealt so far
      } catch {}
    };
    // Poll immediately, then every 2s, and also on WS state-changed signal
    poll();
    const t = setInterval(poll, 2000);
    window.addEventListener('state-changed', poll);
    return () => { clearInterval(t); window.removeEventListener('state-changed', poll); };
  }, [publicClient, gameId, gameMode, round]);

  const dealt = Math.min(step, 4);
  return (
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontSize: '1.1rem', color: '#c9a84c', marginBottom: '1.2rem' }}>Dealing cards...</p>
      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'center', marginBottom: '1rem' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            width: 40, height: 56, borderRadius: '0.3rem',
            backgroundImage: i < dealt ? 'url(/playing_card/back1.png)' : 'none',
            backgroundSize: 'cover',
            border: i < dealt ? '2px solid #c9a84c' : '2px dashed #3a2a1a',
            transition: 'all 0.4s',
            opacity: i < dealt ? 1 : 0.25,
          }} />
        ))}
      </div>
      <p style={{ fontSize: '0.75rem', color: '#8b7b5a' }}>
        {dealt}/4 players dealt · FHE encrypting hands
      </p>
    </div>
  );
}

export default function GameRoom() {
  const { id, mode: modeParam } = useParams<{ id: string; mode: string }>();
  const mode = (modeParam || 'basic') as GameMode;
  const { address: gameContractAddress, abi: gameAbi } = getModeConfig(mode);
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  // fhevmReady = wallet is connected and ZamaProvider (in App.tsx) is active
  const fhevmReady = isConnected;
  const setGameId = useGameStore((s) => s.setGameId);
  const setGameMode = useGameStore((s) => s.setGameMode);
  const stakeAmount = useGameStore((s) => s.stakeAmount);
  const state = useGameStore((s) => s.state);
  const players = useGameStore((s) => s.players);
  const round = useGameStore((s) => s.round);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const targetCard = useGameStore((s) => s.targetCard);
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const playedCards = useGameStore((s) => s.playedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const lastClaimant = useGameStore((s) => s.lastClaimant);
  const lastClaimCount = useGameStore((s) => s.lastClaimCount);
  const chamberPointer = useGameStore((s) => s.chamberPointer);
  const chamberPointers = useGameStore((s) => s.chamberPointers);
  const pendingSpinner = useGameStore((s) => s.pendingSpinner);
  const spinOverlayActive = useGameStore((s) => s.spinOverlayActive);
  const setSpinOverlayActive = useGameStore((s) => s.setSpinOverlayActive);

  const myPlayer = players.find((p) => p.addr?.toLowerCase() === address?.toLowerCase());
  const myIndex = players.findIndex((p) => p.addr?.toLowerCase() === address?.toLowerCase());
  const prevRoundRef = useRef(0);
  const challengeResolvedRef = useRef(false);
  const handDecryptedRef = useRef(0);

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [triggered, setTriggered] = useState(false);
  const [challengePhase, setChallengePhase] = useState<'accusation' | 'revealing' | 'verdict-lie' | 'verdict-valid' | null>(null);
  const [challengeAccuser, setChallengeAccuser] = useState(0);
  const [challengeAccused, setChallengeAccused] = useState(0);
  const prevStateRef = useRef(state);

  const { decryptHand } = useMyHand();
  const { resolveChallenge, resolving } = useChallenge();
  const { resolveSpin, spinning, outcome, clearOutcome, isMySpinTurn } = useSpin();
  useGameState();
  useAutoAction();
  const { notifyStateChanged } = useWebSocket();

  // Decrypt revealed card handles for ALL players (not just the accuser).
  // useGameState polls and dispatches 'reveal-handles-ready' when handles are found.
  const decryptPublicValuesForReveal = useDecryptPublicValues();
  const setRevealedCards = useGameStore((s) => s.setRevealedCards);
  useEffect(() => {
    const handler = async (e: Event) => {
      const { handles } = (e as CustomEvent).detail as { handles: `0x${string}`[] };
      try {
        const results = await decryptPublicValuesForReveal.mutateAsync(handles);
        const cards = handles.map(h => Number(results.clearValues[h]));
        setRevealedCards(cards);
      } catch (err) {
        console.warn('[reveal] failed to decrypt card handles:', err);
        // Clear the 'pending' lock so it can retry
        useGameStore.getState().setRevealedCards([]);
      }
    };
    window.addEventListener('reveal-handles-ready', handler);
    return () => window.removeEventListener('reveal-handles-ready', handler);
  }, [decryptPublicValuesForReveal, setRevealedCards]);

  useEffect(() => { if (id) { setGameId(Number(id)); setGameMode(mode); } }, [id, mode, setGameId, setGameMode]);

  // Reset triggered when state changes
  useEffect(() => { if (state !== 'MultiSpinning') setTriggered(false); }, [state]);

  // Sound on game over
  useEffect(() => { if (state === 'GameOver') sounds.gameOver(); }, [state]);

  useEffect(() => {
    if (round > 0 && round !== prevRoundRef.current) {
      prevRoundRef.current = round;
      challengeResolvedRef.current = false;
      handDecryptedRef.current = 0;
      resetPlayedCards();
    }
  }, [round, resetPlayedCards]);

  // Auto-decrypt: try immediately on PlayerTurn, retry once after 6s if hand still null
  useEffect(() => {
    if (!fhevmReady || !myPlayer?.alive || round === 0) return;
    if (state !== 'PlayerTurn') return;
    if (handDecryptedRef.current === round) return;

    handDecryptedRef.current = round;
    decryptHand(); // immediate attempt

    // Retry after 6s if still null (Zama relayer may need time to index)
    const retry = setTimeout(() => {
      if (useGameStore.getState().myHand.every(c => c === null)) {
        handDecryptedRef.current = 0;
        decryptHand();
      }
    }, 6000);
    return () => clearTimeout(retry);
  }, [fhevmReady, state, round, decryptHand, myPlayer?.alive]);

  // Track overlay lifecycle — set active when outcome arrives, clear on dismiss
  useEffect(() => {
    if (outcome) {
      setSpinOverlayActive(true);
    }
  }, [outcome, setSpinOverlayActive]);

  const handleOutcomeDismiss = () => {
    clearOutcome();
    setSpinOverlayActive(false);
  };

  const iAmChallenger = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();

  // Block SpinAnimation from showing until verdict overlay is fully done
  const spinBlockedRef = useRef(false);
  // spinOverlayActive lives in the store so useAutoAction can read it and pause dealing
  // All challenge-phase timers tracked so they can be cleaned up on state exit
  const challengeTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clearChallengeTimers = () => {
    challengeTimersRef.current.forEach(clearTimeout);
    challengeTimersRef.current = [];
  };

  // ─── Challenge phase controller ─────────────────────────────────────────
  useEffect(() => {
    if (prevStateRef.current === 'PlayerTurn' && state === 'Challenging') {
      clearChallengeTimers();
      spinBlockedRef.current = true;

      const accuserIdx = currentTurnIndex;
      const accusedIdx = players.findIndex(p => p.addr?.toLowerCase() === lastClaimant?.toLowerCase());
      setChallengeAccuser(accuserIdx);
      setChallengeAccused(accusedIdx >= 0 ? accusedIdx : 0);
      setChallengePhase('accusation');
      sounds.gong();

      const t1 = setTimeout(() => {
        setChallengePhase('revealing');
        sounds.cardFlip();
        // Read fresh from store to avoid stale iAmChallenger closure
        const freshPlayers = useGameStore.getState().players;
        const freshTurnIdx = useGameStore.getState().currentTurnIndex;
        const iAmChallengerFresh = freshPlayers[freshTurnIdx]?.addr?.toLowerCase() === address?.toLowerCase();
        if (!challengeResolvedRef.current && iAmChallengerFresh) {
          challengeResolvedRef.current = true;
          const t2 = setTimeout(resolveChallenge, 1000);
          challengeTimersRef.current.push(t2);
        }
      }, 2000);
      challengeTimersRef.current.push(t1);
    }

    if (prevStateRef.current === 'Challenging' && state === 'Spinning') {
      const currentPendingSpinner = useGameStore.getState().pendingSpinner;
      const currentLastClaimant = useGameStore.getState().lastClaimant;
      const spinnerIsAccused = currentPendingSpinner?.toLowerCase() === currentLastClaimant?.toLowerCase();
      const verdictPhase = spinnerIsAccused ? 'verdict-lie' : 'verdict-valid';

      let attempts = 0;
      const showVerdict = () => {
        const cards = useGameStore.getState().revealedCards;
        const ready = cards.length > 0 && typeof cards[0] === 'number';
        if (ready || attempts >= 10) {
          setChallengePhase(verdictPhase);
          const t3 = setTimeout(() => {
            setChallengePhase(null);
            const t4 = setTimeout(() => { spinBlockedRef.current = false; }, 300);
            challengeTimersRef.current.push(t4);
          }, 3500);
          challengeTimersRef.current.push(t3);
        } else {
          attempts++;
          const t5 = setTimeout(showVerdict, 500);
          challengeTimersRef.current.push(t5);
        }
      };
      showVerdict();
    }

    // Exit challenge/spin territory — clean up everything immediately
    if (state === 'PlayerTurn' || state === 'Dealing' || state === 'GameOver') {
      clearChallengeTimers();
      setChallengePhase(null);
      spinBlockedRef.current = false;
    }

    prevStateRef.current = state;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  const playerCount = players.filter((p) => p.addr !== '0x0000000000000000000000000000000000000000').length;
  const isHost = players[0]?.addr?.toLowerCase() === address?.toLowerCase();
  const canStart = state === 'WaitingForPlayers' && isHost && playerCount >= 2;
  const hasClaimToChallenge = lastClaimant && lastClaimant !== '0x0000000000000000000000000000000000000000' && lastClaimant.toLowerCase() !== address?.toLowerCase();
  const hasCardsLeft = playedCards.length < (mode === 'chaos' ? 3 : 5);

  const startGame = async () => {
    setError(''); setLoading(true);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
        const hash = await writeContractAsync({
          address: gameContractAddress, abi: gameAbi,
          functionName: 'startGame',
          args: [BigInt(id!)],
        });
        await publicClient!.waitForTransactionReceipt({ hash });
        wsNotify();
        sounds.gameStart();
        setLoading(false);
        return;
      } catch (e: any) {
        if (/user rejected|denied/i.test(e?.message || '')) { setLoading(false); return; }
        if (attempt === 0) continue; // retry once
        setError(e.shortMessage || e.message || 'Transaction failed');
      }
    }
    setLoading(false);
  };

  const playCards = async () => {
    if (selectedCards.length === 0) return;
    setError('');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gas = await getGasOverrides(publicClient!);
        if (mode === 'chaos') {
          await writeContractAsync({ address: gameContractAddress, abi: gameAbi, functionName: 'playCard', args: [BigInt(id!), selectedCards[0]], ...gas });
        } else {
          await writeContractAsync({ address: gameContractAddress, abi: gameAbi, functionName: 'playCards', args: [BigInt(id!), selectedCards.map((i) => i)], ...gas });
        }
        markCardsPlayed(selectedCards);
        notifyStateChanged();
        sounds.cardsFlip();
        return;
      } catch (e: any) {
        const msg = e.shortMessage || e.message || '';
        if (/user rejected|denied/i.test(msg)) { setError(''); return; }
        if (attempt < 2 && /gas|fee|insufficient/i.test(msg)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        setError(msg || 'Transaction failed');
      }
    }
  };

  const callLiar = async () => {
    setError('');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gas = await getGasOverrides(publicClient!);
        await writeContractAsync({ address: gameContractAddress, abi: gameAbi, functionName: 'callLiar', args: [BigInt(id!)], ...gas });
        notifyStateChanged();
        sounds.liar();
        return;
      } catch (e: any) {
        const msg = e.shortMessage || e.message || '';
        if (/user rejected|denied/i.test(msg)) { setError(''); return; }
        if (attempt < 2 && /gas|fee|insufficient/i.test(msg)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        setError(msg || 'Transaction failed');
      }
    }
  };

  // Get opponents (everyone except me)
  const opponents = players.filter((_, i) => i !== myIndex).filter(p => p.addr !== '0x0000000000000000000000000000000000000000');


  const myCharacter = useGameStore((s) => s.myCharacter);

  // Characters from chain — each player's characterId is stored on-chain
  const charForSeat = (seatIdx: number) => {
    const player = players[seatIdx];
    if (player && player.addr !== '0x0000000000000000000000000000000000000000') {
      return CHARACTERS[player.characterId % CHARACTERS.length];
    }
    return CHARACTERS[seatIdx % CHARACTERS.length];
  };

  const CHARS = [0,1,2,3].map(i => charForSeat(i).img);
  const CHAR_NAMES = [0,1,2,3].map(i => charForSeat(i).name);
  const CHARS_DEAD = [0,1,2,3].map(i => charForSeat(i).dead);
  // Basic: 0=Ace,1=King,2=Queen,3=Joker,4=Devil | Chaos: 0=King,1=Queen,2=Master,3=Chaos
  const CARD_IMGS = mode === 'chaos'
    ? ['/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/master1.png', '/playing_card/chaos1.png']
    : ['/playing_card/ace1.png', '/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/joker1.png', '/playing_card/devil1.png'];

  const RULES: Record<string, string[]> = {
    basic: ['Play 1-3 cards, claim they match the table card', 'Jokers are wild (always valid)', 'Call LIAR to challenge — loser faces Roulette', 'Last player standing wins'],
    devil: ['Same as Basic + one Devil Card in deck', 'Devil can only be played alone', 'If Devil is revealed on challenge, ALL others face Roulette'],
    chaos: ['12 cards, 3 per player, play 1 per turn', 'Winner of challenge shoots an opponent', 'Master: accused shoots someone', 'Chaos: everyone shoots simultaneously'],
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SpinAnimation outcome={outcome} spinning={spinning && !challengePhase} onDismiss={handleOutcomeDismiss} blocked={spinBlockedRef.current} />
      <ChallengeOverlay phase={challengePhase} accuserIndex={challengeAccuser} accusedIndex={challengeAccused} onDismiss={() => setChallengePhase(null)} />

      {/* Nav */}
      <nav style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid #3a2a1a', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#8b7b5a', letterSpacing: '0.1em' }}>TABLE #{id}</span>
          {mode !== 'basic' && <span style={{ fontSize: '0.55rem', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', background: mode === 'devil' ? '#e9456030' : '#a855f730', color: mode === 'devil' ? '#e94560' : '#a855f7', border: `1px solid ${mode === 'devil' ? '#e94560' : '#a855f7'}` }}>{mode.toUpperCase()}</span>}
          {stakeAmount > 0n && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e' }}>{Number(stakeAmount) / 1e6} USDC x4</span>}
        </div>
        {state !== 'WaitingForPlayers' && state !== 'GameOver' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#c9a84c' }}>Round {round}</span>
            <img src="/hourglass.png" alt="" className="hourglass-spin" style={{ width: 20, height: 20 }} />
            <Timer />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#c9a84c', fontFamily: 'monospace' }}>{address ? shortenAddress(address) : ''}</span>
          <button onClick={() => setMuted(toggleMute())} style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid #5a4a3a', color: muted ? '#e94560' : '#8b7b5a', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{muted ? '♪' : '♫'}</button>
          <button onClick={() => setShowRules(true)} style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid #5a4a3a', color: '#8b7b5a', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
        </div>
      </nav>

      {/* Opponents */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', padding: '1rem 1.5rem', zIndex: 20 }}>
        {opponents.map((p, i) => {
          const pIdx = players.indexOf(p);
          const isTurn = pIdx === currentTurnIndex;
          const chambers = chamberPointers[p.addr?.toLowerCase()] || 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', opacity: !p.alive ? 0.4 : 1, transform: isTurn ? 'scale(1.08)' : 'scale(0.95)', transition: 'transform 0.3s' }}>
              <div className={`player-card ${!p.alive ? 'dead' : ''} ${isTurn ? 'active' : ''}`} style={{ backgroundImage: `url(${p.alive ? CHARS[pIdx] : CHARS_DEAD[pIdx]})`, width: 110, height: 110 }}>
                <span className="player-name" style={{ fontSize: '0.75rem' }}>{CHAR_NAMES[pIdx]}</span>
              </div>
              {chambers > 0 && (
                <div className="chambers">
                  {Array.from({ length: 6 }, (_, j) => <div key={j} className={`chamber ${j < chambers ? 'safe' : ''}`} style={{ width: 10, height: 10 }} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        {state !== 'WaitingForPlayers' && state !== 'GameOver' && state !== 'Spinning' && (
          <div className="target-card" style={{ backgroundImage: `url(${CARD_IMGS[targetCard]})`, marginBottom: '1rem', width: '6rem', height: '8.5rem' }} />
        )}

        {lastClaimant && lastClaimant !== '0x0000000000000000000000000000000000000000' && state === 'PlayerTurn' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '0.8rem' }}>
            <div style={{ display: 'flex' }}>
              {Array.from({ length: lastClaimCount }, (_, i) => (
                <div key={i} className="playing-card" style={{ backgroundImage: 'url(/playing_card/back1.png)', width: '4rem', marginLeft: i > 0 ? '-1rem' : 0 }} />
              ))}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#dfd5b4', fontStyle: 'italic' }}>claims {lastClaimCount} {targetName(targetCard, mode)}{lastClaimCount > 1 ? 's' : ''}</span>
          </div>
        )}

        {state === 'WaitingForPlayers' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', color: '#c9a84c', marginBottom: '1rem' }}>Table #{id}</h2>
            <p style={{ color: '#8b7b5a', marginBottom: '1rem' }}>{playerCount}/4 seated</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`player-card`} style={{ backgroundImage: i < playerCount ? `url(${CHARS[i]})` : 'none', width: 80, height: 80, opacity: i < playerCount ? 1 : 0.2, border: i >= playerCount ? '2px dashed #5a4a3a' : undefined }}>
                  {i < playerCount && <span className="player-name" style={{ fontSize: '0.6rem' }}>{CHAR_NAMES[i]}</span>}
                </div>
              ))}
            </div>
            {playerCount < 2 && <p style={{ color: '#8b7b5a', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Need at least 1 more player to start</p>}
            {playerCount >= 2 && playerCount < 4 && !isHost && <p style={{ color: '#8b7b5a', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Waiting for host to start ({playerCount} of up to 4 seated)</p>}
            {playerCount >= 2 && isHost && playerCount < 4 && <p style={{ color: '#c9a84c', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Ready to start with {playerCount} players, or wait for more (max 4)</p>}
            {canStart && <button className="btn green" style={{ fontSize: '1.1rem', padding: '0.7rem 2rem' }} onClick={startGame} disabled={loading}>{loading ? 'Dealing...' : 'Deal the Cards'}</button>}
            {error && <p style={{ color: '#ffb4ab', fontSize: '0.7rem', marginTop: '0.5rem' }}>{error}</p>}
            <p style={{ color: '#5a4a3a', fontSize: '0.65rem', marginTop: '1rem' }}>Table #{id}</p>
            <button onClick={() => { const url = `${window.location.origin}/lobby?join=${id}&mode=${mode}`; navigator.clipboard.writeText(url); setError('Link copied!'); setTimeout(() => setError(''), 2000); }} className="btn" style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 1.2rem' }}>
              Copy Invite Link
            </button>
          </div>
        )}

        {state === 'Dealing' && !spinOverlayActive && (
          <DealingProgress gameId={Number(id!)} gameMode={mode} round={round} />
        )}

        {state === 'Challenging' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.2rem', color: '#e94560' }}>Revealing cards...</p>
            {iAmChallenger && !resolving && <button className="btn" style={{ marginTop: '0.8rem' }} onClick={resolveChallenge}>Reveal</button>}
            {resolving && <p style={{ fontSize: '0.7rem', color: '#8b7b5a', marginTop: '0.5rem' }}>Decrypting via FHE...</p>}
          </div>
        )}

        {state === 'Spinning' && (
          <div style={{ textAlign: 'center' }}>
            <div className="heartbeat-vignette" />
            {isMySpinTurn ? (
              <>
                <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 120, margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '1.1rem', color: '#dfd5b4', marginBottom: '1rem' }}>Your turn to pull...</p>
                {!spinning && <button className="btn red" style={{ fontSize: '1.2rem', padding: '0.7rem 2rem' }} onClick={resolveSpin}>Pull Trigger</button>}
                {spinning && <p style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>Resolving...</p>}
              </>
            ) : (
              <p style={{ color: '#8b7b5a' }}>Waiting for trigger pull...</p>
            )}
          </div>
        )}

        {state === 'MultiSpinning' && (
          <div style={{ textAlign: 'center' }}>
            <div className="heartbeat-vignette" />
            <h3 style={{ fontSize: '1.3rem', color: '#e94560', marginBottom: '1rem' }}>DEVIL RETRIBUTION</h3>
            {lastClaimant?.toLowerCase() === address?.toLowerCase() ? (
              <p style={{ fontSize: '0.9rem', color: '#22c55e', marginBottom: '1rem' }}>You played the Devil Card. You are safe!</p>
            ) : (
              <>
                <p style={{ fontSize: '0.85rem', color: '#dfd5b4', marginBottom: '1.5rem' }}>All players must face the barrel!</p>
                <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 100, margin: '0 auto 1rem' }} />
                {myPlayer?.alive && !spinning && !triggered && (
                  <button className="btn red" style={{ fontSize: '1.1rem', padding: '0.7rem 2rem' }} onClick={async () => {
                    for (let attempt = 0; attempt < 3; attempt++) {
                      try {
                        const gas = await getGasOverrides(publicClient!);
                        await writeContractAsync({ address: gameContractAddress, abi: gameAbi, functionName: 'triggerMySpin', args: [BigInt(id!)], ...gas });
                        setTriggered(true);
                        notifyStateChanged();
                        await new Promise(r => setTimeout(r, 4000));
                        await resolveSpin();
                        return;
                      } catch (e: any) {
                        if (/User rejected|denied/i.test(e?.message || '')) return;
                        if (attempt < 2) await new Promise(r => setTimeout(r, 2000));
                      }
                    }
                  }}>Pull Trigger</button>
                )}
                {triggered && !spinning && <p style={{ fontSize: '0.85rem', color: '#8b7b5a' }}>Waiting for others...</p>}
                {spinning && <p style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>Resolving...</p>}
              </>
            )}
          </div>
        )}

        {/* Chaos: Targeting — pick who to shoot */}
        {(state === 'Targeting' || state === 'MultiTargeting') && (
          <div style={{ textAlign: 'center' }}>
            <h3 style={{ fontSize: '1.3rem', color: '#a855f7', marginBottom: '1rem' }}>CHOOSE YOUR TARGET</h3>
            {(state === 'MultiTargeting' || pendingSpinner?.toLowerCase() === address?.toLowerCase()) ? (
              <>
                <p style={{ fontSize: '0.85rem', color: '#dfd5b4', marginBottom: '1.5rem' }}>Pick a player to shoot</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                  {players.filter((p) => p.alive && p.addr?.toLowerCase() !== address?.toLowerCase() && p.addr !== '0x0000000000000000000000000000000000000000').map((p) => {
                    const pIdx = players.indexOf(p);
                    const char = CHARACTERS[p.characterId % CHARACTERS.length];
                    return (
                      <button key={pIdx} className="btn red" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', padding: '0.8rem' }} onClick={async () => {
                        for (let attempt = 0; attempt < 3; attempt++) {
                          try {
                            const gas = await getGasOverrides(publicClient!);
                            const fn = state === 'MultiTargeting' ? 'chooseTargetMulti' : 'chooseTarget';
                            await writeContractAsync({ address: gameContractAddress, abi: gameAbi, functionName: fn, args: [BigInt(id!), p.addr], ...gas });
                            notifyStateChanged();
                            return;
                          } catch (e: any) {
                            if (/User rejected|denied/i.test(e?.message || '')) return;
                            if (attempt < 2) await new Promise(r => setTimeout(r, 1500));
                          }
                        }
                      }}>
                        <img src={char.img} alt="" style={{ width: 50, height: 50, borderRadius: '0.3rem' }} />
                        <span style={{ fontSize: '0.7rem' }}>{char.name}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p style={{ color: '#8b7b5a', fontSize: '0.9rem' }}>Waiting for shooter to pick target...</p>
            )}
          </div>
        )}

        {/* Chaos: Shooting — waiting for spin resolution */}
        {state === 'Shooting' && (
          <div style={{ textAlign: 'center' }}>
            <div className="heartbeat-vignette" />
            <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 100, margin: '0 auto 1rem' }} />
            <p style={{ fontSize: '1rem', color: '#dfd5b4' }}>Shots firing...</p>
            {pendingSpinner?.toLowerCase() === address?.toLowerCase() && !spinning && (
              <button className="btn" style={{ marginTop: '1rem' }} onClick={resolveSpin}>Resolve Shot</button>
            )}
            {spinning && <p style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>Resolving...</p>}
            {pendingSpinner?.toLowerCase() !== address?.toLowerCase() && !spinning && (
              <p style={{ fontSize: '0.75rem', color: '#8b7b5a', marginTop: '0.5rem' }}>Waiting for shot to resolve...</p>
            )}
          </div>
        )}

        {state === 'GameOver' && !spinOverlayActive && (
          <div style={{ textAlign: 'center' }} id="game-result-card">
            <h2 style={{ fontSize: '2.2rem', color: '#c9a84c', marginBottom: '1.5rem' }}>WINNER!</h2>
            {(() => {
              const winnerPlayer = players.find(p => p.alive && p.addr !== '0x0000000000000000000000000000000000000000');
              const winnerChar = winnerPlayer ? CHARACTERS[winnerPlayer.characterId % CHARACTERS.length] : CHARACTERS[0];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <img src="/crown.png" alt="" style={{ width: 50, filter: 'drop-shadow(0 0 12px #fff08d67)' }} />
                  <div className="player-card" style={{ backgroundImage: `url(${winnerChar.img})`, width: 130, height: 130, boxShadow: '0 0 24px #c9a84c50' }} />
                  <span style={{ fontSize: '1.3rem', color: '#c9a84c', fontWeight: 700 }}>{winnerChar.name}</span>
                  {winnerPlayer && <span style={{ fontSize: '0.7rem', color: '#8b7b5a', fontFamily: 'monospace' }}>{shortenAddress(winnerPlayer.addr)}</span>}
                  {stakeAmount > 0n && <span style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.3rem' }}>Won {Number(stakeAmount * 4n * 95n / 100n) / 1e6} USDC</span>}
                </div>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              {players.filter(p => p.addr !== '0x0000000000000000000000000000000000000000' && !p.alive).map((p, i) => {
                const c = CHARACTERS[p.characterId % CHARACTERS.length];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.4 }}>
                    <div className="player-card dead" style={{ backgroundImage: `url(${c.dead})`, width: 60, height: 60 }} />
                    <span style={{ fontSize: '0.55rem', color: '#5a4a3a' }}>{c.name}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn green" onClick={() => navigate('/lobby')}>Another Round</button>
            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'center' }}>
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                // Download result as image
                const el = document.getElementById('game-result-card');
                if (!el) return;
                import('html-to-image').then(({ toPng }) => {
                  toPng(el).then((url) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `bluff-barrel-result-${id}.png`;
                    a.click();
                  });
                }).catch(() => alert('Install html-to-image for download'));
              }}>Download Result</button>
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                const winnerP = players.find(p => p.alive && p.addr !== '0x0000000000000000000000000000000000000000');
                const winnerName = winnerP ? CHARACTERS[winnerP.characterId % CHARACTERS.length].name : 'Unknown';
                const pot = stakeAmount > 0n ? `${Number(stakeAmount * 4n) / 1e6} USDC` : 'bragging rights';
                const text = `I just played Bluff and Barrel! ${winnerName} won ${pot} in ${mode} mode. On-chain deception powered by @zama_fhe fhEVM.`;
                window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank');
              }}>Share on X</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom — Hand + Actions (show during all active game states, including Dealing) */}
      {myPlayer?.alive && !spinOverlayActive && (state === 'Dealing' || state === 'PlayerTurn' || state === 'Challenging' || state === 'Spinning' || state === 'MultiSpinning') && (
        <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.5)', borderTop: '1px solid #3a2a1a', zIndex: 20 }}>
          <div className="chambers" style={{ justifyContent: 'center', marginBottom: '0.6rem' }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className={`chamber ${i < chamberPointer ? 'safe' : ''}`} style={{ width: 12, height: 12 }} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            {myHand.slice(0, mode === 'chaos' ? 3 : 5).map((card, i) => {
              if (playedCards.includes(i)) return <div key={i} style={{ width: '5.5rem', aspectRatio: '1/1.4', borderRadius: '0.3rem', border: '1px dashed #3a2a1a', opacity: 0.15 }} />;
              return (
                <div key={i}
                  className={`playing-card ${selectedCards.includes(i) ? 'selected' : ''}`}
                  style={{ backgroundImage: card !== null ? `url(${CARD_IMGS[card]})` : 'url(/playing_card/back1.png)', width: '5.5rem', cursor: card !== null ? 'pointer' : 'default', opacity: card === null ? 0.5 : 1 }}
                  onClick={() => card !== null && toggleCard(i)}
                />
              );
            })}
          </div>
          {state === 'PlayerTurn' && isMyTurn && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              {hasCardsLeft && <button className="btn green" style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }} disabled={selectedCards.length === 0} onClick={playCards}>Play {selectedCards.length || ''} as {targetName(targetCard, mode)}</button>}
              {hasClaimToChallenge && <button className="btn red" style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }} onClick={callLiar}>LIAR!</button>}
              {!hasCardsLeft && !hasClaimToChallenge && <span style={{ fontSize: '0.8rem', color: '#8b7b5a' }}>Waiting...</span>}
            </div>
          )}
          {state === 'PlayerTurn' && !isMyTurn && <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8b7b5a' }}>Waiting for {CHAR_NAMES[currentTurnIndex]}...</p>}
          {error && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
            <p style={{ fontSize: '0.7rem', color: '#ffb4ab' }}>{error}</p>
            <button onClick={() => { setError(''); }} style={{ fontSize: '0.6rem', color: '#c9a84c', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>dismiss</button>
          </div>}
        </div>
      )}

      {!fhevmReady && state !== 'WaitingForPlayers' && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 40, fontSize: '0.6rem', color: '#c9a84c' }}>Initializing encryption...</div>
      )}

      {showRules && (
        <div onClick={() => setShowRules(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="paperboard-panel" style={{ padding: '1.5rem', width: 340 }}>
            <h3 style={{ fontSize: '1.1rem', color: '#2a1a0a', marginBottom: '0.8rem' }}>{mode.charAt(0).toUpperCase() + mode.slice(1)} Mode</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {RULES[mode].map((r, i) => (
                <li key={i} style={{ fontSize: '0.75rem', color: '#3a2a1a', paddingLeft: '0.8rem', borderLeft: '2px solid #8b7b5a' }}>{r}</li>
              ))}
            </ul>
            <button className="btn" onClick={() => setShowRules(false)} style={{ marginTop: '1rem', width: '100%', padding: '0.4rem' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
