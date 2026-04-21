import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';

const AnimatedCounter = ({ to }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, latest => Math.round(latest));

  useEffect(() => {
    const controls = animate(count, to, {
      duration: 2,
      ease: "easeOut"
    });
    return () => controls.stop();
  }, [to]);

  return <motion.span>{rounded}</motion.span>;
};

export default AnimatedCounter;
