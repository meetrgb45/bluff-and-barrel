import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const phases = [
  {
    date: 'July 2026',
    title: 'Basic Mode',
    status: 'live',
    img: '/card-barrel.png',
    desc: 'The flagship bluffing game on Ethereum Sepolia. 4 players, FHE-encrypted hands, Russian Roulette revolver. Jokers are wild. Last player standing wins the USDC pot.',
    items: ['5 cards per player', 'USDC stakes', 'FHE-encrypted hands', '8 characters', 'Ethereum Sepolia'],
    cards: ['ace1', 'king1', 'queen1'],
  },
  {
    date: 'August 2026',
    title: 'Devil Mode',
    status: 'live',
    img: '/card-barrel.png',
    desc: 'One Devil card hides among 20. Play it alone and force every other player to face the barrel simultaneously. The most explosive reveal in the game.',
    items: ['Devil retribution mechanic', 'Multi-spin resolution', 'Double-spin ability', 'Same FHE stack'],
    cards: ['king1', 'devil1', 'joker1'],
  },
  {
    date: 'August 2026',
    title: 'Chaos Mode',
    status: 'live',
    img: '/card-barrel.png',
    desc: '3 cards each. Winners don\'t spin — they shoot. The Master card flips the blame. The Chaos card triggers a simultaneous all-player firefight.',
    items: ['3-card hands', 'Target selection mechanic', 'Master + Chaos specials', 'Multi-target resolution'],
    cards: ['master1', 'chaos1', 'queen1'],
  },
  {
    date: 'October 2026',
    title: 'BTC Mini-Market',
    status: 'next',
    img: '/btc-market.png',
    desc: 'During the FHE dealing window, players secretly bet UP or DOWN on 1-minute BTC price. Correct call earns a Shield — survive one revolver pull you\'d otherwise lose.',
    items: ['Encrypted BTC prediction', 'Shield mechanic', 'Chainlink price feed', 'Zama fhEVM powered'],
    cards: ['ace1', 'king1', 'back1'],
  },
  {
    date: 'Devcon Mumbai, November 2026',
    title: 'Tournament Mode',
    status: 'upcoming',
    img: '/tournament.png',
    desc: 'Tournament during Devcon Mumbai. 64 players. Bracket elimination. Live spectator mode. ELO rankings persist on-chain. Real prize pool from entry fees, not inflation.',
    items: ['64-player bracket', 'Live spectator mode', 'On-chain ELO', 'Entry fee prize pool'],
    cards: ['ace1', 'devil1', 'chaos1'],
  },
  {
    date: 'Q1 2027',
    title: 'Dice and Barrel',
    status: 'upcoming',
    img: '/dice-barrel.png',
    desc: 'Hidden dice, public bids. Bluff about what the table holds. Get caught in a lie? Face the barrel. A game of probability, deception, and encrypted odds.',
    items: ['5 hidden dice each', 'Bid or call LIAR', 'All-or-nothing reveal', 'FHE-encrypted rolls'],
    cards: ['back1', 'joker1', 'ace1'],
  },
  {
    date: 'Q1 2027',
    title: 'Slot and Barrel',
    status: 'upcoming',
    img: '/slot-barrel.png',
    desc: 'Encrypted slot machines. Claim your symbol count. Skulls trigger the Death Spin. The most chaotic mode yet — three hidden reels, infinite deception.',
    items: ['3 hidden symbols', 'Death Spin mechanic', 'Symbol bluffing', 'Double chamber risk'],
    cards: ['back1', 'king1', 'queen1'],
  },
  {
    date: 'Q1 2027',
    title: 'Bring Your Character NFTs',
    status: 'upcoming',
    img: '/nft-characters.png',
    desc: 'Your mask. Your identity. Mint exclusive characters with unique death animations, voice lines, and reduced platform fees at premium tables.',
    items: ['20+ unique characters', 'Reduced platform fees', 'Exclusive tables', 'ERC-721 on Ethereum'],
    cards: ['back1', 'ace1', 'queen1'],
  },
  {
    date: 'Q1 2027',
    title: '$BLUFF Token',
    status: 'upcoming',
    img: '/token.png',
    desc: 'FHE-shielded balances — nobody sees your stack. Earn by playing, stake for governance, use as alternative stakes at any table.',
    items: ['Shielded ERC-20 balance', 'Play-to-earn', 'Governance votes', 'Alternative stakes'],
    cards: ['joker1', 'king1', 'ace1'],
  },
];

const statusColor = {
  live: '#22c55e',
  next: '#c9a84c',
  upcoming: '#5a4a3a',
};
const statusLabel = {
  live: 'LIVE',
  next: 'NEXT',
  upcoming: 'PLANNED',
};

export default function Roadmap() {
  useEffect(() => {
    document.documentElement.classList.add('scrollable');
    return () => document.documentElement.classList.remove('scrollable');
  }, []);

  const navigate = useNavigate();

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: '3rem 1rem' }}>
      <div style={{ maxWidth: 950, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#c9a84c', marginBottom: '0.5rem' }}>Roadmap</h1>
          <p style={{ color: '#8b7b5a', fontSize: '0.9rem' }}>Building the future of on-chain social deception</p>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          {/* Center line */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#3a2a1a', transform: 'translateX(-1px)' }} />

          {phases.map((phase, i) => {
            const isLeft = i % 2 === 0;
            const color = statusColor[phase.status as keyof typeof statusColor];
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'stretch', marginBottom: '3.5rem', flexDirection: isLeft ? 'row' : 'row-reverse' }}>
                {/* Card */}
                <div style={{ width: '45%' }}>
                  <div style={{ borderRadius: '0.7rem', overflow: 'hidden', border: `1px solid ${phase.status === 'live' ? '#22c55e40' : '#3a2a1a'}`, background: '#1a110d', position: 'relative', minHeight: 220 }}>
                    {/* Phase image with dark overlay */}
                    <div style={{ position: 'relative', height: 110, overflow: 'hidden' }}>
                      <div style={{
                        position: 'absolute', inset: 0,
                        backgroundImage: `url(${(phase as any).img})`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        opacity: phase.status === 'live' ? 0.7 : 0.35,
                      }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 30%, #1a110d 100%)' }} />
                      {/* Cards overlaid only for Basic/Devil/Chaos card modes */}
                      {['Basic Mode', 'Devil Mode', 'Chaos Mode'].includes(phase.title) && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', paddingBottom: '0.5rem' }}>
                          {phase.cards.map((c, j) => (
                            <div key={j} className="playing-card" style={{
                              backgroundImage: `url(/playing_card/${c}.png)`,
                              width: '2.8rem',
                              transform: `rotate(${(j - 1) * 7}deg)`,
                              marginLeft: j > 0 ? '-0.6rem' : 0,
                              opacity: phase.status === 'live' ? 1 : 0.7,
                              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))',
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Content */}
                    <div style={{ padding: '1rem 1.2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <p style={{ fontSize: '0.65rem', color: '#c9a84c', letterSpacing: '0.05em', margin: 0 }}>{phase.date}</p>
                        <span style={{
                          fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '0.2rem',
                          background: `${color}20`, color, border: `1px solid ${color}`,
                        }}>
                          {statusLabel[phase.status as keyof typeof statusLabel]}
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.1rem', color: '#fff', margin: '0 0 0.5rem' }}>{phase.title}</h3>
                      <p style={{ fontSize: '0.78rem', color: '#8b7b5a', margin: '0 0 0.7rem', lineHeight: 1.5 }}>{phase.desc}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {phase.items.map((item, j) => (
                          <span key={j} style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', background: '#ffffff10', color: '#8b7b5a', border: '1px solid #3a2a1a' }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Center dot */}
                <div style={{ width: '10%', display: 'flex', justifyContent: 'center', paddingTop: '3rem' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', zIndex: 2,
                    background: phase.status === 'upcoming' ? '#2a1a0a' : color,
                    border: `3px solid ${color}`,
                    boxShadow: phase.status !== 'upcoming' ? `0 0 12px ${color}60` : 'none',
                  }} />
                </div>

                {/* Empty side */}
                <div style={{ width: '45%' }} />
              </div>
            );
          })}
        </div>

        {/* Back */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn" onClick={() => navigate('/')} style={{ padding: '0.5rem 2rem' }}>Back to Home</button>
        </div>

      </div>
    </div>
  );
}
