import { PropsWithChildren, Suspense } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import InitClientDB from '@/features/InitClientDB';
import '@xyflow/react/dist/style.css';
import BrandTextLoading from '@/components/Loading/BrandTextLoading';

export default ({ children }: PropsWithChildren) => {

  return (
    <ReactFlowProvider>
      <Suspense fallback={<BrandTextLoading />}>
        {children}
      </Suspense>
      <InitClientDB />
    </ReactFlowProvider>
  )
};
