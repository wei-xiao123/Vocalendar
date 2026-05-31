import { motion } from 'motion/react';
import { Mic } from 'lucide-react';

interface VoiceOrbProps {
  isGuest: boolean;
  isActive: boolean;
  label?: string;
  onClick: () => void;
}

export function VoiceOrb({ isActive, label, onClick }: VoiceOrbProps) {
  return (
    <div className="relative flex items-center justify-center flex-col">
      <div className="w-[300px] h-[300px] flex items-center justify-center relative">
        {/* Soft greenish halo layers */}
        <motion.div 
          className="absolute w-[240px] h-[240px] rounded-full bg-gradient-to-tr from-[#E6EBD9] via-[#EAEEDB] to-[#F2F4ED] blur-[32px] pointer-events-none"
          animate={isActive ? { scale: [1, 1.1, 1], opacity: [0.7, 0.9, 0.7] } : { scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        
        {/* Defined Border halos */}
        <div className="absolute w-[220px] h-[220px] rounded-full border border-white/60 shadow-[0_0_50px_rgba(255,255,255,0.7)_inset] pointer-events-none"></div>
        <div className="absolute w-[180px] h-[180px] rounded-full border border-white/90 shadow-[0_0_40px_rgba(255,255,255,0.6)_inset,0_0_40px_rgba(200,230,210,0.3)] pointer-events-none"></div>

        {/* Main Orb Container */}
        <div className="relative flex items-center justify-center z-10 w-[140px] h-[140px]">
          <motion.button
            aria-label={label}
            onClick={onClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            animate={isActive ? {
              boxShadow: "0 0 60px rgba(150,200,170,0.4), inset 0 0 20px rgba(255,255,255,0.9)"
            } : {
              boxShadow: "0 0 40px rgba(150,200,170,0.2), inset 0 0 20px rgba(255,255,255,0.9)"
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="w-full h-full rounded-full flex items-center justify-center overflow-hidden relative bg-gradient-to-b from-[#F9FAF5] to-[#E2EBDC] border border-white shadow-xl backdrop-blur-md"
          >
            {/* Glossy top reflection */}
            <div className="absolute top-[-20%] left-[10%] w-[80%] h-[60%] bg-gradient-to-b from-white/80 to-transparent rounded-full pointer-events-none transform -rotate-12" />

            {isActive ? (
              <div className="flex gap-1.5 items-center relative z-10">
                <motion.div animate={{ height: [12, 24, 12] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 bg-[#5D7061] rounded-full" />
                <motion.div animate={{ height: [16, 32, 16] }} transition={{ repeat: Infinity, duration: 0.5 }} className="w-1.5 bg-[#5D7061] rounded-full" />
                <motion.div animate={{ height: [24, 16, 24] }} transition={{ repeat: Infinity, duration: 0.7 }} className="w-1.5 bg-[#435948] rounded-full" />
                <motion.div animate={{ height: [16, 24, 16] }} transition={{ repeat: Infinity, duration: 0.8 }} className="w-1.5 bg-[#5D7061] rounded-full" />
                <motion.div animate={{ height: [10, 16, 10] }} transition={{ repeat: Infinity, duration: 0.6 }} className="w-1.5 bg-[#5D7061] rounded-full" />
              </div>
            ) : (
              <Mic className="h-[44px] w-[44px] text-[#55695D] relative z-10" strokeWidth={1.5} />
            )}
          </motion.button>
        </div>
      </div>
    </div>
  );
}
