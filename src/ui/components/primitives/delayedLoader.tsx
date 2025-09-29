import { useEffect, useState } from "react";

function DelayedLoader({
    isLoading,
    delay = 30,
    fallback,
}: {
    isLoading: boolean;
    delay?: number;
    fallback: React.ReactNode;
}) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (isLoading) {
            timeout = setTimeout(() => setShow(true), delay);
        } else {
            setShow(false);
        }
        return () => clearTimeout(timeout);
    }, [isLoading, delay]);

    return <>{show ? fallback : null}</>;
}

export { DelayedLoader };
