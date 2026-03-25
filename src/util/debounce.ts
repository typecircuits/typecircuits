export const debounce = (timeout: number, f: () => void) => {
    let timeoutId: number;
    return () => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(f, timeout);
    };
};
