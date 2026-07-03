import { useEffect } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useNavigate } from 'react-router-dom';
import { shortenAddress } from '../lib/cardUtils';

export default function Landing() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add('scrollable');
    return () => document.documentElement.classList.remove('scrollable');
  }, []);

  return (
    <div style={{ width: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      {/* Scattered cards background */}
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
          <div key={i} className="floating-card static" style={{
            backgroundImage: `url(/playing_card/${c.card}.png)`,
            left: c.left, top: c.top,
            ['--rot' as any]: c.rot,
          }} />
        ))}
      </div>

      {/* Nav */}
      <nav style={{ width: '100%', maxWidth: 1100, padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 40 }}>
        <span style={{ fontSize: '0.75rem', color: '#8b7b5a', letterSpacing: '0.1em' }}>ZAMA ENCRYPTED · ETH SEPOLIA</span>
        {isConnected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#c9a84c', fontFamily: 'monospace' }}>{shortenAddress(address!)}</span>
            <button onClick={() => disconnect()} style={{ fontSize: '0.65rem', color: '#8b7b5a', cursor: 'pointer', textDecoration: 'underline', background: 'none' }}>Disconnect</button>
          </div>
        ) : (
          <button className="btn" style={{ padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => connect({ connector: connectors[0] })}>
            Connect Wallet
          </button>
        )}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, width: '100%', maxWidth: 1100, padding: '0 1.5rem', zIndex: 30 }}>

        {/* Hero */}
        <section style={{ textAlign: 'center', padding: '4rem 0 3rem' }}>
          <div className="game-logo" style={{ display: 'inline-block', position: 'relative', marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '2.5rem', color: '#fff7db', textShadow: '0 0 10px rgba(201,168,76,0.5), 0 0 20px rgba(201,168,76,0.3), 0 2px 4px #311208', margin: '2.5rem 3rem' }}>
              Bluff and Barrel
            </h1>
            <img src="/banner.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: -1, filter: 'drop-shadow(0 2px 4px #281503) drop-shadow(0 4px 16px #361e08)' }} />
          </div>
          <p style={{ fontSize: '1.3rem', color: '#dfd5b4', fontStyle: 'italic' }}>Bluff. Deceive. Survive.</p>
          <p style={{ fontSize: '0.85rem', color: '#8b7b5a', maxWidth: 550, margin: '1rem auto 0', lineHeight: 1.6 }}>
            The first fully on-chain card bluffing game with Russian Roulette. Powered by Zama fhEVM — your cards stay encrypted on-chain until the moment you're caught.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', margin: '2rem 0' }}>
            <div style={{ height: 1, width: 50, background: 'linear-gradient(to right, transparent, #8b7b5a)' }} />
            <span style={{ fontSize: '0.65rem', color: '#8b7b5a', letterSpacing: '0.2em', textTransform: 'uppercase' }}>The House Always Wins</span>
            <div style={{ height: 1, width: 50, background: 'linear-gradient(to left, transparent, #8b7b5a)' }} />
          </div>
        </section>

        {/* Game Mode Cards — 3 card modes only */}
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem', marginBottom: '4rem' }}>

          {/* Basic Mode — LIVE */}
          <div style={{ position: 'relative', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: -2, background: 'linear-gradient(to bottom, #c9a84c, #8a6420)', borderRadius: '0.85rem', opacity: 0.6, filter: 'blur(2px)' }} />
            <div style={{ position: 'relative', background: '#1a110d', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid rgba(201,168,76,0.3)', boxShadow: '0 0 20px rgba(201,168,76,0.15)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ background: '#c9a84c', color: '#1a110d', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>LIVE</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '4/3', background: '#251f12', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex' }}>
                  {['ace1', 'king1', 'queen1'].map((c, i) => (
                    <div key={i} className="playing-card" style={{ backgroundImage: `url(/playing_card/${c}.png)`, width: '3.5rem', transform: `rotate(${(i-1)*8}deg)`, marginLeft: i > 0 ? '-1rem' : 0 }} />
                  ))}
                </div>
              </div>
              <h3 style={{ fontSize: '1.3rem', color: '#c9a84c', marginBottom: '0.4rem' }}>Basic Mode</h3>
              <p style={{ fontSize: '0.75rem', color: '#8b7b5a', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                5 cards each — Ace, King, Queen, Joker. Play face-down claiming they're the target. Jokers are always wild. Get caught lying? Face the revolver.
              </p>
              <p style={{ fontSize: '0.65rem', color: '#5a4a3a', marginBottom: '1rem', flex: 1 }}>4 players · USDC stakes · FHE-encrypted hands</p>
              <button className="btn green" style={{ width: '100%', fontSize: '1rem', padding: '0.7rem' }} onClick={() => navigate('/lobby')}>
                PLAY NOW
              </button>
            </div>
          </div>

          {/* Devil Mode — LIVE */}
          <div style={{ position: 'relative', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: -2, background: 'linear-gradient(to bottom, #e94560, #8b1a1a)', borderRadius: '0.85rem', opacity: 0.6, filter: 'blur(2px)' }} />
            <div style={{ position: 'relative', background: '#1a110d', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid rgba(233,69,96,0.3)', boxShadow: '0 0 20px rgba(233,69,96,0.15)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ background: '#e94560', color: '#fff', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>LIVE</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '4/3', background: '#251f12', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex' }}>
                  {['king1', 'devil1', 'queen1'].map((c, i) => (
                    <div key={i} className="playing-card" style={{ backgroundImage: `url(/playing_card/${c}.png)`, width: '3.5rem', transform: `rotate(${(i-1)*8}deg)`, marginLeft: i > 0 ? '-1rem' : 0 }} />
                  ))}
                </div>
              </div>
              <h3 style={{ fontSize: '1.3rem', color: '#e94560', marginBottom: '0.4rem' }}>Devil Mode</h3>
              <p style={{ fontSize: '0.75rem', color: '#8b7b5a', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                One Devil card lurks among 20. Play it alone and force every other player to face the barrel simultaneously. The Devil player is safe.
              </p>
              <p style={{ fontSize: '0.65rem', color: '#5a4a3a', marginBottom: '1rem', flex: 1 }}>4 players · Devil retribution · Multi-spin chaos</p>
              <button className="btn" style={{ width: '100%', fontSize: '1rem', padding: '0.7rem', borderColor: '#e94560', color: '#e94560' }} onClick={() => navigate('/lobby?mode=devil')}>
                PLAY NOW
              </button>
            </div>
          </div>

          {/* Chaos Mode — LIVE */}
          <div style={{ position: 'relative', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: -2, background: 'linear-gradient(to bottom, #a855f7, #6b1a8b)', borderRadius: '0.85rem', opacity: 0.6, filter: 'blur(2px)' }} />
            <div style={{ position: 'relative', background: '#1a110d', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 0 20px rgba(168,85,247,0.15)', display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ marginBottom: '1rem' }}>
                <span style={{ background: '#a855f7', color: '#fff', padding: '0.2rem 0.6rem', fontSize: '0.7rem', fontWeight: 'bold', letterSpacing: '0.1em' }}>LIVE</span>
              </div>
              <div style={{ width: '100%', aspectRatio: '4/3', background: '#251f12', borderRadius: '0.5rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex' }}>
                  {['master1', 'chaos1', 'king1'].map((c, i) => (
                    <div key={i} className="playing-card" style={{ backgroundImage: `url(/playing_card/${c}.png)`, width: '3.5rem', transform: `rotate(${(i-1)*8}deg)`, marginLeft: i > 0 ? '-1rem' : 0 }} />
                  ))}
                </div>
              </div>
              <h3 style={{ fontSize: '1.3rem', color: '#a855f7', marginBottom: '0.4rem' }}>Chaos Mode</h3>
              <p style={{ fontSize: '0.75rem', color: '#8b7b5a', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                3 cards each — King, Queen, Master, Chaos. Winners shoot opponents. The Master flips blame. The Chaos card triggers a simultaneous all-player firefight.
              </p>
              <p style={{ fontSize: '0.65rem', color: '#5a4a3a', marginBottom: '1rem', flex: 1 }}>4 players · Target shooting · Chaos trigger</p>
              <button className="btn" style={{ width: '100%', fontSize: '1rem', padding: '0.7rem', borderColor: '#a855f7', color: '#a855f7' }} onClick={() => navigate('/lobby?mode=chaos')}>
                PLAY NOW
              </button>
            </div>
          </div>

        </section>

        {/* Built on Zama fhEVM */}
        <section style={{ padding: '3rem 2rem', background: '#1a110d', borderRadius: '0.75rem', border: '1px solid rgba(184,115,51,0.2)', position: 'relative', overflow: 'hidden', marginBottom: '3rem' }}>
          {/* Zama logo — right side, top to bottom opacity fade */}
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 260,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
            pointerEvents: 'none',
          }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to bottom, #1a110d 0%, transparent 25%, transparent 75%, #1a110d 100%)',
              zIndex: 2,
            }} />
            <div style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 60,
              background: 'linear-gradient(to right, #1a110d, transparent)',
              zIndex: 2,
            }} />
            <img
              src="/logo-zama-typoblack.png"
              alt="Zama"
              style={{
                width: 220, opacity: 0.08,
                filter: 'invert(1) sepia(1) saturate(2) hue-rotate(5deg)',
                position: 'relative', zIndex: 1,
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1rem', position: 'relative', zIndex: 3 }}>
            <img src="/z-square_yellow.png" alt="Zama" style={{ width: 32, height: 32, borderRadius: '6px' }} />
            <h2 style={{ fontSize: '1.5rem', color: '#c9a84c' }}>Built on Zama fhEVM</h2>
          </div>
          <p style={{ color: '#8b7b5a', fontSize: '0.85rem', maxWidth: 600, lineHeight: 1.7, marginBottom: '2rem', position: 'relative', zIndex: 3 }}>
            Every card in your hand is an encrypted <code style={{ color: '#c9a84c', fontSize: '0.8rem' }}>euint8</code> on-chain — invisible to opponents, the contract, and even the chain itself until challenge. The bullet position in each revolver chamber is generated by Zama's FHE coprocessor and never exposed as plaintext.
          </p>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', position: 'relative', zIndex: 3 }}>
            {[
              'FHE-Encrypted Cards',
              'Hidden Bullet Position',
              'KMS-Verified Results',
              'Ethereum Sepolia',
            ].map((label, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#c9a84c', fontSize: '0.9rem' }}>●</span>
                <span style={{ fontSize: '0.7rem', color: '#8b7b5a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer style={{ borderTop: '1px solid rgba(184,115,51,0.2)', padding: '2rem 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div>
            <span style={{ fontSize: '1.1rem', fontStyle: 'italic', color: '#c9a84c' }}>Bluff and Barrel</span>
            <p style={{ fontSize: '0.65rem', color: '#5a4a3a', marginTop: '0.3rem' }}>© 2026 The Underground. For the deceptive only.</p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem' }}>
            {['Discord', 'Twitter', 'GitHub'].map(link => (
              <a key={link} href="#" style={{ fontSize: '0.75rem', color: '#8b7b5a', textDecoration: 'none', letterSpacing: '0.1em' }}>{link.toUpperCase()}</a>
            ))}
            <a href="/btc-market" style={{ fontSize: '0.75rem', color: '#8b7b5a', textDecoration: 'none', letterSpacing: '0.1em' }}>BTC MARKET</a>
            <a href="/roadmap" style={{ fontSize: '0.75rem', color: '#c9a84c', textDecoration: 'none', letterSpacing: '0.1em' }}>ROADMAP</a>
          </div>
        </footer>

      </div>
    </div>
  );
}
