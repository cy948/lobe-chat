import { PropsWithChildren } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import InitClientDB from '@/features/InitClientDB';
import '@xyflow/react/dist/style.css';

export default ({ children }: PropsWithChildren) => {

  return (
    <ReactFlowProvider>
      {children}
      <InitClientDB />
    </ReactFlowProvider>
  )
};
