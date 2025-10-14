'use client';

import Canvas from './Canvas';
import BrandTextLoading from '@/components/Loading/BrandTextLoading';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

export default function GraphCanvas() {

    const isDBInited = useGlobalStore(systemStatusSelectors.isDBInited)

    // TODO: add skeleton loading
    return (
        isDBInited ? <Canvas /> : <BrandTextLoading />
    );
}