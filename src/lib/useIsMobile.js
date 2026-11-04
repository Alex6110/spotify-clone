import { useEffect, useState } from 'react';

const query = '(max-width: 768px)';
/** true su schermi stretti (lo stesso limite usato dal layout dell'app). */
export function useIsMobile() {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
