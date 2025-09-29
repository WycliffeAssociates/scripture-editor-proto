export function debounce<T extends (...args: any[]) => void>(
    func: T,
    delay: number,
): (...args: Parameters<T>) => void {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return (...args: Parameters<T>): void => {
        const next = () => {
            timeoutId = null;
            func(...args);
        };
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(next, delay);
    };
}
