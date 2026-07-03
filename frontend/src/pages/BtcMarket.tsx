import { useEffect, useState, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, usePublicClient, useWriteContract } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { useZamaSDK } from '@zama-fhe/react-sdk';
import {
  BTC_MARKET_ADDRESS, BTC_MARKET_ABI,
  fetchBtcPrice, timeUntilRoundEnd, RESULT_LABEL, RESULT_COLOR,
} from '../lib/btcMarket';
import { shortenAddress } from '../lib/cardUtils';

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ prices }: { prices: number[] }) {
  if (prices.length < 2) return <div style={{ height: 64 }} />;
  const min   = Math.min(...prices);
  const max   = Math.max(...prices);
  const range = max - min || 1;
  const w = 400, h = 64;
  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - min) / range) * (h - 8) - 4;
    return `${x},${y}`;
  }).join(' ');
  const isUp  = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#15803d' : '#b91c1c';
  const lastY = Number(pts.split(' ').pop()?.split(',')[1] ?? h / 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 64, display: 'block' }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={w} cy={lastY} r="3.5" fill={color} />
    </svg>
  );
}

// ─── Round countdown ──────────────────────────────────────────────────────────
function RoundTimer({ endTime }: { endTime: number }) {
  const [label, setLabel] = useState(() => timeUntilRoundEnd(endTime));
  useEffect(() => {
    const t = setInterval(() => setLabel(timeUntilRoundEnd(endTime)), 500);
    return () => clearInterval(t);
  }, [endTime]);
  const secs = endTime - Math.floor(Date.now() / 1000);
  const pct  = Math.max(0, Math.min(1, secs / 60));
  const color = secs < 10 ? '#b91c1c' : secs < 20 ? '#c9a84c' : '#15803d';
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: '100%', height: 4, background: 'rgba(90,70,50,0.2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color, transition: 'width 0.5s linear, background 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.7rem', color: '#7a6a5a', marginTop: '0.2rem', display: 'block' }}>
        {label === 'Ended' ? 'Round ended — waiting for oracle' : `Round ends in ${label}`}
      </span>
    </div>
  );
}

export default function BtcMarket() {
  const { address, isConnected } = useAccount();
  const { connect, connectors }  = useConnect();
  const { disconnect }           = useDisconnect();
  const publicClient             = usePublicClient();
  const { writeContractAsync }   = useWriteContract();
  const navigate                 = useNavigate();
  const sdk                      = useZamaSDK();

  const [btcPrice, setBtcPrice]       = useState<number | null>(null);
  const [priceHistory, setHistory]    = useState<number[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading]         = useState('');
  const [error, setError]             = useState('');
  const [txHash, setTxHash]           = useState('');

  // Chain state
  const [roundId, setRoundId]       = useState<bigint>(1n);
  const [roundState, setRoundState] = useState<{
    started: boolean; startTime: number; endTime: number;
    startPrice: bigint; endPrice: bigint; finalized: boolean; result: number; betCount: bigint;
  } | null>(null);
  const [userBet, setUserBet] = useState<{ exists: boolean; points: bigint; claimed: boolean; claimOpen: boolean } | null>(null);
  const [betHandle, setBetHandle] = useState<`0x${string}` | null>(null);
  const [userPoints, setUserPoints] = useState<bigint>(0n);

  // ── Price feed ──────────────────────────────────────────────────────────────
  const updatePrice = useCallback(async () => {
    const p = await fetchBtcPrice();
    if (p) {
      setBtcPrice(p);
      setHistory(h => [...h.slice(-59), p]);
      const now = new Date();
      setLastUpdated(
        `${now.getUTCHours().toString().padStart(2,'0')}:${now.getUTCMinutes().toString().padStart(2,'0')}:${now.getUTCSeconds().toString().padStart(2,'0')} (UTC)`
      );
    }
  }, []);

  useEffect(() => { updatePrice(); const t = setInterval(updatePrice, 10000); return () => clearInterval(t); }, [updatePrice]);

  // ── Chain poll ──────────────────────────────────────────────────────────────
  const pollChain = useCallback(async () => {
    if (!publicClient) return;
    try {
      const cur = await publicClient.readContract({
        address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI, functionName: 'getCurrentRound',
      }) as bigint;
      setRoundId(cur);

      const rs = await publicClient.readContract({
        address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI, functionName: 'getRoundState', args: [cur],
      }) as [boolean, bigint, bigint, bigint, bigint, boolean, number, bigint];
      setRoundState({
        started: rs[0], startTime: Number(rs[1]), endTime: Number(rs[2]),
        startPrice: rs[3], endPrice: rs[4], finalized: rs[5], result: rs[6], betCount: rs[7],
      });

      if (address) {
        const pts = await publicClient.readContract({
          address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI, functionName: 'getPoints', args: [address as `0x${string}`],
        }) as bigint;
        setUserPoints(pts);

        const bet = await publicClient.readContract({
          address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI, functionName: 'getBet', args: [cur, address as `0x${string}`],
        }) as [boolean, bigint, boolean, boolean];
        setUserBet({ exists: bet[0], points: bet[1], claimed: bet[2], claimOpen: bet[3] });

        if (bet[0]) {
          const h = await publicClient.readContract({
            address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI, functionName: 'getBetHandle', args: [cur, address as `0x${string}`],
          }) as `0x${string}`;
          setBetHandle(h);
        }
      }
    } catch {}
  }, [publicClient, address]);

  useEffect(() => { pollChain(); const t = setInterval(pollChain, 3000); return () => clearInterval(t); }, [pollChain]);

  // ── Place bet ───────────────────────────────────────────────────────────────
  const placeBet = async (direction: number) => {
    if (!address || !sdk || !publicClient) return;
    setError(''); setLoading(direction === 1 ? 'up' : 'down');
    try {
      const { encryptedValues, inputProof } = await sdk.encrypt({
        values: [{ type: 'euint8', value: BigInt(direction) }],
        contractAddress: BTC_MARKET_ADDRESS,
        userAddress: address,
      });

      const hash = await writeContractAsync({
        address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI,
        functionName: 'placeBet',
        args: [roundId, encryptedValues[0] as `0x${string}`, inputProof as `0x${string}`],
        gas: 500_000n, // cap for fhEVM Sepolia — FHE wrap ops stay well under this
      });
      setTxHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      await pollChain();
    } catch (e: any) {
      if (/user rejected|denied/i.test(e?.message || '')) { setLoading(''); return; }
      setError(e.shortMessage || e.message || 'Transaction failed');
    }
    setLoading('');
  };

  // ── Request claim (step 1) ──────────────────────────────────────────────────
  const requestClaim = async () => {
    if (!address || !publicClient) return;
    setError(''); setLoading('claim');
    try {
      const hash = await writeContractAsync({
        address: BTC_MARKET_ADDRESS, abi: BTC_MARKET_ABI,
        functionName: 'requestClaim', args: [roundId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      await pollChain();
    } catch (e: any) {
      setError(e.shortMessage || e.message || 'Request claim failed');
    }
    setLoading('');
  };

  // Derived
  const priceChange = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 1] - priceHistory[0] : 0;
  const pctChange   = priceHistory[0] ? (priceChange / priceHistory[0]) * 100 : 0;
  const isUp        = priceChange >= 0;
  const betCount    = Number(roundState?.betCount ?? 0n);
  const roundOpen   = roundState?.started && !roundState?.finalized && Date.now() / 1000 < (roundState?.endTime ?? 0);
  const canBet      = roundOpen && !userBet?.exists && isConnected && userPoints >= 100n;
  const canClaim    = roundState?.finalized && userBet?.exists && !userBet?.claimed && !userBet?.claimOpen;
  const claimPending = userBet?.claimOpen && !userBet?.claimed;

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>

      {/* Cards background */}
      <div className="cards-bg">
        {[
          { card: 'ace1',   left: '3%',  top: '15%', rot: '-12deg' },
          { card: 'king1',  left: '88%', top: '8%',  rot: '15deg'  },
          { card: 'queen1', left: '80%', top: '60%', rot: '-10deg' },
          { card: 'joker1', left: '8%',  top: '65%', rot: '22deg'  },
          { card: 'back1',  left: '50%', top: '85%', rot: '-20deg' },
          { card: 'king1',  left: '15%', top: '38%', rot: '8deg'   },
          { card: 'ace1',   left: '92%', top: '40%', rot: '-16deg' },
          { card: 'queen1', left: '60%', top: '12%', rot: '5deg'   },
          { card: 'back1',  left: '35%', top: '55%', rot: '-30deg' },
          { card: 'joker1', left: '70%', top: '80%', rot: '18deg'  },
        ].map((c, i) => (
          <div key={i} className="floating-card static" style={{ backgroundImage: `url(/playing_card/${c.card}.png)`, left: c.left, top: c.top, ['--rot' as any]: c.rot }} />
        ))}
      </div>

      {/* Nav */}
      <nav style={{ position: 'absolute', top: 0, width: '100%', maxWidth: 1100, padding: '0.8rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 50 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', color: '#8b7b5a', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>← Back</button>
        {isConnected && (
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: '#c9a84c', fontFamily: 'monospace', fontWeight: 600 }}>
              {Number(userPoints)} PTS
            </span>
            <span style={{ fontSize: '0.7rem', color: '#8b7b5a', fontFamily: 'monospace' }}>{shortenAddress(address!)}</span>
            <button onClick={() => disconnect()} style={{ fontSize: '0.6rem', color: '#5a4a3a', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Disconnect</button>
          </div>
        )}
      </nav>

      {/* Paperboard panel */}
      <div className="paperboard-panel" style={{ position: 'relative', zIndex: 10, width: 540, padding: '2.6rem', paddingTop: '6rem' }}>

        {/* Banner */}
        <div style={{ position: 'absolute', top: '-3.5rem', left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div className="game-logo" style={{ position: 'relative' }}>
            <h1 style={{ margin: '2.5rem 3rem', fontSize: '1.8rem', color: '#fff7db', textShadow: '0 0 1px #402011, 0 1px 1px #b27e66, 0 1px 2px #311208, 0 3px 8px #642b18', whiteSpace: 'nowrap' }}>
              BTC 1 Min Market
            </h1>
            <img src="/banner.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: -1, filter: 'drop-shadow(0 1px 1px #604c3d) drop-shadow(0 0 2px #281503) drop-shadow(0 4px 16px #361e08)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Price */}
          <div style={{ paddingBottom: '0.7rem', borderBottom: '1px solid rgba(90,70,50,0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#f7931a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: '#fff', fontWeight: 700, flexShrink: 0 }}>₿</div>
              <span style={{ fontSize: '1.1rem', color: '#2a1a0a', fontWeight: 700 }}>BTC/USD</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#15803d' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#15803d', display: 'inline-block' }} />
                Live
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '2.4rem', color: '#2a1a0a', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '-0.02em' }}>
                {btcPrice ? btcPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
              </span>
              {priceHistory.length >= 2 && (
                <span style={{ fontSize: '1rem', color: isUp ? '#15803d' : '#b91c1c', fontFamily: 'monospace', fontWeight: 600 }}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem' }}>
              <span style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>1 Min Change</span>
              {lastUpdated && <span style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>Last Updated {lastUpdated}</span>}
            </div>
          </div>

          {/* Sparkline */}
          <Sparkline prices={priceHistory} />

          {/* Round timer */}
          {roundState?.started && !roundState?.finalized && (
            <RoundTimer endTime={roundState.endTime} />
          )}

          {/* Round result badge */}
          {roundState?.finalized && roundState.result > 0 && (
            <div style={{ textAlign: 'center', padding: '0.6rem', borderRadius: '0.4rem', background: 'rgba(90,70,50,0.1)', border: '1px solid rgba(90,70,50,0.2)' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: RESULT_COLOR[roundState.result] }}>
                Result: {RESULT_LABEL[roundState.result]}
              </span>
            </div>
          )}

          {/* Bet prompt / buttons */}
          {!isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#5a4a3a', margin: 0 }}>Connect wallet to bet</p>
              {connectors.map(c => (
                <button key={c.uid} className="btn" style={{ width: '100%', padding: '0.7rem', fontSize: '1rem' }} onClick={() => connect({ connector: c })}>{c.name}</button>
              ))}
            </div>
          ) : !roundState?.started ? (
            <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8b7b5a', margin: 0 }}>Waiting for oracle to start round…</p>
          ) : canBet ? (
            <>
              <p style={{ textAlign: 'center', fontSize: '0.9rem', color: '#5a4a3a', margin: 0 }}>
                Bet 100 PTS — what direction will the price move?
              </p>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  className="btn green"
                  style={{ flex: 1, padding: '0.8rem', fontSize: '1.2rem', opacity: loading && loading !== 'up' ? 0.4 : 1 }}
                  disabled={!!loading}
                  onClick={() => placeBet(1)}
                >
                  {loading === 'up' ? '…' : 'UP ▲'}
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, padding: '0.8rem', fontSize: '1.2rem', opacity: loading && loading !== 'down' ? 0.4 : 1, borderColor: '#b91c1c', color: '#b91c1c' }}
                  disabled={!!loading}
                  onClick={() => placeBet(0)}
                >
                  {loading === 'down' ? '…' : 'DOWN ▼'}
                </button>
              </div>
            </>
          ) : userBet?.exists && !roundState?.finalized ? (
            <div style={{ textAlign: 'center', padding: '1rem', background: 'rgba(21,128,61,0.1)', borderRadius: '0.4rem', border: '1px solid rgba(21,128,61,0.3)' }}>
              <p style={{ fontSize: '1rem', color: '#15803d', margin: 0 }}>✓ 100 PTS bet placed!</p>
              <p style={{ fontSize: '0.7rem', color: '#8b7b5a', margin: '0.25rem 0 0' }}>
                Direction FHE-encrypted — nobody can see your call
              </p>
            </div>
          ) : canClaim ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <p style={{ textAlign: 'center', fontSize: '0.8rem', color: '#5a4a3a', margin: 0 }}>
                Round ended! Reveal to collect 200 PTS if correct.
              </p>
              <button
                className="btn green"
                style={{ width: '100%', padding: '0.7rem', fontSize: '1rem', opacity: loading === 'claim' ? 0.5 : 1 }}
                disabled={loading === 'claim'}
                onClick={requestClaim}
              >
                {loading === 'claim' ? 'Requesting…' : 'Open Claim'}
              </button>
            </div>
          ) : claimPending ? (
            <div style={{ textAlign: 'center', padding: '0.8rem', background: 'rgba(201,168,76,0.1)', borderRadius: '0.4rem', border: '1px solid rgba(201,168,76,0.3)' }}>
              <p style={{ fontSize: '0.85rem', color: '#c9a84c', margin: 0 }}>⏳ KMS decrypting your direction…</p>
              <p style={{ fontSize: '0.65rem', color: '#8b7b5a', margin: '0.25rem 0 0' }}>
                Once KMS responds, come back to claim your winnings
              </p>
            </div>
          ) : roundOpen && !userBet?.exists && isConnected && userPoints < 100n ? (
            <div style={{ textAlign: 'center', padding: '0.8rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#b91c1c', margin: 0 }}>Not enough points (need 100 PTS)</p>
              <p style={{ fontSize: '0.65rem', color: '#8b7b5a', margin: '0.2rem 0 0' }}>Ask the operator to add points to your wallet</p>
            </div>
          ) : userBet?.claimed ? (
            <div style={{ textAlign: 'center', padding: '0.8rem', background: 'rgba(90,70,50,0.08)', borderRadius: '0.4rem' }}>
              <p style={{ fontSize: '0.85rem', color: '#8b7b5a', margin: 0 }}>Claimed ✓</p>
            </div>
          ) : null}

          {error && <p style={{ textAlign: 'center', fontSize: '0.7rem', color: '#b91c1c', margin: 0 }}>{error}</p>}
          {txHash && (
            <p style={{ textAlign: 'center', fontSize: '0.65rem', color: '#8b7b5a', margin: 0 }}>
              Tx: <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ color: '#c9a84c' }}>{txHash.slice(0, 10)}…</a>
            </p>
          )}

          {/* Footer */}
          <p style={{ textAlign: 'center', color: '#7a6a5a', fontSize: '0.7rem', margin: 0, letterSpacing: '0.08em' }}>
            {betCount > 0 ? `${betCount} Player${betCount !== 1 ? 's' : ''}` : '4 Players'} &nbsp;•&nbsp; FHE Encrypted &nbsp;•&nbsp; ZAMA
          </p>

        </div>
      </div>
    </div>
  );
}
