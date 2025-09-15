import Layout from './components/Layout/Layout';
import InputPanel from './components/InputPanel/InputPanel';
import ViewerPanel from './components/ViewerPanel/ViewerPanel';
import { ProcessingPipelineProvider } from './contexts/ProcessingPipelineContext';
import './styles/App.css';

function App() {
  return (
    <ProcessingPipelineProvider>
      <Layout>
        <InputPanel />
        <ViewerPanel />
      </Layout>
    </ProcessingPipelineProvider>
  );
}

export default App;
