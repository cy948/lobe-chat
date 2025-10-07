import { PropsWithChildren } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default ({ children }: PropsWithChildren) => {

  return (
    <ReactFlowProvider>
      {children}
    </ReactFlowProvider>
  )
};
