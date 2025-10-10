import React, { createContext, useContext } from 'react';
import { IMd5Service } from "@/../src-core/domain/md5/IMd5Service.ts";

interface Md5ContextType {
    md5Service: IMd5Service | null;
}

const Md5Context = createContext<Md5ContextType | undefined>(undefined);

export const Md5Provider: React.FC<{ children: React.ReactNode; md5Service: IMd5Service }> = ({ children, md5Service }) => {
    return (
        <Md5Context.Provider value={{ md5Service }}>
            {children}
        </Md5Context.Provider>
    );
};

export const useMd5 = () => {
    const context = useContext(Md5Context);
    if (context === undefined) {
        throw new Error('useMd5 must be used within a Md5Provider');
    }
    return context.md5Service;
};
