import React from 'react';

export const isPrimaryPointer = (event) => event.pointerType === 'touch' || event.button === 0;

export const getPointerPoint = (event) => ({
  clientX: event.clientX,
  clientY: event.clientY,
});

function usePointerDrag(activeDrag, onMove, onEnd) {
  React.useEffect(() => {
    if (!activeDrag) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      if (event.pointerType === 'touch') {
        event.preventDefault();
      }

      onMove(event, getPointerPoint(event));
    };

    const handlePointerEnd = () => {
      onEnd();
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
    };
  }, [activeDrag, onEnd, onMove]);
}

export default usePointerDrag;