import Layout from './components/Layout/Layout';
import InputPanel from './components/InputPanel/InputPanel';
import ViewerPanel from './components/ViewerPanel/ViewerPanel';
import { DiagramProvider } from './context/DiagramContext';
import './styles/App.css';

function App() {
  return (
    <DiagramProvider>
      <Layout>
        <InputPanel />
        <ViewerPanel />
      </Layout>
    </DiagramProvider>
  );
}

export default App;
