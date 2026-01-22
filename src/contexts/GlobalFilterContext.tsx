import React, { createContext, useContext, useState, useEffect } from 'react';

interface GlobalFilterContextType {
  pinnedDeskId: string | null;
  pinnedBrandId: string | null;
  pinnedDeskName: string | null;
  pinnedBrandName: string | null;
  setPinnedDesk: (id: string | null, name: string | null) => void;
  setPinnedBrand: (id: string | null, name: string | null) => void;
  clearFilters: () => void;
  hasActiveFilter: boolean;
}

const GlobalFilterContext = createContext<GlobalFilterContextType | undefined>(undefined);

const STORAGE_KEY_DESK = 'tiusdei_pinned_desk';
const STORAGE_KEY_BRAND = 'tiusdei_pinned_brand';

export function GlobalFilterProvider({ children }: { children: React.ReactNode }) {
  const [pinnedDeskId, setPinnedDeskId] = useState<string | null>(null);
  const [pinnedBrandId, setPinnedBrandId] = useState<string | null>(null);
  const [pinnedDeskName, setPinnedDeskName] = useState<string | null>(null);
  const [pinnedBrandName, setPinnedBrandName] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const savedDesk = localStorage.getItem(STORAGE_KEY_DESK);
    const savedBrand = localStorage.getItem(STORAGE_KEY_BRAND);
    
    if (savedDesk) {
      const parsed = JSON.parse(savedDesk);
      setPinnedDeskId(parsed.id);
      setPinnedDeskName(parsed.name);
    }
    if (savedBrand) {
      const parsed = JSON.parse(savedBrand);
      setPinnedBrandId(parsed.id);
      setPinnedBrandName(parsed.name);
    }
  }, []);

  const setPinnedDesk = (id: string | null, name: string | null) => {
    setPinnedDeskId(id);
    setPinnedDeskName(name);
    if (id && name) {
      localStorage.setItem(STORAGE_KEY_DESK, JSON.stringify({ id, name }));
    } else {
      localStorage.removeItem(STORAGE_KEY_DESK);
    }
  };

  const setPinnedBrand = (id: string | null, name: string | null) => {
    setPinnedBrandId(id);
    setPinnedBrandName(name);
    if (id && name) {
      localStorage.setItem(STORAGE_KEY_BRAND, JSON.stringify({ id, name }));
    } else {
      localStorage.removeItem(STORAGE_KEY_BRAND);
    }
  };

  const clearFilters = () => {
    setPinnedDesk(null, null);
    setPinnedBrand(null, null);
  };

  const hasActiveFilter = pinnedDeskId !== null || pinnedBrandId !== null;

  return (
    <GlobalFilterContext.Provider value={{
      pinnedDeskId,
      pinnedBrandId,
      pinnedDeskName,
      pinnedBrandName,
      setPinnedDesk,
      setPinnedBrand,
      clearFilters,
      hasActiveFilter,
    }}>
      {children}
    </GlobalFilterContext.Provider>
  );
}

export function useGlobalFilter() {
  const context = useContext(GlobalFilterContext);
  if (context === undefined) {
    throw new Error('useGlobalFilter must be used within a GlobalFilterProvider');
  }
  return context;
}
