import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { mapSelectionApi, subjectsApi } from '@/lib/api';

const maps = [
  {
    id: "map1",
    name: "ANCIENT FOREST KINGDOM",
    description: "Master the foundations in the depths of an ancient realm",
    image: "/maps/map1.jpg",
    theme: "Forest"
  },
  {
    id: "map2",
    name: "DESERT RUINS EMPIRE",
    description: "Uncover knowledge buried beneath golden sands",
    image: "/maps/map2.jpg",
    theme: "Desert"
  },
  {
    id: "map3",
    name: "FROZEN TUNDRA REALM",
    description: "Brave the cold and conquer complex concepts",
    image: "/maps/map3.jpg",
    theme: "Ice"
  },
  {
    id: "map4",
    name: "VOLCANIC DARK LANDS",
    description: "Forge your understanding in the fires of challenge",
    image: "/maps/map4.jpg",
    theme: "Volcanic"
  },
  {
    id: "map5",
    name: "MYSTICAL FLOATING ISLANDS",
    description: "Elevate your mind to new heights of understanding",
    image: "/maps/map5.jpg",
    theme: "Mystic"
  },
  {
    id: "map6",
    name: "NEON CYBER CITY",
    description: "Navigate the digital frontier of modern knowledge",
    image: "/maps/map6.jpg",
    theme: "Cyber"
  }
];

export default function MapLobbyPage() {
  const { subjectId, moduleNumber } = useParams<{ subjectId: string; moduleNumber: string }>();
  const navigate = useNavigate();
  const modNum = Number(moduleNumber);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);

  // Get subject name from subjects list
  const { data: subjects } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsApi.list().then((r) => r.data),
  });
  const subject = subjects?.find((s) => s.id === subjectId);
  const subjectName = subject?.name ?? 'Subject';

  // Load previously saved map selection and pre-select it
  const { data: savedSelection } = useQuery({
    queryKey: ['mapselection', subjectId, moduleNumber],
    queryFn: () => mapSelectionApi.getSelectedMap(subjectId!, modNum).then((r) => r.data),
    enabled: !!subjectId && Number.isFinite(modNum),
  });

  useEffect(() => {
    if (savedSelection?.selected_map) {
      const idx = maps.findIndex((m) => m.id === savedSelection.selected_map);
      if (idx !== -1) setCurrentIndex(idx);
    }
  }, [savedSelection]);

  // Save selection + navigate
  const { mutate: selectMap, isPending } = useMutation({
    mutationFn: (mapId: string) =>
      mapSelectionApi.saveSelectedMap(subjectId!, modNum, mapId).then((r) => r.data),
    onSuccess: () => navigate(`/modulemap/${subjectId}/${moduleNumber}`),
    onError: () => navigate(`/modulemap/${subjectId}/${moduleNumber}`),
  });

  const handleNext = useCallback(() => {
    setDirection(1);
    setCurrentIndex((prev) => (prev === maps.length - 1 ? 0 : prev + 1));
  }, []);

  const handlePrev = useCallback(() => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev === 0 ? maps.length - 1 : prev - 1));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
      if (e.key === 'Enter') selectMap(maps[currentIndex].id);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, currentIndex, selectMap]);

  const currentMap = maps[currentIndex];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 1000 : -1000,
      opacity: 0,
      scale: 1.1
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: { duration: 0.6, ease: [0.25, 1, 0.5, 1] as const }
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 1000 : -1000,
      opacity: 0,
      scale: 0.9,
      transition: { duration: 0.5, ease: [0.25, 1, 0.5, 1] as const }
    })
  };

  const textVariants = {
    initial: { y: 40, opacity: 0 },
    animate: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.5, delay: 0.2, ease: "easeOut" as const }
    },
    exit: {
      y: -40,
      opacity: 0,
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="relative h-screen w-screen bg-[#0a0a0f] text-white overflow-hidden font-sans select-none flex flex-col justify-between">

      {/* Background Map Image */}
      <AnimatePresence initial={false} custom={direction}>
        <motion.img
          key={currentIndex}
          src={currentMap.image}
          alt={currentMap.name}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      </AnimatePresence>

      {/* Vignette overlays */}
      <div className="absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-transparent via-[#0a0a0f]/60 to-[#0a0a0f] pointer-events-none" />
      <div className="absolute inset-0 z-10 bg-gradient-to-t from-[#0a0a0f] via-transparent to-[#0a0a0f]/80 pointer-events-none" />
      <div className="absolute inset-0 z-10 bg-gradient-to-r from-[#0a0a0f] via-transparent to-[#0a0a0f] pointer-events-none" />

      {/* Top Stats Bar */}
      <div className="relative z-20 w-full p-8 flex justify-between items-start">
        <div className="flex flex-col gap-1">
          <div className="text-amber-500 text-sm font-bold tracking-widest uppercase">
            Module {moduleNumber}
          </div>
          <div className="text-3xl font-black tracking-widest uppercase opacity-90 drop-shadow-lg">
            {subjectName}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-gray-400 text-sm font-bold tracking-widest uppercase">
            Sarvagna Platform
          </div>
          <div className="text-xl font-bold tracking-wider text-teal-400 opacity-80 drop-shadow-md">
            LOBBY
          </div>
        </div>
      </div>

      {/* Left/Right Navigation Arrows */}
      <div className="absolute top-1/2 left-0 w-full -translate-y-1/2 flex justify-between px-8 z-30 pointer-events-none">
        <button
          onClick={handlePrev}
          className="pointer-events-auto bg-[#0a0a0f]/60 hover:bg-[#0a0a0f]/90 border border-white/10 text-white p-4 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 group"
        >
          <ChevronLeft size={36} className="group-hover:-translate-x-1 transition-transform" />
        </button>
        <button
          onClick={handleNext}
          className="pointer-events-auto bg-[#0a0a0f]/60 hover:bg-[#0a0a0f]/90 border border-white/10 text-white p-4 rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110 active:scale-95 group"
        >
          <ChevronRight size={36} className="group-hover:translate-x-1 transition-transform" />
        </button>
      </div>

      {/* Bottom Content Area */}
      <div className="relative z-20 w-full px-12 pb-12 flex flex-col items-center">

        {/* Map Name and Description */}
        <div className="flex flex-col items-center text-center h-32 justify-end mb-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentIndex}
              variants={textVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col items-center"
            >
              <h1 className="text-6xl font-black tracking-[0.2em] uppercase text-white drop-shadow-[0_5px_15px_rgba(0,0,0,0.8)] mb-4">
                {currentMap.name}
              </h1>
              <p className="text-xl text-gray-300 font-medium tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] max-w-2xl">
                {currentMap.description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Action Bar */}
        <div className="w-full flex justify-between items-end border-t border-white/10 pt-8">

          <button
            onClick={() => navigate(`/map/${subjectId}`)}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors duration-200 font-bold tracking-widest uppercase group"
          >
            <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            Back
          </button>

          <div className="text-gray-500 font-bold tracking-[0.3em] text-lg flex items-center h-full pb-4">
            {currentIndex + 1} / {maps.length}
          </div>

          <button
            onClick={() => selectMap(currentMap.id)}
            disabled={isPending}
            className="bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-[#0a0a0f] px-12 py-5 font-black text-2xl tracking-widest uppercase transform transition-all duration-300 shadow-[0_0_30px_rgba(245,158,11,0.4)] hover:shadow-[0_0_50px_rgba(245,158,11,0.8)] hover:-translate-y-1 active:translate-y-0"
            style={{
              clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)'
            }}
          >
            {isPending ? 'Entering…' : 'Begin Conquest'}
          </button>

        </div>
      </div>

    </div>
  );
}
