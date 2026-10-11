import { motion, AnimatePresence } from "framer-motion";

export function RevealModal({ text, onContinue }: { text: string | null; onContinue: () => void }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div className="reveal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="reveal-panel"
            initial={{ opacity: 0, scale: 0.9, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
          >
            <div className="reveal-text">{text}</div>
            <button className="reveal-continue" onClick={onContinue}>
              Keep swiping
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
