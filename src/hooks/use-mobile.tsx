import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const isTouchDevice = () => {
      return typeof navigator !== 'undefined' && (
        navigator.maxTouchPoints > 0 ||
        (navigator as any).msMaxTouchPoints > 0 ||
        'ontouchstart' in window ||
        window.matchMedia('(pointer: coarse)').matches
      );
    };

    const updateMode = () => {
      setIsMobile(isTouchDevice() || window.innerWidth < MOBILE_BREAKPOINT);
    };

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    mediaQuery.addEventListener("change", updateMode);
    window.addEventListener("resize", updateMode);
    updateMode();

    return () => {
      mediaQuery.removeEventListener("change", updateMode);
      window.removeEventListener("resize", updateMode);
    };
  }, []);

  return isMobile;
}
