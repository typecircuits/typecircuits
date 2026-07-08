export const debounce = <Args extends any[]>(timeout: number, f: (...args: Args) => void) => {
    let timeoutId: number;
    return (...args: Args) => {
        window.clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => f(...args), timeout);
    };
};
