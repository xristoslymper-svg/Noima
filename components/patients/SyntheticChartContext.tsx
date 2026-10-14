'use client';
import {createContext,useContext} from 'react';
export const SyntheticChartContext=createContext(false);
export function useSyntheticChart(){return useContext(SyntheticChartContext)}
