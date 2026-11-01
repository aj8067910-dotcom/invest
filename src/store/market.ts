// Armazenamento dos dados de mercado (separado do livro pessoal e da nuvem: é sempre
// reconstruído a partir do arquivo publicado pelo robô).
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { emptyMarket, type MarketData } from '../domain/market';

interface MarketState extends MarketData {
  setMarket: (m: Partial<MarketData>) => void;
}

export const useMarket = create<MarketState>()(
  persist(
    (set) => ({
      ...emptyMarket(),
      setMarket: (m) => set(() => ({ ...m })),
    }),
    {
      name: 'radar-market-v1',
      storage: createJSONStorage(() => ({
        getItem: async (k) => ((await idbGet(k).catch(() => null)) as string | null) ?? null,
        setItem: async (k, v) => {
          await idbSet(k, v).catch(() => {});
        },
        removeItem: async (k) => {
          await idbDel(k).catch(() => {});
        },
      })),
      partialize: ({ setMarket: _s, ...rest }) => rest,
    },
  ),
);
