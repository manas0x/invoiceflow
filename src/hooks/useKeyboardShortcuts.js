import { useEffect } from 'react';

/**
 * Custom hook to handle keyboard shortcuts.
 * @param {Array<{key: string, ctrl: boolean, alt: boolean, shift: boolean, action: () => void, preventDefault: boolean}>} shortcuts 
 * @param {Array<any>} deps 
 */
const useKeyboardShortcuts = (shortcuts, deps = []) => {
    useEffect(() => {
        const handleKeyDown = (event) => {
            shortcuts.forEach(({ key, ctrl = false, alt = false, shift = false, action, preventDefault = true }) => {
                const isKeyMatch = event.key.toLowerCase() === key.toLowerCase();
                const isCtrlMatch = ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
                const isAltMatch = alt ? event.altKey : !event.altKey;
                const isShiftMatch = shift ? event.shiftKey : !event.shiftKey;

                if (isKeyMatch && isCtrlMatch && isAltMatch && isShiftMatch) {
                    if (preventDefault) {
                        event.preventDefault();
                    }
                    action(event);
                }
            });
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, deps);
};

export default useKeyboardShortcuts;
