'use client';
import {createContext,useContext} from 'react';
export const SyntheticChartContext=createContext(false);
export function useSyntheticChart(){return useContext(SyntheticChartContext)}

import type {ReceivedHistory} from '@/lib/intake/patient-report';
export type SyntheticHistoryPreview={records:ReceivedHistory[];unavailable:boolean;onRetry:()=>void};
export const SyntheticHistoryPreviewContext=createContext<SyntheticHistoryPreview|null>(null);
export function useSyntheticHistoryPreview(){return useContext(SyntheticHistoryPreviewContext)}
