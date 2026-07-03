import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SpinOutcome } from '../../hooks/useSpin';
import { sounds } from '../../lib/sounds';

/**
 * SpinAnimation phases (strict sequence, no overlap):
 *
 *  spinning=true, outcome=null  →  phase='spinning'   (revolver spinning)
 *  spinning=false, outcome=null →  phase='pending'    (brief 400ms fade-out gap)
 *  spinning=false, outcome≠null →  phase='result'     (bang or click screen)
 *  onDismiss called             →  hidden
 */

type AnimPhase = 'spinning' | 'pending' | 'result' | null;

interface Props {
  outcome: SpinOutcome;
  spinning: boolean;
  onDismiss: () => void;
  blocked?: boolean; // true = suppress entirely (challenge overlay still showing)
}

export default function SpinAnimation({ outcome, spinning, onDismiss, blocked = false }: Props) {
  const [phase, setPhase] = useState<AnimPhase>(null);

  useEffect(() => {
    if (blocked) { setPhase(null); return; }
    if (spinning && !outcome) {
      setPhase('spinning');
    } else if (!spinning && !outcome && phase === 'spinning') {
      // Spinning just stopped but result not yet set — brief fade-out gap
      setPhase('pending');
      const t = setTimeout(() => setPhase(null), 500);
      return () => clearTimeout(t);
    } else if (outcome) {
      setPhase('result');
      // Auto-dismiss after 8s if player doesn't tap — then next phase can render
      const t = setTimeout(() => { setPhase(null); onDismiss(); }, 8000);
      return () => clearTimeout(t);
    } else if (!spinning && !outcome) {
      setPhase(null);
    }
  }, [spinning, outcome, blocked]);

  // Sounds — fire exactly once per phase
  useEffect(() => {
    if (phase === 'spinning') sounds.revolverSpin();
  }, [phase]);

  useEffect(() => {
    if (outcome === 'click') sounds.click();
    if (outcome === 'bang') sounds.gunShot();
  }, [outcome]);

  return (
    <AnimatePresence mode="wait">
      {phase === 'spinning' && (
        <motion.div
          key="spinning"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}
        >
          <motion.div style={{ textAlign: 'center' }}>
            <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 150, margin: '0 auto 1.5rem' }} />
            <p style={{ fontSize: '1.2rem', color: '#dfd5b4', fontStyle: 'italic' }}>Pulling the trigger...</p>
          </motion.div>
        </motion.div>
      )}

      {/* Blank frame between spinning and result — prevents overlap */}
      {phase === 'pending' && (
        <motion.div
          key="pending"
          initial={{ opacity: 1 }}
          animate={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)' }}
        />
      )}

      {phase === 'result' && outcome === 'click' && (
        <motion.div
          key="click"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overlay-safe"
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', cursor: 'pointer' }}
          onClick={onDismiss}
        >
          <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 10 }} style={{ textAlign: 'center' }}>
            <img src="/revolver_chamber.png" alt="" style={{ width: 100, margin: '0 auto 1rem', opacity: 0.3 }} />
            <h1 style={{ fontSize: '3.5rem', color: '#8b8b8b', fontStyle: 'italic', textShadow: '0 0 10px rgba(150,150,150,0.3)' }}>*click*</h1>
            <p style={{ fontSize: '1rem', color: '#abcfb8', marginTop: '0.5rem' }}>Survived.</p>
            <p style={{ fontSize: '0.75rem', color: '#8b7b5a', fontStyle: 'italic', marginTop: '0.3rem' }}>You live... for now.</p>
            <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '2rem' }}>tap to continue</p>
          </motion.div>
        </motion.div>
      )}

      {phase === 'result' && outcome === 'bang' && (
        <motion.div
          key="bang"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overlay-bang"
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.9)', cursor: 'pointer' }}
          onClick={onDismiss}
        >
          <motion.div initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 8 }} style={{ textAlign: 'center' }}>
            <img src="/boom.png" alt="" style={{ width: 80, margin: '0 auto 1rem', filter: 'drop-shadow(0 0 20px #e94560)' }} />
            <h1 style={{ fontSize: '4rem', color: '#e94560', textShadow: '0 0 30px rgba(233,69,96,0.8), 0 0 60px rgba(139,26,26,0.5)', textTransform: 'uppercase' }}>BANG!</h1>
            <p style={{ fontSize: '1rem', color: '#ffb4ab', marginTop: '0.5rem' }}>Eliminated.</p>
            <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '2rem' }}>tap to continue</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
